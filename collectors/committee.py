"""
③ 상임위 심사 데이터 보강
국회 OpenAPI nzmimeepazxkubdpn (법률안 상세정보)에서
committee_result, committee_dt, proc_dt 를 가져와 bills 테이블 업데이트
"""

import time
import requests
from config import ASSEMBLY_KEY
from db.client import get_client

BASE_URL = "https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn"


def fetch_bill_detail(page: int = 1, page_size: int = 100, age: int = 22) -> list[dict]:
    """법률안 상세정보 조회 (페이지네이션)"""
    params = {
        "KEY": ASSEMBLY_KEY,
        "Type": "json",
        "pIndex": page,
        "pSize": page_size,
        "AGE": age,
    }

    resp = requests.get(BASE_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    try:
        rows = data["nzmimeepazxkubdpn"][1]["row"]
    except (KeyError, IndexError):
        # 데이터 없음 (마지막 페이지)
        return []

    results = []
    for row in rows:
        results.append({
            "bill_id":          row.get("BILL_ID"),
            "committee_result": row.get("CMT_PROC_RESULT_CD"),  # 상임위 심사결과 코드
            "committee_dt":     row.get("CMT_PROC_DT"),         # 상임위 심사일
            "proc_dt":          row.get("PROC_DT"),             # 최종처리일
        })

    return results


def update_committee_info(rows: list[dict]) -> int:
    """bills 테이블의 상임위 심사 컬럼 업데이트 (bill_id 기준 upsert)"""
    if not rows:
        return 0

    db = get_client()
    # bill_id 없는 행 제거
    valid = [r for r in rows if r.get("bill_id")]
    if valid:
        db.table("bills").upsert(valid, on_conflict="bill_id").execute()
    return len(valid)


def debug_first_row():
    """API 응답 구조 확인용 (첫 번째 행 출력)"""
    params = {
        "KEY": ASSEMBLY_KEY,
        "Type": "json",
        "pIndex": 1,
        "pSize": 1,
        "AGE": 22,
    }
    resp = requests.get(BASE_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    import json
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--debug":
        print("=== API 응답 구조 확인 ===")
        debug_first_row()
    else:
        print("22대 국회 상임위 심사 데이터 보강 시작...")
        total = 0
        page = 1

        while True:
            rows = fetch_bill_detail(page=page, page_size=100)
            if not rows:
                print(f"  → page {page}: 데이터 없음, 종료")
                break

            updated = update_committee_info(rows)
            total += updated
            print(f"page {page}: {updated}건 업데이트 | 누적: {total}건")
            page += 1
            time.sleep(0.3)   # API 부하 방지

        print(f"\n완료: 총 {total}건 상임위 심사 데이터 업데이트")
