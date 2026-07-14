"""
pdeck 개발자용 CSV 내보내기

출력 파일:
  output/bills_by_ksic.csv   — KSIC 코드별 행 펼친 법안 목록 (JOIN용)
  output/ksic_summary.csv    — KSIC 코드별 통계 요약
"""

import csv
import os
from collections import defaultdict

from db.client import get_client

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")


def fetch_all_bills(db) -> list[dict]:
    """bills 테이블 전체 로드 (1000건씩 페이지)"""
    all_rows, page, PAGE_SIZE = [], 0, 1000
    while True:
        rows = (
            db.table("bills")
            .select(
                "bill_id, bill_name, propose_dt, committee, "
                "proc_result_cd, committee_result, proc_dt, "
                "regulation_type, ksic_codes, link_url"
            )
            # 정렬 고정 필수: ORDER BY 없이 range 페이징하면 페이지 경계에서
            # 행이 무작위로 누락/중복돼 CSV에 법안이 통째로 빠진다(자본시장법 등).
            .order("bill_id")
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .execute()
            .data
        )
        if not rows:
            break
        all_rows.extend(rows)
        page += 1
    return all_rows


def export_bills_by_ksic(bills: list[dict], path: str):
    """
    bills_by_ksic.csv
    한 법안이 여러 KSIC 코드를 가지면 행을 복수로 생성 (unnest)
    pdeck 개발자가 JOIN ON ksic_code 로 사용
    """
    fieldnames = [
        "ksic_code",
        "bill_id",
        "bill_name",
        "propose_dt",
        "committee",
        "proc_result_cd",
        "committee_result",
        "proc_dt",
        "regulation_type",
        "link_url",
    ]
    count = 0
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for bill in bills:
            codes = bill.get("ksic_codes") or []
            if not codes:
                continue
            for code in codes:
                writer.writerow({
                    "ksic_code":        code,
                    "bill_id":          bill["bill_id"],
                    "bill_name":        bill["bill_name"],
                    "propose_dt":       bill["propose_dt"] or "",
                    "committee":        bill["committee"] or "",
                    "proc_result_cd":   bill["proc_result_cd"] or "",
                    "committee_result": bill["committee_result"] or "",
                    "proc_dt":          bill["proc_dt"] or "",
                    "regulation_type":  bill["regulation_type"] or "",
                    "link_url":         bill["link_url"] or "",
                })
                count += 1
    print(f"bills_by_ksic.csv: {count}행 저장")


def export_ksic_summary(bills: list[dict], path: str):
    """
    ksic_summary.csv
    KSIC 코드별 통계 요약 — 기업 KSIC 코드로 바로 조회 가능
    """
    stats: dict[str, dict] = defaultdict(lambda: {
        "total": 0, "passed": 0, "regulation": 0, "support": 0, "neutral": 0
    })

    for bill in bills:
        codes = bill.get("ksic_codes") or []
        reg   = bill.get("regulation_type") or "중립"
        passed = bill.get("proc_result_cd") in ("원안가결", "수정가결", "대안반영폐기")

        for code in codes:
            s = stats[code]
            s["total"] += 1
            if passed:
                s["passed"] += 1
            if reg == "규제":
                s["regulation"] += 1
            elif reg == "지원":
                s["support"] += 1
            else:
                s["neutral"] += 1

    fieldnames = [
        "ksic_code",
        "total_bills",
        "passed_bills",
        "regulation_bills",
        "support_bills",
        "neutral_bills",
        "regulation_ratio",
    ]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for code, s in sorted(stats.items()):
            writer.writerow({
                "ksic_code":        code,
                "total_bills":      s["total"],
                "passed_bills":     s["passed"],
                "regulation_bills": s["regulation"],
                "support_bills":    s["support"],
                "neutral_bills":    s["neutral"],
                "regulation_ratio": round(s["regulation"] / s["total"], 4) if s["total"] else 0,
            })
    print(f"ksic_summary.csv: {len(stats)}개 KSIC 코드 저장")


if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    db = get_client()

    print("bills 로드 중...")
    bills = fetch_all_bills(db)
    print(f"  {len(bills)}건 로드 완료")

    export_bills_by_ksic(bills, os.path.join(OUTPUT_DIR, "bills_by_ksic.csv"))
    export_ksic_summary(bills, os.path.join(OUTPUT_DIR, "ksic_summary.csv"))

    print(f"\n완료. 파일 위치: {OUTPUT_DIR}")
