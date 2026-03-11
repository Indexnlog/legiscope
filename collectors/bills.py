"""
② 법률안 발의 수집기
open.assembly.go.kr 의안정보 통합 API
"""

import requests
from config import ASSEMBLY_KEY
from db.client import get_client

BASE_URL = "https://open.assembly.go.kr/portal/openapi/TVBPMBILL11"


def fetch_bills(page: int = 1, page_size: int = 10, age: int = 22) -> list[dict]:
    """
    법률안 목록 조회
    age: 국회 대수 (22 = 22대 국회, 현재)
    """
    params = {
        "KEY": ASSEMBLY_KEY,
        "Type": "json",
        "pIndex": page,
        "pSize": page_size,
        "AGE": age,
    }

    resp = requests.get(BASE_URL, params=params, timeout=10)
    resp.raise_for_status()

    data = resp.json()

    try:
        rows = data["TVBPMBILL11"][1]["row"]
    except (KeyError, IndexError) as e:
        print(f"[ERROR] 파싱 실패: {e}")
        print(data)
        return []

    bills = []
    for row in rows:
        bills.append({
            "bill_id":          row.get("BILL_ID"),
            "bill_no":          row.get("BILL_NO"),
            "bill_name":        row.get("BILL_NAME"),
            "proposer":         row.get("PROPOSER"),
            "rst_proposer":     row.get("RST_PROPOSER"),
            "proposer_kind":    row.get("PROPOSER_KIND"),
            "committee":        row.get("CURR_COMMITTEE"),
            "propose_dt":       row.get("PROPOSE_DT"),
            "pass_gubun":       row.get("PASS_GUBUN"),       # 계류의안 / 가결 / 부결
            "proc_result_cd":   row.get("PROC_RESULT_CD"),
            "age":              row.get("AGE"),
            "link_url":         row.get("LINK_URL"),
        })

    return bills


def save_bills(bills: list[dict]) -> int:
    """
    법률안 목록을 Supabase에 저장 (중복은 덮어쓰기)
    반환값: 저장된 건수
    """
    if not bills:
        return 0

    db = get_client()
    db.table("bills").upsert(bills, on_conflict="bill_id").execute()
    return len(bills)


if __name__ == "__main__":
    print("22대 국회 법률안 전체 수집 시작...")
    PAGE_SIZE = 100
    total = 0
    page = 1

    while True:
        bills = fetch_bills(page=page, page_size=PAGE_SIZE)
        if not bills:
            break
        saved = save_bills(bills)
        total += saved
        print(f"page {page} 완료 ({saved}건) | 누적: {total}건")
        page += 1

    print(f"\n완료: 총 {total}건 저장")
