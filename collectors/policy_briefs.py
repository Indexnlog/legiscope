"""
⑦ 정책브리핑 RSS 수집기
korea.kr 정책브리핑 RSS 피드 파싱 → policy_briefs 테이블 저장
"""

import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import datetime

import requests

from db.client import get_client
from mapper.apply_ksic import tag_bill

# 부처별 RSS 피드 목록
# korea.kr 통합 정책브리핑 + 주요 부처 별도 피드
RSS_FEEDS = [
    # 정책브리핑 (korea.kr 확인된 URL)
    ("정책브리핑", "https://www.korea.kr/rss/policy.xml"),
    # 부처별 (실제 응답 확인된 것만)
    ("기획재정부", "https://www.moef.go.kr/com/rss/selectRssList.do?bbsId=MOSFBBS_000000000028"),
    ("중소벤처기업부", "https://www.mss.go.kr/rss/rss.jsp?boardId=bbs_0000000000013842"),
]

# korea.kr 카테고리별 RSS (추가 검색 필요 시 주석 해제)
KOREA_KR_CATEGORY_FEEDS: list = []

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Legiscope/1.0; +https://legiscope.kr)",
}


def _make_id(url: str, title: str) -> str:
    """URL + 제목 해시로 고유 ID 생성"""
    raw = f"{url}|{title}"
    return hashlib.md5(raw.encode()).hexdigest()


_DC = "http://purl.org/dc/elements/1.1/"


def _parse_bs_items(items, ministry: str) -> list[dict]:
    """BeautifulSoup item 태그 목록 파싱 (XML fallback)"""
    results = []
    for item in items:
        title   = (item.find("title").get_text(strip=True) if item.find("title") else "")
        link    = (item.find("link").get_text(strip=True) if item.find("link") else "")
        summary = (item.find("description").get_text(strip=True) if item.find("description") else "")
        pub_dt  = (item.find("pubDate").get_text(strip=True) if item.find("pubDate") else "")

        if not title or not link:
            continue
        uid  = _make_id(link, title)
        ksic = tag_bill(title + " " + summary[:200])
        results.append({
            "id":         uid,
            "title":      title,
            "ministry":   ministry,
            "summary":    summary[:500] or None,
            "pub_date":   pub_dt or None,
            "link_url":   link or None,
            "ksic_codes": ksic,
        })
    return results


def parse_rss(feed_url: str, ministry: str) -> list[dict]:
    """RSS XML 파싱 → policy_briefs 행 목록 반환"""
    try:
        resp = requests.get(feed_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  [SKIP] {ministry}: {e}")
        return []

    # Content-Type 가드: HTML이면 엔드포인트가 stale일 가능성 높음
    ctype = (resp.headers.get("content-type") or "").lower()
    if "xml" not in ctype and "rss" not in ctype:
        print(
            f"  [경고] {ministry}: content-type={ctype} (XML 아님, {len(resp.content)}B) "
            f"— 엔드포인트 점검 필요: {feed_url}"
        )
        # HTML이 와도 item 태그 시도는 해본다 (혹시 모를 RSS-in-HTML 케이스)

    try:
        root = ET.fromstring(resp.content)
        items = root.findall(".//item")
    except ET.ParseError:
        # XML 깨진 피드: BeautifulSoup lxml-xml 파서로 재시도
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.content, "lxml-xml")
            items = soup.find_all("item")
            # ET 형식으로 래핑 (findtext 호환)
            return _parse_bs_items(items, ministry)
        except Exception as e2:
            print(f"  [파싱 실패] {ministry}: {e2}")
            return []

    results = []
    for item in items:
        title   = (item.findtext("title") or "").strip()
        link    = (item.findtext("link") or "").strip()
        summary = (item.findtext("description") or item.findtext("summary") or "").strip()
        pub_dt  = (
            item.findtext("pubDate")
            or item.findtext(f"{{{_DC}}}date")
            or ""
        ).strip()
        # dc:creator → ministry 보완
        dc_creator = item.findtext(f"{{{_DC}}}creator") or ""

        if not title or not link:
            continue

        uid = _make_id(link, title)
        ksic = tag_bill(title + " " + summary[:200])

        results.append({
            "id":        uid,
            "title":     title,
            "ministry":  ministry,
            "summary":   summary[:500] if summary else None,
            "pub_date":  pub_dt or None,
            "link_url":  link or None,
            "ksic_codes": ksic,
        })

    return results


def save_policy_briefs(rows: list[dict]) -> int:
    if not rows:
        return 0
    db = get_client()
    db.table("policy_briefs").upsert(rows, on_conflict="id").execute()
    return len(rows)


if __name__ == "__main__":
    print("정책브리핑 RSS 수집 시작...")
    total = 0

    all_feeds = RSS_FEEDS + KOREA_KR_CATEGORY_FEEDS

    for ministry, url in all_feeds:
        rows = parse_rss(url, ministry)
        if rows:
            saved = save_policy_briefs(rows)
            total += saved
            print(f"  {ministry}: {saved}건 저장")
        time.sleep(0.5)

    print(f"\n완료: 총 {total}건 저장")
    if total == 0:
        # 0건 = 전 피드 사망 신호. exit 0으로 두면 run_weekly가 "성공"으로 집계하는 침묵 실패.
        # 2026-07-07 확인: korea.kr RSS 전 엔드포인트 404 (안내페이지 /etc/rss.do만 잔존),
        # moef/mss는 HTML 반환. 소스 교체 또는 폐기 결정 전까지 명시적 실패로 처리.
        print("[실패] 모든 RSS 피드 0건 — 소스 엔드포인트 전멸. 수집기 소스 교체 필요.")
        raise SystemExit(1)
