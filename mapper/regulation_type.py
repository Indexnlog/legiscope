"""
규제/지원 분류 키워드 사전
법안명을 보고 규제(burden) / 지원(support) / 중립(neutral)으로 분류

반환값:
  "규제"  - 기업 활동에 부담/제한을 주는 법안
  "지원"  - 기업 활동을 촉진/지원하는 법안
  "중립"  - 판단 불가 (조직법, 절차법, 정의 개정 등)
"""

# ── 규제 키워드 ─────────────────────────────────────────────────────────────
# 의미: 금지·제한·처벌·의무부과·허가강화 등 기업 부담 증가
REGULATION_KEYWORDS: list[str] = [
    # 금지·제한
    "금지", "제한", "규제", "제재", "금지행위", "행위제한",
    "금지조항", "영업제한", "영업금지", "사용제한", "사용금지",
    # 처벌·과징금
    "과징금", "벌칙", "처벌", "과태료", "형사처벌", "징역", "벌금",
    "과징금부과", "행정처분", "영업정지", "허가취소", "등록취소",
    # 의무·부담
    "의무화", "강제", "부과", "신고의무", "보고의무", "공시의무",
    "안전기준강화", "기준강화", "인증의무", "허가의무",
    "정보보호의무", "개인정보보호",
    # 허가·진입규제
    "허가", "인가", "등록", "면허", "자격", "승인", "심사강화",
    "진입규제", "시장진입",
    # 소비자·환경 규제
    "소비자보호", "환경기준", "배출기준", "안전기준", "품질기준",
    # 노동 규제
    "최저임금", "근로시간", "노동", "산업재해", "안전보건",
]

# ── 지원 키워드 ─────────────────────────────────────────────────────────────
# 의미: 보조금·세제혜택·규제완화·인프라 지원 등 기업 혜택
SUPPORT_KEYWORDS: list[str] = [
    # 세제 지원
    "세액공제", "감면", "세제지원", "소득공제", "세금감면",
    "면세", "비과세", "조세특례", "관세감면",
    # 보조금·자금
    "지원금", "보조금", "융자", "출연금", "보조", "지원",
    "육성", "진흥", "촉진", "활성화", "장려",
    # 규제 완화
    "규제완화", "특례", "완화", "간소화", "절차간소화",
    "면제", "적용제외", "적용면제", "특구", "자유무역",
    # 인프라·생태계
    "기반조성", "인프라", "생태계", "클러스터", "단지조성",
    "연구개발", "R&D", "기술개발", "혁신",
    # 중소기업·스타트업
    "중소기업", "벤처기업", "스타트업", "창업", "소상공인",
    "중소벤처", "창업지원", "벤처투자",
    # 수출·투자
    "수출지원", "투자유치", "외국인투자", "해외진출",
    # 금융 지원
    "신용보증", "정책금융", "기술금융", "투자지원",
]

# ── 중립 키워드 ─────────────────────────────────────────────────────────────
# 조직·절차 개편, 정의 변경, 단순 연장 등
NEUTRAL_KEYWORDS: list[str] = [
    "조직", "직제", "기구", "위원회설치", "위원회구성",
    "유효기간연장", "일몰연장", "기간연장",
    "정의", "용어정의", "용어변경",
    "이관", "소관", "관할",
]


def classify(law_name: str) -> str:
    """
    법안명으로 규제/지원/중립 분류

    Returns:
        "규제" | "지원" | "중립"
    """
    reg_score  = sum(1 for kw in REGULATION_KEYWORDS if kw in law_name)
    sup_score  = sum(1 for kw in SUPPORT_KEYWORDS    if kw in law_name)
    neu_score  = sum(1 for kw in NEUTRAL_KEYWORDS    if kw in law_name)

    # 중립 키워드가 있고 규제/지원이 없으면 중립
    if neu_score > 0 and reg_score == 0 and sup_score == 0:
        return "중립"

    if reg_score == 0 and sup_score == 0:
        return "중립"

    if reg_score > sup_score:
        return "규제"
    if sup_score > reg_score:
        return "지원"

    # 동점: 규제 우선 (보수적 분류)
    return "규제"


