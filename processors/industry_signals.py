"""
산업별 입법활성도 + 규제리스크 지표 계산
KSIC 3자리(중분류) 기준으로 집계

출력:
  signals/industry_signals.csv  ← 산업별 지표 (pdeck 연동용)
  signals/industry_signals_l1.csv ← 대분류(1자리) 집계
"""

import csv
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from db.client import get_client

SIGNALS_DIR = Path(__file__).parent.parent / "signals"
SIGNALS_DIR.mkdir(exist_ok=True)

# 가결로 인정하는 처리결과
PASS_RESULTS = {"원안가결", "수정가결"}
# 처리 완료로 인정하는 처리결과 (계류 제외)
PROCESSED_RESULTS = {"원안가결", "수정가결", "폐기", "부결", "대안반영폐기", "수정안반영폐기", "철회"}


def fetch_bills() -> list[dict]:
    """bills 전체 로드 (ksic_codes, regulation_type, 처리결과 포함)"""
    db = get_client()
    rows = []
    page = 0
    while True:
        r = db.table("bills").select(
            "bill_id, ksic_codes, regulation_type, proc_result_cd, "
            "committee_result, propose_dt, proc_dt"
        ).range(page * 1000, (page + 1) * 1000 - 1).execute()
        if not r.data:
            break
        rows.extend(r.data)
        if len(r.data) < 1000:
            break
        page += 1
    return rows


def compute_signals(bills: list[dict], ksic_level: int = 3) -> list[dict]:
    """
    KSIC 코드 레벨별로 지표 집계

    ksic_level: 3 = 중분류(3자리), 1 = 대분류(1자리)
    """
    cutoff_90d = datetime.now() - timedelta(days=90)

    # KSIC별 집계 버킷
    buckets = defaultdict(lambda: {
        "total": 0,
        "passed": 0,
        "processed": 0,
        "pending": 0,
        "recent_90d": 0,
        "days_to_pass": [],
        "reg": 0,
        "support": 0,
        "neutral": 0,
        "reg_passed": 0,
        "support_passed": 0,
    })

    for bill in bills:
        codes = bill.get("ksic_codes") or []
        if not codes:
            continue

        # KSIC 코드를 지정 레벨로 자름
        level_codes = set()
        for c in codes:
            if isinstance(c, str) and len(c) >= ksic_level:
                level_codes.add(c[:ksic_level])

        proc = bill.get("proc_result_cd") or bill.get("committee_result") or ""
        reg_type = bill.get("regulation_type") or "중립"
        propose_dt = bill.get("propose_dt") or ""
        proc_dt = bill.get("proc_dt") or ""

        is_passed = proc in PASS_RESULTS
        is_processed = proc in PROCESSED_RESULTS
        is_pending = not is_processed

        # 소요일 계산
        days = None
        if is_passed and propose_dt and proc_dt:
            try:
                d1 = datetime.strptime(propose_dt[:10], "%Y-%m-%d")
                d2 = datetime.strptime(proc_dt[:10], "%Y-%m-%d")
                days = max(0, (d2 - d1).days)
            except ValueError:
                pass

        # 최근 90일 여부
        is_recent = False
        if propose_dt:
            try:
                d = datetime.strptime(propose_dt[:10], "%Y-%m-%d")
                is_recent = d >= cutoff_90d
            except ValueError:
                pass

        for code in level_codes:
            b = buckets[code]
            b["total"] += 1
            if is_passed:
                b["passed"] += 1
                if days is not None:
                    b["days_to_pass"].append(days)
            if is_processed:
                b["processed"] += 1
            if is_pending:
                b["pending"] += 1
            if is_recent:
                b["recent_90d"] += 1
            if reg_type == "규제":
                b["reg"] += 1
                if is_passed:
                    b["reg_passed"] += 1
            elif reg_type == "지원":
                b["support"] += 1
                if is_passed:
                    b["support_passed"] += 1
            else:
                b["neutral"] += 1

    # 지표 계산
    results = []
    for code, b in sorted(buckets.items()):
        total = b["total"]
        processed = b["processed"]
        passed = b["passed"]
        reg = b["reg"]
        support = b["support"]

        pass_rate = round(passed / processed * 100, 1) if processed > 0 else 0.0
        reg_ratio = round(reg / total * 100, 1) if total > 0 else 0.0
        reg_pass_rate = 0.0
        if reg > 0:
            # 규제 법안 중 처리된 것 기준 가결률 (처리건 정보 없으므로 전체 대비)
            reg_pass_rate = round(b["reg_passed"] / reg * 100, 1)
        risk_score = round(reg * reg_pass_rate / 100, 1)

        avg_days = None
        if b["days_to_pass"]:
            avg_days = round(sum(b["days_to_pass"]) / len(b["days_to_pass"]))

        results.append({
            "ksic_code": code,
            "ksic_level": ksic_level,
            "total_bills": total,
            "passed_bills": passed,
            "processed_bills": processed,
            "pending_bills": b["pending"],
            "pass_rate": pass_rate,
            "recent_90d_bills": b["recent_90d"],
            "avg_days_to_pass": avg_days,
            "reg_count": reg,
            "support_count": support,
            "neutral_count": b["neutral"],
            "reg_ratio": reg_ratio,
            "reg_pass_rate": reg_pass_rate,
            "risk_score": risk_score,
        })

    return results


