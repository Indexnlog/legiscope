"""
입법 레이더 주간 트리거 감지 + 월간 리포트 생성기
실행: PYTHONPATH=. python article_weekly.py
     PYTHONPATH=. python article_weekly.py --monthly
     PYTHONPATH=. python article_weekly.py --slack        (Slack 전송 포함)
     PYTHONPATH=. python article_weekly.py --draft        (Claude API 초안 생성)
"""
import csv
import sys
import argparse
import io
from datetime import date, timedelta
from collections import defaultdict
from db.client import get_client

sys.stdout.reconfigure(encoding="utf-8")

TODAY = date.today()
WEEK_AGO = TODAY - timedelta(days=7)
MONTH_AGO = TODAY - timedelta(days=30)

KSIC_NAME = {
    "582": "소프트웨어 개발·공급업", "620": "컴퓨터 프로그래밍·시스템통합",
    "631": "자료처리·호스팅·포털", "639": "기타 정보 서비스업",
    "611": "유선통신업", "612": "이동통신업",
    "261": "반도체 제조업", "262": "전자부품 제조업",
    "291": "자동차 제조업", "292": "자동차 부품 제조업",
    "201": "기초화학물질 제조업", "211": "의약품 제조업",
    "324": "의료기기 제조업", "861": "병원", "862": "의원",
    "351": "전기업", "352": "가스업",
    "381": "폐기물 수집운반업", "382": "폐기물 처리업",
    "410": "건물 건설업", "671": "부동산 임대업", "672": "부동산 개발·공급업",
    "641": "은행·저축기관", "642": "투자기관", "651": "보험업",
}

# EU/미국 연동 법안 키워드 → 참조 규제명
INTL_KEYWORDS = {
    "디지털시장법": "EU 디지털시장법(DMA)",
    "플랫폼 독점": "EU 디지털시장법(DMA)",
    "인공지능 기본법": "EU AI Act",
    "AI 기본법": "EU AI Act",
    "인공지능법": "EU AI Act",
    "반도체 지원": "미국 CHIPS Act",
    "반도체 특별법": "미국 CHIPS Act",
    "탄소국경": "EU 탄소국경조정제도(CBAM)",
    "탄소세": "EU 탄소국경조정제도(CBAM)",
    "공급망 실사": "EU 공급망 실사법(CSDDD)",
    "가상자산 규제": "EU MiCA",
    "스테이블코인": "EU MiCA",
    "개인정보 이동권": "EU GDPR",
    "데이터이동성": "EU GDPR",
}

PASSED = {"원안가결", "수정가결"}
DEAD = {"임기만료폐기", "폐기", "철회", "대안반영폐기"}


def load_bills():
    with open("output/bills_by_ksic.csv", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def industry_name(ksic_code):
    return KSIC_NAME.get(ksic_code[:3], ksic_code[:3])


def fmt_bill(b, show_date="proc"):
    dt = b.get("proc_dt") or b.get("propose_dt") or ""
    name = b["bill_name"][:52]
    ind = industry_name(b["ksic_code"])
    result = b.get("proc_result_cd", "")
    return f"  [{ind}] {name}\n    → {result} | {dt}"


# ─── 트리거 A: 규제 법안 가결 (최근 7일) ──────────────────────────
def trigger_reg_passed(bills):
    recent = [
        b for b in bills
        if b["regulation_type"] == "규제"
        and b["proc_result_cd"] in PASSED
        and b.get("proc_dt", "") >= str(WEEK_AGO)
    ]
    seen, unique = set(), []
    for b in recent:
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)
    return unique


# ─── 트리거 B: 동일 이슈 3건 이상 집중 발의 (최근 30일) ──────────
# 691(공공행정 버킷) 제외: 너무 광범위한 catch-all 코드
EXCLUDE_KSIC_PREFIX = {"691", "841", "851", "854", "881"}

def trigger_cluster(bills):
    # 691 등 catch-all 제외 + 최근 30일
    recent = [
        b for b in bills
        if b.get("propose_dt", "") >= str(MONTH_AGO)
        and b["ksic_code"][:3] not in EXCLUDE_KSIC_PREFIX
    ]
    # bill_id 기준 중복 제거 (같은 법안이 여러 KSIC에 매핑될 수 있음)
    seen_id = set()
    deduped = []
    for b in recent:
        if b["bill_id"] not in seen_id:
            seen_id.add(b["bill_id"])
            deduped.append(b)

    # 법안명 앞 15자 기준 클러스터링
    cluster = defaultdict(list)
    for b in deduped:
        key = b["bill_name"][:15].strip()
        cluster[key].append(b)

    hits = {k: v for k, v in cluster.items() if len(v) >= 3}
    # 건수 많은 순 정렬
    return dict(sorted(hits.items(), key=lambda x: len(x[1]), reverse=True))