def apply_to_bills():
    """
    bills 테이블 전체에 regulation_type 컬럼 업데이트
    (schema에 컬럼이 있어야 함 — 없으면 아래 SQL 먼저 실행)

    ALTER TABLE bills ADD COLUMN IF NOT EXISTS regulation_type text;
    """
    from db.client import get_client

    db = get_client()
    page = 0
    PAGE_SIZE = 1000
    total = 0
    buckets: dict[str, list[str]] = {"규제": [], "지원": [], "중립": []}

    # 1단계: 전체 읽어서 분류
    while True:
        result = (
            db.table("bills")
            .select("bill_id, bill_name")
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .execute()
        )
        rows = result.data
        if not rows:
            break
        for row in rows:
            t = classify(row["bill_name"] or "")
            buckets[t].append(row["bill_id"])
        total += len(rows)
        page += 1

    print(f"읽기 완료: {total}건 -> 업데이트 시작")

    # 2단계: 타입별 bulk update (500건씩 청크)
    CHUNK = 500
    for reg_type, ids in buckets.items():
        updated = 0
        for i in range(0, len(ids), CHUNK):
            chunk = ids[i : i + CHUNK]
            r = db.table("bills").update({"regulation_type": reg_type}).in_("bill_id", chunk).execute()
            if hasattr(r, "error") and r.error:
                print(f"  [오류] {reg_type} {i}~{i+len(chunk)}: {r.error}")
            updated += len(chunk)
        pct = len(ids) / total * 100 if total else 0
        print(f"  {reg_type}: {len(ids)}건 ({pct:.1f}%) 업데이트 완료")

    print(f"\n완료: 총 {total}건")


def apply_to_promulgations():
    """
    promulgations 테이블 전체에 regulation_type 업데이트
    (ALTER TABLE promulgations ADD COLUMN IF NOT EXISTS regulation_type text; 먼저 실행)
    """
    from db.client import get_client

    db = get_client()
    page = 0
    PAGE_SIZE = 1000
    total = 0
    buckets: dict[str, list[int]] = {"규제": [], "지원": [], "중립": []}

    while True:
        result = (
            db.table("promulgations")
            .select("id, law_name")
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .execute()
        )
        rows = result.data
        if not rows:
            break
        for row in rows:
            t = classify(row["law_name"] or "")
            buckets[t].append(row["id"])
        total += len(rows)
        page += 1

    print(f"읽기 완료: {total}건 -> 업데이트 시작")

    CHUNK = 500
    for reg_type, ids in buckets.items():
        for i in range(0, len(ids), CHUNK):
            chunk = ids[i : i + CHUNK]
            r = db.table("promulgations").update({"regulation_type": reg_type}).in_("id", chunk).execute()
            if hasattr(r, "error") and r.error:
                print(f"  [오류] {reg_type}: {r.error}")
        pct = len(ids) / total * 100 if total else 0
        print(f"  {reg_type}: {len(ids)}건 ({pct:.1f}%)")

    print(f"완료: 총 {total}건")


if __name__ == "__main__":
    import sys
    if "--apply" in sys.argv:
        # 실제 DB 적용 (스케줄러/수동 실행용)
        apply_to_bills()
    elif "--apply-promulgations" in sys.argv:
        apply_to_promulgations()
    else:
        # 단순 테스트
        samples = [
            "금융회사 개인정보보호 및 과징금 부과에 관한 법률 일부개정법률안",
            "중소벤처기업 창업지원 및 세액공제 특례에 관한 법률안",
            "금융위원회의 설치 등에 관한 법률 일부개정법률안",
            "최저임금법 일부개정법률안",
            "K-스타트업 육성 및 투자지원에 관한 법률안",
        ]
        for s in samples:
            print(f"[{classify(s)}] {s[:50]}")
        print("\n실제 DB 적용은: python -m mapper.regulation_type --apply")
