"""
기존 bills 행에 proposer_members 채우기 (컬럼 추가 후 1회 실행 권장).

  1) db/schema_proposer_members.sql 을 Supabase에서 실행
  2) PYTHONPATH=. python -m collectors.backfill_proposer_members
"""

import time

from db.client import get_client
from utils.proposer_members import extract_member_names

PAGE = 500


def main() -> None:
    db = get_client()
    offset = 0
    total = 0
    while True:
        rows = (
            db.table("bills")
            .select("bill_id,proposer,rst_proposer,proposer_kind")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
        )
        if not rows:
            break
        batch = []
        for r in rows:
            bid = r.get("bill_id")
            if not bid:
                continue
            members = extract_member_names(
                r.get("proposer"),
                r.get("rst_proposer"),
                r.get("proposer_kind"),
            )
            batch.append({"bill_id": bid, "proposer_members": members})
        if batch:
            db.table("bills").upsert(batch, on_conflict="bill_id").execute()
            total += len(batch)
            print(f"  upsert {len(batch)}건 | 누적 {total} (offset {offset})")
        offset += PAGE
        time.sleep(0.15)
    print(f"완료: 총 {total}건 proposer_members 반영")


if __name__ == "__main__":
    main()
