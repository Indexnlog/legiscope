"""
Legiscope 리포트
산업별 입법 현황 + 입법활성도 + 규제리스크 지표
"""

from collections import defaultdict
from db.client import get_client

# 피치덱 카테고리 이름 매핑
PDECK_CATEGORIES = {
    "0101": "소프트웨어", "0102": "SaaS", "0103": "반도체",
    "0104": "데이터센터/클라우드", "0105": "인공지능/머신러닝",
    "0106": "소셜미디어/플랫폼", "0107": "모바일/통신",
    "0201": "컴퓨터/주변기기", "0202": "반도체/전자부품", "0203": "드론/로보틱스",
    "0301": "일반기계/정밀기계", "0302": "전자기기", "0303": "산업장비",
    "0401": "운송서비스", "0402": "운송장비/부품", "0403": "자율주행",
    "0404": "차량공유/렌탈", "0405": "물류SW/공급망",
    "0501": "핀테크", "0502": "프롭테크", "0503": "블록체인/암호화폐",
    "0504": "자산관리", "0505": "은행/증권/보험", "0506": "금융DB/SW", "0507": "세무/회계",
    "0601": "신에너지/재생에너지", "0602": "석유/가스/광업",
    "0603": "농업/애그테크", "0604": "에너지저장", "0605": "환경기술",
    "0701": "전자상거래", "0702": "도소매", "0703": "소비재",
    "0704": "식품/음료", "0705": "미용/개인관리", "0706": "교육/에드테크",
    "0801": "게임", "0802": "디지털미디어", "0803": "영상/출판/방송",
    "0804": "여행/여가/스포츠", "0805": "공연/전시/음악",
    "0901": "바이오테크", "0902": "의료기기", "0903": "제약",
    "0904": "디지털헬스케어", "0905": "의료서비스", "0906": "시니어케어/요양",
    "9901": "화학", "9902": "금속/비금속", "9903": "부동산",
    "9904": "건축/토목/인프라", "9905": "법률/행정", "9906": "재단/단체",
}

# KSIC → pdeck_category_2 매핑
KSIC_TO_PDECK = {
    "58221": "0101", "58222": "0101", "62010": "0101", "62021": "0101", "62022": "0101", "62090": "0101",
    "63111": "0104", "63112": "0104",
    "26111": "0103", "26112": "0103", "26121": "0103", "26129": "0103",
    "72100": "0105",
    "63120": "0106",
    "61210": "0107", "61220": "0107", "61291": "0107",
    "30323": "0203", "29179": "0203",
    "30121": "0403",
    "64191": "0501", "64199": "0501",
    "35111": "0601", "35112": "0601", "35119": "0601",
    "28202": "0604", "28114": "0604",
    "38110": "0605", "38210": "0605", "39000": "0605",
    "01110": "0603", "01121": "0603",
    "58211": "0801", "58212": "0801", "58219": "0801",
    "60220": "0802",
    "60100": "0803", "60210": "0803",
    "21101": "0901", "21102": "0901",
    "27111": "0902", "27112": "0902",
    "21210": "0903", "21220": "0903",
    "86109": "0904",
    "86101": "0905", "86102": "0905",
    "87100": "0906", "87200": "0906",
    "30110": "0402", "30122": "0402", "30310": "0402",
    "20111": "9901",
    "24111": "9902",
    "68110": "9903",
    "41001": "9904", "42110": "9904",
    "85490": "0706", "85499": "0706",
    "10111": "0704",
    "64110": "0505", "65110": "0505", "64210": "0505",
}


def get_pdeck_code(ksic_codes: list) -> set:
    result = set()
    for k in (ksic_codes or []):
        if k in KSIC_TO_PDECK:
            result.add(KSIC_TO_PDECK[k])
    return result


def load_bills() -> list[dict]:
    db = get_client()
    all_bills = []
    from_idx = 0
    batch = 1000
    while True:
        result = db.table("bills").select(
            "bill_name, propose_dt, pass_gubun, proc_result_cd, ksic_codes, regulation_type, committee"
        ).range(from_idx, from_idx + batch - 1).execute()
        if not result.data:
            break
        all_bills.extend(result.data)
        from_idx += batch
    return all_bills


# ─── 리포트 1: 전체 요약 ───────────────────────────────────────────────────