# ─── 트리거 C: EU·미국 규제 연동 법안 (최근 30일) ────────────────
def trigger_intl(bills):
    recent = [b for b in bills if b.get("propose_dt", "") >= str(MONTH_AGO)]
    results = []
    seen = set()
    for b in recent:
        for kw, ref in INTL_KEYWORDS.items():
            if kw in b["bill_name"] and b["bill_name"] not in seen:
                seen.add(b["bill_name"])
                results.append((b, ref))
                break
    return results


# ─── 트리거 D: 계류 중인 규제 법안 상태 변화 감지 ────────────────
def trigger_pending_moved(bills):
    """규제 법안 중 최근 7일 내 상임위 결과가 생긴 것"""
    moved = [
        b for b in bills
        if b["regulation_type"] == "규제"
        and b.get("committee_result", "")
        and b.get("committee_dt", "") >= str(WEEK_AGO)
        and b["proc_result_cd"] not in PASSED | DEAD
    ]
    seen, unique = set(), []
    for b in moved:
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)
    return unique


# ─── 월간: risk_score 등락 ────────────────────────────────────────
def monthly_risk_change():
    db = get_client()
    # 최신 2개 스냅샷 날짜 가져오기
    res = db.table("industry_signals")\
        .select("as_of_date")\
        .order("as_of_date", desc=True)\
        .limit(100)\
        .execute()
    dates = sorted(set(r["as_of_date"] for r in res.data), reverse=True)
    if len(dates) < 2:
        return [], []

    latest, prev = dates[0], dates[1]
    cur = {r["ksic_code"]: r for r in db.table("industry_signals")
           .select("*").eq("as_of_date", latest).execute().data}
    old = {r["ksic_code"]: r for r in db.table("industry_signals")
           .select("*").eq("as_of_date", prev).execute().data}

    changes = []
    for code, c in cur.items():
        if code not in old:
            continue
        delta = float(c.get("risk_score") or 0) - float(old[code].get("risk_score") or 0)
        if abs(delta) >= 0.5:
            changes.append({
                "name": KSIC_NAME.get(code[:3], code),
                "code": code,
                "cur": float(c.get("risk_score") or 0),
                "prev": float(old[code].get("risk_score") or 0),
                "delta": delta,
            })

    changes.sort(key=lambda x: x["delta"])
    up = [c for c in changes if c["delta"] > 0][:5]
    down = [c for c in changes if c["delta"] < 0][:5]
    return up, down, latest, prev


# ─── 월간: 임기만료 위험 법안 ────────────────────────────────────
def monthly_expiry_risk(bills):
    """22대 발의 후 18개월 이상 계류 중인 규제 법안"""
    cutoff = str(TODAY - timedelta(days=548))  # 18개월
    stale = [
        b for b in bills
        if b["regulation_type"] == "규제"
        and b.get("propose_dt", "") <= cutoff
        and b["proc_result_cd"] not in PASSED | DEAD
        and b.get("propose_dt", "") >= "2024-05-30"  # 22대만
    ]
    seen, unique = set(), []
    for b in sorted(stale, key=lambda x: x.get("propose_dt", "")):
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)
    return unique[:15]


