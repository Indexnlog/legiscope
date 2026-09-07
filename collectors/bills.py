"""
② 법률안 발의 수집기
open.assembly.go.kr 의안정보 통합 API
"""

import time

import requests
from config import ASSEMBLY_KEY
from db.client import get_client, upsert_chunked
from utils.proposer_members import extract_member_names

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

    data = None
    for attempt in range(3):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            break
        except (requests.RequestException, ValueError) as e:
            print(f"  [재시도 {attempt + 1}/3] page {page}: {e}")
            time.sleep(3 * (attempt + 1))
    if data is None:
        return []

    try:
        rows = data["TVBPMBILL11"][1]["row"]
    except (KeyError, IndexError) as e:
        print(f"[ERROR] 파싱 실패: {e}")
        print(data)
        return []

    bills = []
    for row in rows:
        prop = row.get("PROPOSER")
        rst = row.get("RST_PROPOSER")
        pkind = row.get("PROPOSER_KIND")
        bills.append({
            "bill_id":          row.get("BILL_ID"),
            "bill_no":          row.get("BILL_NO"),
            "bill_name":        row.get("BILL_NAME"),
            "proposer":         prop,
            "rst_proposer":     rst,
            "proposer_kind":    pkind,
            "proposer_members": extract_member_names(prop, rst, pkind),
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

    return upsert_chunked("bills", bills, on_conflict="bill_id")


if __name__ == "__main__":
    print("22대 국회 법률안 전체 수집 시작...")
    # 2026-09-07: pSize 100→1000 (API 최대). 206회→21회 호출.
    # 전량 재수집을 유지하는 이유: 기존 법안의 proc_result_cd/pass_gubun 갱신을 받아야 함.
    PAGE_SIZE = 1000
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
        time.sleep(0.5)

    print(f"\n완료: 총 {total}건 저장")
