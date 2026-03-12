"""
입법 레이더 일간 트리거 감지
매일 09:00 자동 실행 — 어제 가결/발의된 법안 중 기사감 감지 → Slack 전송

실행: PYTHONPATH=. python article_daily.py
     PYTHONPATH=. python article_daily.py --slack --draft
"""
import sys
import argparse
import io
import os
from datetime import date, timedelta
from collections import defaultdict
from db.client import get_client
from dotenv import load_dotenv

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
            lines.append(f"🔴 [{t['type']}] {t['count']}건 — 기사각도: '{t['angle']}'")
            lines.extend(t["lines"])
            lines.append("")
    else:
        lines.append("⚪ 오늘 즉시 기사감 없음")
    return "\n".join(lines)


def generate_draft_claude(trigger_summary: str, trigger_type: str) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or api_key.startswith("여기에"):
        return "[ANTHROPIC_API_KEY 미설정]"
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        prompt = f"""당신은 경제 전문 기자입니다. 아래 국회 입법 데이터를 바탕으로 경제지 기사 초안을 작성하세요.

트리거: {trigger_type}
데이터:
{trigger_summary}

요구사항:
- 경제지 독자(기업인·투자자) 대상
- 제목은 "[Legiscope] 제목내용" 형식 (대괄호 태그를 제목과 같은 줄에)
- 부제 1개 (제목 바로 다음 줄)
- 본문 400~600자
- 실제 법안명 인용 (법안명은 「」로 감쌀 것)
- 핵심 수치, 법안명, 중요 키워드는 **볼드** 처리
- 기업 대응 방향으로 마무리
- 말미: "이 기사는 News Epoch가 구축한 입법 추적 엔진 Legiscope를 기반으로 작성됐습니다."
- 한국어"""
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    except Exception as e:
        return f"[Claude API 오류: {e}]"


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
    print(f"✅ Obsidian 저장: {filename}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slack", action="store_true", help="Slack 전송")
    parser.add_argument("--draft", action="store_true", help="Claude API 초안 생성")
    args = parser.parse_args()

    print(f"[{TODAY}] 일간 트리거 감지 중... (기준일: {YESTERDAY_STR})")

    try:
        passed_bills, proposed_bills = fetch_yesterday_bills()
    except Exception as e:
        print(f"❌ Supabase 조회 실패: {e}")
        return

    print(f"  어제 가결: {len(passed_bills)}건 / 발의: {len(proposed_bills)}건")

    triggers = check_triggers(passed_bills, proposed_bills)
    brief = build_brief(triggers, passed_bills, proposed_bills)
    print("\n" + brief)

    if not triggers:
        if args.slack:
            from utils.slack import SlackNotifier
            SlackNotifier().send(f"⚪ *입법 레이더 일간* ({YESTERDAY_STR}) — 오늘 기사감 없음")
        return

    # Slack 브리프 전송
    if args.slack:
        from utils.slack import SlackNotifier
        SlackNotifier().send(f"🔴 *입법 레이더 일간 브리프* ({YESTERDAY_STR})\n\n```{brief}```")

    # 가장 강한 트리거로 초안 생성
    if args.draft:
        top = triggers[0]
        key_data = "\n".join(top["lines"])
        print(f"\n📝 Claude API 초안 생성 중... ({top['type']})")
        draft = generate_draft_claude(key_data, top["type"])
        print("\n" + "=" * 65)
        print(draft)
        print("=" * 65)
        save_to_obsidian(top["type"], draft)
        if args.slack:
            from utils.slack import send_article_draft
            send_article_draft(top["type"], draft, str(TODAY))


if __name__ == "__main__":
    main()
