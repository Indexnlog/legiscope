"""
법안에 KSIC 코드 자동 태깅
bills.ksic_codes 컬럼에 배열로 저장

SKIP_LAW_KEYWORDS에 해당하는 법안은 태깅 시도 없이
'intentional_skip' 표시로 건너뜀 (미래 추적용)
"""

from mapper.ksic_ruleset import KEYWORD_TO_KSIC, SKIP_LAW_KEYWORDS
from db.client import get_client


def is_skip(bill_name: str) -> bool:
    """의도적 미매핑 법률 여부 판단 — SKIP_LAW_KEYWORDS 키워드 포함 시 True"""
    for kw in SKIP_LAW_KEYWORDS:
        if kw in bill_name:
            return True
    return False


def tag_bill(bill_name: str) -> list[str]:
    """법안명에서 KSIC 코드 추출. SKIP 대상이면 ['SKIP'] 반환"""
    if is_skip(bill_name):
        return ["SKIP"]
    matched = set()
    for keyword, codes in KEYWORD_TO_KSIC.items():
        if keyword in bill_name:
            matched.update(codes)
    return sorted(matched)


def apply_to_all():
    db = get_client()
    total = 0
    tagged = 0
    skipped = 0
    page = 0
    PAGE_SIZE = 1000

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

        updates = []
        for row in rows:
            name = row["bill_name"] or ""
            codes = tag_bill(name)
            updates.append({"bill_id": row["bill_id"], "ksic_codes": codes})
            if is_skip(name):
                skipped += 1

        # 배치 upsert — 에러 체크 포함
        r = db.table("bills").upsert(updates, on_conflict="bill_id").execute()
        if hasattr(r, "error") and r.error:
            print(f"  [오류] page {page}: {r.error}")

        tagged += sum(1 for u in updates if u["ksic_codes"] and u["ksic_codes"] != ["SKIP"])
        total += len(rows)
        print(f"처리: {total}건 | KSIC 매칭: {tagged}건 | SKIP: {skipped}건")
        page += 1

    truly_unmapped = total - tagged - skipped
    print(f"\n완료: 전체 {total}건")
    print(f"  태깅됨      : {tagged}건 ({tagged/total*100:.1f}%)")
    print(f"  의도적 SKIP : {skipped}건 ({skipped/total*100:.1f}%) - 세제/선거/행정/사법/노동/보훈/치안")
    print(f"  진짜 미매핑 : {truly_unmapped}건 ({truly_unmapped/total*100:.1f}%) - 개선 여지")


if __name__ == "__main__":
    apply_to_all()