def save_csv(rows: list[dict], path: Path):
    if not rows:
        print(f"  데이터 없음: {path.name}")
        return
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    print(f"  저장: {path.name} ({len(rows)}행)")


def save_to_supabase(rows: list[dict], as_of_date: str = None):
    if not rows:
        return
    db = get_client()
    from datetime import timezone, date
    now = datetime.now(timezone.utc).isoformat()
    snapshot_date = as_of_date or date.today().isoformat()
    for r in rows:
        r["updated_at"] = now
        r["as_of_date"] = snapshot_date
    # 50건씩 upsert
    for i in range(0, len(rows), 50):
        chunk = rows[i:i+50]
        result = db.table("industry_signals").upsert(
            chunk, on_conflict="ksic_code,ksic_level,as_of_date"
        ).execute()
        if hasattr(result, 'error') and result.error:
            print(f"  [오류] {result.error}")
    print(f"  Supabase 저장 완료: {len(rows)}행 (기준일: {snapshot_date})")


if __name__ == "__main__":
    print("bills 로드 중...")
    bills = fetch_bills()
    print(f"  {len(bills)}건 로드")

    print("\n중분류(3자리) 지표 계산...")
    signals_l3 = compute_signals(bills, ksic_level=3)
    save_csv(signals_l3, SIGNALS_DIR / "industry_signals.csv")

    print("\n대분류(1자리) 지표 계산...")
    signals_l1 = compute_signals(bills, ksic_level=1)
    save_csv(signals_l1, SIGNALS_DIR / "industry_signals_l1.csv")

    print("\n상위 규제리스크 산업 (중분류 TOP 10):")
    top = sorted(signals_l3, key=lambda x: x["risk_score"], reverse=True)[:10]
    for r in top:
        print(f"  {r['ksic_code']} | 총{r['total_bills']}건 | "
              f"규제{r['reg_count']}건({r['reg_ratio']}%) | "
              f"가결률{r['pass_rate']}% | 리스크점수{r['risk_score']}")

    print("\n상위 입법활성 산업 (최근 90일 TOP 10):")
    top2 = sorted(signals_l3, key=lambda x: x["recent_90d_bills"], reverse=True)[:10]
    for r in top2:
        print(f"  {r['ksic_code']} | 최근90일{r['recent_90d_bills']}건 | "
              f"가결률{r['pass_rate']}% | 평균소요일{r['avg_days_to_pass']}일")

    print("\nSupabase 저장 중...")
    save_to_supabase(signals_l3 + signals_l1)
