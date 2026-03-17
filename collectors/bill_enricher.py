"""
법안 제안이유 보강 수집기
pal.assembly.go.kr에서 제안이유+주요내용을 스크래핑해 bills.proposal_reason에 저장.

실행:
  PYTHONPATH=. python collectors/bill_enricher.py            # 22대 미수집분만
  PYTHONPATH=. python collectors/bill_enricher.py --limit 50 # 최대 50건만
  PYTHONPATH=. python collectors/bill_enricher.py --test     # 약사법 9건으로 테스트
"""
import argparse
import time
import re
import requests
from bs4 import BeautifulSoup
from db.client import get_client

PAL_URL = "https://pal.assembly.go.kr/napal/lgsltpa/lgsltpaOngoing/view.do"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def fetch_proposal_reason(bill_id: str) -> str | None:
    """pal.assembly.go.kr에서 제안이유+주요내용 텍스트 추출"""
    try:
        resp = requests.get(PAL_URL, params={"lgsltPaId": bill_id}, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # <div class="desc"> 안에 제안이유+주요내용
        desc = soup.find("div", class_="desc")
        if not desc:
            return None

        text = desc.get_text(separator="\n").strip()
        # 연속 공백/줄바꿈 정리
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text[:3000] if text else None  # 최대 3000자

    except Exception as e:
        print(f"  [WARN] {bill_id} 스크래핑 실패: {e}")
        return None


def enrich_bills(limit: int = 200, bill_ids: list[str] | None = None):
    """proposal_reason이 없는 22대 법안에 제안이유 채우기"""
    db = get_client()

    if bill_ids:
        # 특정 bill_id 목록 처리
        rows = db.table("bills").select("bill_id,bill_name").in_("bill_id", bill_ids).execute().data
    else:
        # proposal_reason이 NULL인 22대 법안
        rows = (
            db.table("bills")
            .select("bill_id,bill_name")
            .is_("proposal_reason", "null")
            .eq("age", "22")
            .limit(limit)
            .execute()
            .data
        )

    print(f"처리 대상: {len(rows)}건")
    success, fail = 0, 0

    for i, row in enumerate(rows, 1):
        bid = row["bill_id"]
        name = row["bill_name"][:40]
        print(f"  [{i}/{len(rows)}] {name}...", end=" ", flush=True)

        reason = fetch_proposal_reason(bid)

        if reason:
            db.table("bills").update({"proposal_reason": reason}).eq("bill_id", bid).execute()
            print(f"저장 ({len(reason)}자)")
            success += 1
        else:
            print("내용 없음")
            fail += 1

        time.sleep(0.5)  # 서버 부하 방지

    print(f"\n완료: 성공 {success}건 / 내용없음 {fail}건")
    return success, fail


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=200, help="최대 처리 건수")
    parser.add_argument("--test", action="store_true", help="약사법 9건으로 테스트")
    args = parser.parse_args()

    if args.test:
        db = get_client()
        rows = (
            db.table("bills")
            .select("bill_id")
            .like("bill_name", "%약사법%")
            .gte("propose_dt", "2026-02-01")
            .execute()
            .data
        )
        test_ids = [r["bill_id"] for r in rows]
        print(f"테스트 대상: {len(test_ids)}건 (약사법)")
        enrich_bills(bill_ids=test_ids)
    else:
        success, fail = enrich_bills(limit=args.limit)

        # 완료 시 Slack 알림
        try:
            from utils.slack import SlackNotifier
            notifier = SlackNotifier()
            notifier.channel_id = "C070BNYBTQ9"  # 개발/알림 채널
            # 현재 전체 채워진 비율 조회
            db = get_client()
            total = db.table("bills").select("bill_id", count="exact").execute().count
            filled = db.table("bills").select("bill_id", count="exact").not_.is_("proposal_reason", "null").execute().count
            pct = filled / total * 100 if total else 0
            msg = (
                f"[bill_enricher 완료]\n"
                f"이번 실행: 수집 {success}건 / 내용없음 {fail}건\n"
                f"proposal_reason 현황: {filled:,}/{total:,} ({pct:.1f}%)"
            )
            notifier.send(msg)
        except Exception as e:
            print(f"[WARN] Slack 알림 실패: {e}")