# ─── 출력 ─────────────────────────────────────────────────────────
def print_weekly_brief(bills):
    print("=" * 65)
    print(f"입법 레이더 주간 트리거 브리프 ({TODAY})")
    print("=" * 65)

    article_count = 0

    # A. 규제 법안 가결
    passed = trigger_reg_passed(bills)
    if passed:
        article_count += 1
        print(f"\n🔴 [즉시 기사감 A] 규제 법안 가결 ({len(passed)}건)")
        print(f"   기사 각도: '○○법 통과 — 기업 영향과 대응 방법'")
        print(f"   기간: {WEEK_AGO} ~ {TODAY}")
        for b in passed[:5]:
            print(fmt_bill(b))
    else:
        print(f"\n⚪ [A] 이번 주 규제 법안 가결 없음")

    # B. 집중 발의 클러스터
    clusters = trigger_cluster(bills)
    if clusters:
        article_count += 1
        print(f"\n🔴 [즉시 기사감 B] 동일 이슈 집중 발의 클러스터 ({len(clusters)}개)")
        print(f"   기사 각도: '국회가 ○○산업을 겨냥했다'")
        for key, group in list(clusters.items())[:5]:
            ind = industry_name(group[0]["ksic_code"])
            print(f"  [{ind}] '{key}…' 관련 {len(group)}건")
            for b in group[:2]:
                print(f"      - {b['bill_name'][:50]} ({b['propose_dt']})")
    else:
        print(f"\n⚪ [B] 이번 달 집중 발의 클러스터 없음")

    # C. EU/미국 연동
    intl = trigger_intl(bills)
    if intl:
        article_count += 1
        print(f"\n🔴 [즉시 기사감 C] 국제 규제 연동 법안 ({len(intl)}건)")
        print(f"   기사 각도: '한국판 ○○ 나오나'")
        for b, ref in intl[:5]:
            print(f"  [참조: {ref}] {b['bill_name'][:50]}")
            print(f"      → 발의 {b['propose_dt']} | {b['committee']}")
    else:
        print(f"\n⚪ [C] 이번 달 국제 연동 법안 없음")

    # D. 계류 법안 움직임
    moved = trigger_pending_moved(bills)
    if moved:
        article_count += 1
        print(f"\n🔴 [즉시 기사감 D] 계류 규제법안 심사 진전 ({len(moved)}건)")
        print(f"   기사 각도: '잠자던 ○○법, 이번엔 통과되나'")
        for b in moved[:5]:
            print(f"  {b['bill_name'][:52]}")
            print(f"      → 상임위 결과: {b.get('committee_result','')} ({b.get('committee_dt','')})")
    else:
        print(f"\n⚪ [D] 이번 주 계류 규제법안 심사 진전 없음")

    print(f"\n{'─'*65}")
    if article_count > 0:
        print(f"✅ 이번 주 기사 소재 {article_count}개 감지됨 → 기사 작성 권고")
    else:
        print(f"⏸  이번 주 즉시 기사감 없음 → 패스 (월간 리포트 준비)")
    print(f"{'─'*65}")


def print_monthly_report(bills):
    print("=" * 65)
    print(f"입법 레이더 월간 리포트 브리프 ({TODAY.strftime('%Y년 %m월')})")
    print("=" * 65)

    # risk_score 등락
    print("\n📊 [월간 A] 규제 리스크 등락 산업")
    try:
        result = monthly_risk_change()
        if len(result) == 4:
            up, down, latest, prev = result
            print(f"   비교: {prev} → {latest}")
            print(f"   기사 각도: '이달 규제 리스크 오른 산업, 내린 산업'")
            print(f"\n   ▲ 리스크 상승:")
            for c in up:
                print(f"     {c['name']:25s}  {c['prev']:.2f} → {c['cur']:.2f}  (+{c['delta']:.2f})")
            print(f"\n   ▼ 리스크 하락:")
            for c in down:
                print(f"     {c['name']:25s}  {c['prev']:.2f} → {c['cur']:.2f}  ({c['delta']:.2f})")
        else:
            print("   스냅샷 2개 이상 필요 (현재 1개)")
    except Exception as e:
        print(f"   Supabase 조회 오류: {e}")

    # 임기만료 위험
    stale = monthly_expiry_risk(bills)
    print(f"\n⏰ [월간 B] 22대 계류 규제법안 중 18개월+ 방치 ({len(stale)}건)")
    print(f"   기사 각도: '이번 회기 못 넘기면 폐기되는 법안들'")
    for b in stale[:10]:
        ind = industry_name(b["ksic_code"])
        print(f"  [{ind}] {b['bill_name'][:50]}")
        print(f"      → 발의 {b['propose_dt']} | {b['committee']}")

    # 이달 가결 요약
    this_month = str(TODAY.replace(day=1))
    passed_this_month = [
        b for b in bills
        if b["proc_result_cd"] in PASSED
        and b.get("proc_dt", "") >= this_month
    ]
    seen, unique = set(), []
    for b in passed_this_month:
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)

    print(f"\n✅ [월간 C] 이달 가결 법안 총 {len(unique)}건")
    reg_passed = [b for b in unique if b["regulation_type"] == "규제"]
    sup_passed = [b for b in unique if b["regulation_type"] == "지원"]
    print(f"   규제 {len(reg_passed)}건 / 지원 {len(sup_passed)}건 / 중립 {len(unique)-len(reg_passed)-len(sup_passed)}건")
    if reg_passed:
        print(f"   주요 규제 가결:")
        for b in reg_passed[:5]:
            print(f"     - {b['bill_name'][:52]} ({b['proc_dt']})")