def report_summary(bills: list[dict]):
    total  = len(bills)
    passed = sum(1 for b in bills if b.get("proc_result_cd") in ("원안가결", "수정가결"))
    reg    = sum(1 for b in bills if b.get("regulation_type") == "규제")
    sup    = sum(1 for b in bills if b.get("regulation_type") == "지원")
    neu    = total - reg - sup

    print("=" * 50)
    print("22대 국회 입법 전체 요약")
    print("=" * 50)
    print(f"  총 법안수:   {total:>6,}건")
    print(f"  가결:        {passed:>6,}건  ({passed/total*100:.1f}%)")
    print(f"  규제 법안:   {reg:>6,}건  ({reg/total*100:.1f}%)")
    print(f"  지원 법안:   {sup:>6,}건  ({sup/total*100:.1f}%)")
    print(f"  중립/미분류: {neu:>6,}건  ({neu/total*100:.1f}%)")


# ─── 리포트 2: 산업별 입법 현황 ────────────────────────────────────────────

def report_by_industry(bills: list[dict]) -> dict:
    category_data: dict[str, dict] = {}

    for bill in bills:
        for code in get_pdeck_code(bill.get("ksic_codes") or []):
            d = category_data.setdefault(code, {
                "total": 0, "passed": 0, "regulation": 0, "support": 0, "bills": []
            })
            d["total"] += 1
            if bill.get("proc_result_cd") in ("원안가결", "수정가결"):
                d["passed"] += 1
            if bill.get("regulation_type") == "규제":
                d["regulation"] += 1
            elif bill.get("regulation_type") == "지원":
                d["support"] += 1
            if len(d["bills"]) < 3:
                d["bills"].append(bill["bill_name"])

    print("\n" + "=" * 70)
    print("산업별 입법 현황 (22대 국회)")
    print("=" * 70)
    print(f"{'산업':<22} {'법안':>5} {'가결':>5} {'규제':>5} {'지원':>5} {'규제비율':>7}")
    print("-" * 70)

    for code, d in sorted(category_data.items(), key=lambda x: -x[1]["total"]):
        name  = PDECK_CATEGORIES.get(code, code)
        total = d["total"]
        ratio = d["regulation"] / total * 100 if total else 0
        print(f"{name:<22} {total:>5} {d['passed']:>5} {d['regulation']:>5} {d['support']:>5} {ratio:>6.0f}%")

    return category_data


# ─── 리포트 3: 입법활성도 (월별 추이) ────────────────────────────────────────

def report_activity(bills: list[dict]):
    monthly: dict[str, int] = defaultdict(int)
    for bill in bills:
        ym = (bill.get("propose_dt") or "")[:7]
        if ym:
            monthly[ym] += 1

    print("\n" + "=" * 45)
    print("월별 입법활성도 (최근 12개월 발의 건수)")
    print("=" * 45)
    for ym in sorted(monthly)[-12:]:
        bar = "█" * (monthly[ym] // 10)
        print(f"  {ym}  {monthly[ym]:>4}건  {bar}")


# ─── 리포트 4: 규제리스크 지수 ────────────────────────────────────────────

def report_risk(category_data: dict):
    print("\n" + "=" * 55)
    print("산업별 규제리스크 지수 (규제법안 비율 기준)")
    print("  위험 40%↑  |  주의 20~40%  |  양호 20%↓")
    print("=" * 55)

    scored = [
        (code, d, d["regulation"] / d["total"])
        for code, d in category_data.items()
        if d["total"] >= 3
    ]

    for code, d, ratio in sorted(scored, key=lambda x: -x[2]):
        name = PDECK_CATEGORIES.get(code, code)
        if ratio >= 0.4:
            level = "위험"
        elif ratio >= 0.2:
            level = "주의"
        else:
            level = "양호"
        print(f"  [{level}]  {name:<22}  {d['regulation']:>3}/{d['total']:>3}건  ({ratio*100:.0f}%)")


def run_report():
    print("데이터 로딩 중...")
    bills = load_bills()
    print(f"총 {len(bills):,}건 로드 완료")

    report_summary(bills)
    category_data = report_by_industry(bills)
    report_activity(bills)
    report_risk(category_data)


if __name__ == "__main__":
    run_report()
