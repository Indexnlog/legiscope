"""
입법 레이더 일간 트리거 감지
매일 09:00 자동 실행 — 어제 가결/발의된 법안 중 기사감 감지 → Slack 전송

실행: PYTHONPATH=. python article_daily.py
     PYTHONPATH=. python article_daily.py --slack --draft
     (초안은 article_weekly와 동일: ARTICLE_LLM_PROVIDER / GEMINI_API_KEY·ANTHROPIC_API_KEY)
"""
import sys
import argparse
import io
import os
from datetime import date, timedelta
from collections import defaultdict
from db.client import get_client
from dotenv import load_dotenv
from article_weekly import (
    build_weekly_trigger_whitelist,
    generate_article_draft,
    resolve_article_llm_provider,
)

load_dotenv()
sys.stdout.reconfigure(encoding="utf-8")

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
YESTERDAY_STR = str(YESTERDAY)

PASSED = {"원안가결", "수정가결"}
DEAD = {"임기만료폐기", "폐기", "철회", "대안반영폐기"}

KSIC_NAME = {
    "582": "소프트웨어", "620": "IT서비스", "631": "포털·호스팅", "612": "이동통신",
    "261": "반도체", "291": "자동차", "201": "기초화학", "211": "의약품",
    "861": "병원", "862": "의원", "351": "전기", "381": "폐기물수집",
    "410": "건설", "671": "부동산", "641": "은행", "642": "투자기관", "651": "보험업",
}
EXCLUDE = {"691", "841", "851", "854", "881"}

INTL_KEYWORDS = {
    "디지털시장법": "EU DMA", "플랫폼 독점": "EU DMA",
    "인공지능 기본법": "EU AI Act", "AI 기본법": "EU AI Act",
    "반도체 특별법": "CHIPS Act", "탄소국경": "EU CBAM",
    "가상자산 규제": "EU MiCA", "공급망 실사": "EU CSDDD",
}


def fetch_yesterday_bills():
    """어제 발의되거나 가결된 법안을 Supabase에서 가져옴"""
    db = get_client()

    # 어제 가결
    res_passed = db.table("bills")\
        .select("bill_id,bill_name,committee,proc_result_cd,proc_dt,regulation_type,ksic_codes")\
        .gte("proc_dt", YESTERDAY_STR)\
        .lt("proc_dt", str(TODAY))\
        .in_("proc_result_cd", list(PASSED))\
        .execute()

    # 어제 발의
    res_proposed = db.table("bills")\
        .select("bill_id,bill_name,committee,propose_dt,regulation_type,ksic_codes")\
        .gte("propose_dt", YESTERDAY_STR)\
        .lt("propose_dt", str(TODAY))\
        .execute()

    return res_passed.data or [], res_proposed.data or []


def ind_name(bill):
    codes = bill.get("ksic_codes") or []
    if isinstance(codes, list) and codes:
        return KSIC_NAME.get(str(codes[0])[:3], str(codes[0])[:3])
    return "?"


def check_triggers(passed_bills, proposed_bills):
    """일간 트리거 감지 (임계값 낮춤: 하루치 데이터)"""
    triggers = []

    # A. 규제 법안 가결 (1건 이상)
    reg_passed = [b for b in passed_bills if b.get("regulation_type") == "규제"]
    if reg_passed:
        lines = [f"  - {b['bill_name'][:50]} ({b['proc_result_cd']}, {ind_name(b)})"
                 for b in reg_passed[:5]]
        triggers.append({
            "type": "규제 법안 가결",
            "angle": "○○법 통과 — 기업 영향과 대응 방법",
            "count": len(reg_passed),
            "lines": lines,
            "data": reg_passed,
        })

    # B. 동일 이슈 2건+ 같은 날 발의 (하루치라 임계값 2로 낮춤)
    cluster = defaultdict(list)
    for b in proposed_bills:
        codes = b.get("ksic_codes") or []
        prefix = str(codes[0])[:3] if codes else "000"
        if prefix not in EXCLUDE:
            key = b["bill_name"][:15].strip()
            cluster[key].append(b)
    hot = {k: v for k, v in cluster.items() if len(v) >= 2}
    if hot:
        lines = []
        for key, group in list(hot.items())[:3]:
            lines.append(f"  - '{key}…' {len(group)}건 동시 발의 [{ind_name(group[0])}]")
        triggers.append({
            "type": "동일 이슈 집중 발의",
            "angle": "국회가 ○○산업을 겨냥했다",
            "count": sum(len(v) for v in hot.values()),
            "lines": lines,
            "data": [b for g in hot.values() for b in g],
        })

    # C. EU/미국 연동 법안 발의
    intl = []
    for b in proposed_bills:
        for kw, ref in INTL_KEYWORDS.items():
            if kw in b.get("bill_name", ""):
                intl.append((b, ref))
                break
    if intl:
        lines = [f"  - {b['bill_name'][:50]} [참조: {ref}]" for b, ref in intl[:5]]
        triggers.append({
            "type": "국제 규제 연동 법안",
            "angle": "한국판 ○○ 나오나",
            "count": len(intl),
            "lines": lines,
            "data": [b for b, _ in intl],
        })

    return triggers


