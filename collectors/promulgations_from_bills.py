"""
⑤-임시 공포법령 대체 수집기
법제처 DRF API 활성화 전까지 bills 테이블의 가결 법안으로 promulgations 채우기

조건: proc_result_cd IN ('원안가결', '수정가결')
     → 국회 본회의 통과 = 실질적으로 공포 확정

주의: id는 'bill:{bill_id}' 형식으로 생성 (DRF API 활성화 시 덮어쓰기 대상)
"""

import time

from db.client import get_client

PASS_CODES = ("원안가결", "수정가결")
PAGE_SIZE = 500
ID_PREFIX = "bill:"


def fetch_passed_bills(db) -> list[dict]:
    """가결된 법안 전체 로드"""
    all_rows, page = [], 0
    while True:
        rows = (
            db.table("bills")
            .select(
                "bill_id, bill_name, committee, proc_dt, "
                "proc_result_cd, ksic_codes"
            )
            .in_("proc_result_cd", list(PASS_CODES))
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .execute()
            .data
        )
        if not rows:
            break
        all_rows.extend(rows)
        page += 1
    return all_rows


def bills_to_promulgations(bills: list[dict]) -> list[dict]:
    rows = []
    for b in bills:
        rows.append({
            "id":            ID_PREFIX + b["bill_id"],
            "law_name":      b["bill_name"],
            "promulgate_no": None,               # 실제 공포번호 미확보
            "promulgate_dt": b.get("proc_dt"),   # 본회의 처리일 = 공포일 근사치
            "enforce_dt":    None,               # 시행일 미확보
            "ministry":      b.get("committee"), # 소관 상임위를 부처 대신 사용
            "bill_id":       b["bill_id"],
            "ksic_codes":    b.get("ksic_codes") or [],
        })
    return rows


def save_batch(db, rows: list[dict]) -> int:
    if not rows:
        return 0
    res = db.table("promulgations").upsert(rows, on_conflict="id").execute()
    if hasattr(res, "error") and res.error:
        print(f"  [오류] {res.error}")
        return 0
    return len(rows)


def run():
    db = get_client()

    print("가결 법안 로드 중...")
    bills = fetch_passed_bills(db)
    print(f"  {len(bills)}건 조회 완료")

    rows = bills_to_promulgations(bills)

    total = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i : i + 100]
        saved = save_batch(db, chunk)
        total += saved
        print(f"  {i + len(chunk)}/{len(rows)}건 저장...")
        time.sleep(0.2)

    print(f"\npromulgations 채우기 완료: {total}건")
    print("※ 실제 공포번호/시행일은 법제처 DRF API 활성화 후 덮어씌워집니다.")


if __name__ == "__main__":
    run()