def generate_draft_claude(trigger_summary: str, trigger_type: str) -> str:
    """Claude API로 기사 초안 생성"""
    import os
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key or api_key.startswith("여기에"):
        return "[ANTHROPIC_API_KEY 미설정 — .env에 키 추가 필요]"

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        prompt = f"""당신은 경제 전문 기자입니다. 아래 국회 입법 데이터 분석 결과를 바탕으로 경제지 기사 초안을 작성해주세요.

트리거 유형: {trigger_type}
데이터 분석 결과:
{trigger_summary}

요구사항:
- 경제지 독자(기업인, 투자자) 대상
- 제목 1개 + 부제 1개
- 본문 400~600자
- 실제 법안명 인용
- 기업 대응 방향으로 마무리
- 말미에 "본 기사는 Legiscope 입법 모니터링 플랫폼 데이터를 기반으로 작성됐습니다." 포함
- 한국어로 작성"""

        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    except Exception as e:
        return f"[Claude API 오류: {e}]"


def save_to_obsidian(title: str, content: str) -> str:
    """기사 초안을 Obsidian 작업일지 폴더에 저장"""
    import os
    obsidian_dir = (
        r"C:\Users\ekapr\Dropbox\앱\remotely-save\Second_Brain"
        r"\10_Professional\11_Projects\2026 Legiscope\입법 레이더 기사"
    )
    os.makedirs(obsidian_dir, exist_ok=True)
    filename = f"{TODAY} {title[:20].replace('/', '-')}.md"
    path = os.path.join(obsidian_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"---\ntags: [legiscope, 입법레이더, 기사, 자동생성]\ndate: {TODAY}\nstatus: 초안(AI)\n---\n\n")
        f.write(content)
    print(f"✅ Obsidian 저장: {filename}")
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--monthly", action="store_true", help="월간 리포트 모드")
    parser.add_argument("--slack",   action="store_true", help="Slack 전송 포함")
    parser.add_argument("--draft",   action="store_true", help="Claude API 기사 초안 생성")
    args = parser.parse_args()

    bills = load_bills()

    if args.monthly:
        # 월간 모드: 출력 캡처 후 Slack 전송
        buf = io.StringIO()
        sys.stdout = buf
        print_monthly_report(bills)
        sys.stdout = sys.__stdout__
        report_text = buf.getvalue()
        print(report_text)

        if args.slack:
            from utils.slack import send_monthly_report
            send_monthly_report(report_text, str(TODAY))
    else:
        # 주간 모드: 출력 캡처 후 Slack 전송 + 초안 생성
        buf = io.StringIO()
        sys.stdout = buf
        print_weekly_brief(bills)
        sys.stdout = sys.__stdout__
        brief_text = buf.getvalue()
        print(brief_text)

        # 트리거 감지 여부 확인
        passed  = trigger_reg_passed(bills)
        clusters = trigger_cluster(bills)
        intl    = trigger_intl(bills)
        moved   = trigger_pending_moved(bills)
        has_triggers = any([passed, clusters, intl, moved])

        if args.slack:
            from utils.slack import send_weekly_brief
            send_weekly_brief(has_triggers, brief_text, str(TODAY))

        if args.draft and has_triggers:
            # 가장 강한 트리거 선택해서 초안 생성
            if passed:
                trigger_type = "규제 법안 가결"
                key_data = "\n".join([f"- {b['bill_name']} ({b['proc_result_cd']}, {b['proc_dt']})" for b in passed[:3]])
            elif clusters:
                trigger_type = "동일 이슈 집중 발의"
                first_key, first_group = list(clusters.items())[0]
                ind = industry_name(first_group[0]["ksic_code"])
                key_data = f"[{ind}] '{first_key}…' 관련 법안 {len(first_group)}건 집중 발의\n"
                key_data += "\n".join([f"- {b['bill_name']} ({b['propose_dt']})" for b in first_group[:5]])
            elif intl:
                trigger_type = "국제 규제 연동 법안"
                key_data = "\n".join([f"- {b['bill_name']} [참조: {ref}]" for b, ref in intl[:3]])
            else:
                trigger_type = "계류 규제법안 심사 진전"
                key_data = "\n".join([f"- {b['bill_name']} ({b.get('committee_result','')})" for b in moved[:3]])

            print(f"\n📝 Claude API로 기사 초안 생성 중... ({trigger_type})")
            draft = generate_draft_claude(key_data, trigger_type)
            print("\n" + "=" * 65)
            print(draft)
            print("=" * 65)

            # Obsidian 저장
            save_to_obsidian(trigger_type, draft)

            # Slack으로 초안 전송
            if args.slack:
                from utils.slack import send_article_draft
                send_article_draft(trigger_type, draft, str(TODAY))

        print(f"\n💡 월간 리포트: python article_weekly.py --monthly")
        print(f"💡 Slack 전송: python article_weekly.py --slack")
        print(f"💡 기사 초안:  python article_weekly.py --slack --draft")


if __name__ == "__main__":
    main()
