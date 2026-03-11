"""
16,503건 법안에 KSIC 코드 자동 태깅
bills.ksic_codes 컬럼에 배열로 저장
"""

from mapper.ksic_ruleset import KEYWORD_TO_KSIC
from db.client import get_client


def tag_bill(bill_name: str) -> list[str]:
    """법안명에서 KSIC 코드 추출"""
    matched = set()
    for keyword, codes in KEYWORD_TO_KSIC.items():
        if keyword in bill_name:
            matched.update(codes)
    return sorted(matched)


def apply_to_all():
    db = get_client()
    total = 0
    tagged = 0
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
            codes = tag_bill(row["bill_name"] or "")
            updates.append({"bill_id": row["bill_id"], "ksic_codes": codes})

        # 배치 upsert — 에러 체크 포함
        r = db.table("bills").upsert(updates, on_conflict="bill_id").execute()
        if hasattr(r, "error") and r.error:
            print(f"  [오류] page {page}: {r.error}")

        tagged += sum(1 for u in updates if u["ksic_codes"])
        total += len(rows)
        print(f"처리: {total}건 | KSIC 매칭: {tagged}건")
        page += 1

    print(f"\n완료: 전체 {total}건 중 {tagged}건 KSIC 태깅")
    print(f"미매칭: {total - tagged}건")


if __name__ == "__main__":
    apply_to_all()