def build_brief(triggers, passed_total, proposed_total):
    lines = [
        f"입법 레이더 일간 브리프 ({YESTERDAY_STR})",
        f"어제 가결 {len(passed_total)}건 / 발의 {len(proposed_total)}건",
        "",
    ]
    if triggers:
        for t in triggers:
            lines.append(f"[●] [{t['type']}] {t['count']}건 — 기사각도: '{t['angle']}'")
            lines.extend(t["lines"])
            lines.append("")
    else:
        lines.append("[-] 오늘 즉시 기사감 없음")
    return "\n".join(lines)


def _daily_source_facts_and_whitelist(top: dict) -> tuple[str, frozenset[str]]:
    """트리거별 법안 행 + DB 상세로 SOURCE_FACTS 문자열·화이트리스트 구성."""
    bills = (top.get("data") or [])[:12]
    ids = [b["bill_id"] for b in bills if b.get("bill_id")]
    detail_by_id: dict = {}
    if ids:
        try:
            db = get_client()
            rows = (
                db.table("bills")
                .select(
                    "bill_id,bill_name,propose_dt,proc_dt,proposer,rst_proposer,"
                    "proposer_kind,proposer_members,committee,proposal_reason"
                )
                .in_("bill_id", ids)
                .execute()
                .data
            )
            detail_by_id = {r["bill_id"]: r for r in (rows or [])}
        except Exception:
            detail_by_id = {}

    lines = [f"[일간 트리거] {top['type']}", ""]
    lines.extend(top.get("lines") or [])
    lines.append("")
    for b in bills:
        bid = b.get("bill_id")
        d = detail_by_id.get(bid, {}) if bid else {}
        nm = b.get("bill_name") or ""
        dt = (b.get("proc_dt") or b.get("propose_dt") or "")[:16]
        cm = d.get("committee") or b.get("committee") or ""
        lines.append(f"- {nm} ({dt}, {cm})")
        pr = (d.get("proposer") or b.get("proposer") or "").strip()
        if pr:
            lines.append(f"  발의: {pr[:220]}")
        reason = (d.get("proposal_reason") or "").strip()
        if reason:
            lines.append(f"  제안이유: {reason[:400].replace(chr(10), ' ')}")

    key_data = "\n".join(lines)
    wl = build_weekly_trigger_whitelist(bills, detail_by_id if detail_by_id else None)
    return key_data, wl


def save_to_obsidian(title: str, content: str):
    obsidian_dir = (
        r"C:\Users\ekapr\Dropbox\앱\remotely-save\Second_Brain"
        r"\20_Projects_Builder\21_News_Epoch\2026 입법레이더-Legiscope\01_기사초안"
    )
    os.makedirs(obsidian_dir, exist_ok=True)
    filename = f"{TODAY} {title[:20].replace('/', '-')}.md"
    path = os.path.join(obsidian_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"---\ntags: [legiscope, 입법레이더, 기사, 자동생성]\ndate: {TODAY}\nstatus: 초안(AI)\n---\n\n")
        f.write(content)
    print(f"[OK] Obsidian 저장: {filename}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slack", action="store_true", help="Slack 전송")
    parser.add_argument(
        "--draft",
        action="store_true",
        help="기사 초안 (주간과 동일 LLM·팩트 가드, 기본 Gemini)",
    )
    args = parser.parse_args()

    print(f"[{TODAY}] 일간 트리거 감지 중... (기준일: {YESTERDAY_STR})")

    try:
        passed_bills, proposed_bills = fetch_yesterday_bills()
    except Exception as e:
        print(f"[X] Supabase 조회 실패: {e}")
        return

    print(f"  어제 가결: {len(passed_bills)}건 / 발의: {len(proposed_bills)}건")

    triggers = check_triggers(passed_bills, proposed_bills)
    brief = build_brief(triggers, passed_bills, proposed_bills)
    print("\n" + brief)

    if not triggers:
        if args.slack:
            from utils.slack import SlackNotifier
            SlackNotifier().send(f"[-] *입법 레이더 일간* ({YESTERDAY_STR}) — 오늘 기사감 없음")
        return

    # Slack 브리프 전송
    if args.slack:
        from utils.slack import SlackNotifier
        SlackNotifier().send(f"[●] *입법 레이더 일간 브리프* ({YESTERDAY_STR})\n\n```{brief}```")

    # 가장 강한 트리거로 초안 생성 (article_weekly와 동일 파이프라인)
    if args.draft:
        top = triggers[0]
        key_data, name_wl = _daily_source_facts_and_whitelist(top)
        llm = resolve_article_llm_provider()
        print(f"\n📝 기사 초안 생성 중 ({llm}, {top['type']})...")
        draft = generate_article_draft(
            key_data, top["type"], name_whitelist=name_wl
        )
        print("\n" + "=" * 65)
        print(draft)
        print("=" * 65)
        save_to_obsidian(top["type"], draft)
        if args.slack:
            from utils.slack import send_article_draft
            send_article_draft(top["type"], draft, str(TODAY))


if __name__ == "__main__":
    main()
