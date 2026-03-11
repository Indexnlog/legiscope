"""
⑥ 행정입법예고 수집기
정부입법지원센터 (lawmaking.go.kr) /gcom/admpp HTML 스크래핑
법령 종류: 훈령·예규·고시
→ admin_laws 테이블 저장
"""

import re
import time

import requests
from bs4 import BeautifulSoup

from db.client import get_client
from mapper.apply_ksic import tag_bill

BASE_URL  = "https://www.lawmaking.go.kr"
LIST_PATH = "/gcom/admpp/list"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}


def _parse_date_range(text: str):
    """'2026. 2. 24. ~ 2026. 3. 16.' → ('2026-02-24', '2026-03-16')"""
    dates = re.findall(r"(\d{4})[.\s]+(\d{1,2})[.\s]+(\d{1,2})", text)
    fmt = lambda m: f"{m[0]}-{int(m[1]):02d}-{int(m[2]):02d}"
    start = fmt(dates[0]) if len(dates) >= 1 else None
    end   = fmt(dates[1]) if len(dates) >= 2 else None
    return start, end


def _parse_ministry_no(text: str):
    """'환경부 (제2026-155호)' → ('환경부', '제2026-155호')"""
    m = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", text.strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return text.strip(), None


def scrape_page(page: int = 1) -> list[dict]:
    """행정입법예고 목록 한 페이지 파싱"""
    params = {"admRulNm": "", "pageIndex": page}
    try:
        resp = requests.get(f"{BASE_URL}{LIST_PATH}", headers=HEADERS, params=params, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  [SKIP] page {page}: {e}")
        return []

    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    seen_ids = set()
    rows = []

    for tr in soup.find_all("tr"):
        a = tr.find("a", href=re.compile(r"/gcom/admpp/\d+(?:\?|$)"))
        if not a:
            continue
        m = re.search(r"/gcom/admpp/(\d+)", a["href"])
        if not m:
            continue
        id_ = m.group(1)
        if id_ in seen_ids:
            continue
        seen_ids.add(id_)

        tds = tr.find_all("td")
        if len(tds) < 5:
            continue

        # 컬럼 매핑: [0]번호 [1]법안명 [2]법령종류 [3]소관부처(고시번호) [4]예고기간
        law_name  = a.get_text(strip=True) or tds[1].get_text(strip=True)
        law_type  = tds[2].get_text(strip=True)   # 훈령 / 예규 / 고시
        min_raw   = tds[3].get_text(separator=" ", strip=True)
        date_raw  = tds[4].get_text(separator=" ", strip=True)

        ministry, _ = _parse_ministry_no(min_raw)
        start, end  = _parse_date_range(date_raw)
        ksic = tag_bill(law_name)

        rows.append({
            "id":             id_,
            "law_name":       law_name,
            "law_type":       law_type or "행정예고",
            "ministry":       ministry or None,
            "announce_start": start,
            "announce_end":   end,
            "link_url":       f"{BASE_URL}/gcom/admpp/{id_}",
            "ksic_codes":     ksic,
        })

    return rows


def get_total_pages(soup: BeautifulSoup) -> int:
    page_links = soup.find_all("a", href=re.compile(r"pageIndex=\d+"))
    nums = [int(re.search(r"pageIndex=(\d+)", a["href"]).group(1))
            for a in page_links if re.search(r"pageIndex=(\d+)", a["href"])]
    return max(nums) if nums else 1


def save_admin_laws(rows: list[dict]) -> int:
    if not rows:
        return 0
    db = get_client()
    db.table("admin_laws").upsert(rows, on_conflict="id").execute()
    return len(rows)


if __name__ == "__main__":
    print("행정입법예고 수집 시작 (정부입법지원센터)...")

    resp0 = requests.get(f"{BASE_URL}{LIST_PATH}", headers=HEADERS,
                         params={"admRulNm": "", "pageIndex": 1}, timeout=15)
    resp0.encoding = "utf-8"
    soup0 = BeautifulSoup(resp0.text, "html.parser")
    total_pages = get_total_pages(soup0)
    print(f"총 {total_pages} 페이지")

    total = 0
    for page in range(1, total_pages + 1):
        rows = scrape_page(page)
        if not rows:
            break
        saved = save_admin_laws(rows)
        total += saved
        print(f"  page {page}/{total_pages}: {saved}건 저장")
        time.sleep(0.5)

    print(f"\n완료: 총 {total}건 저장")
