"""
⑤ 공포 법령 수집기
법제처 국가법령정보 DRF API (www.law.go.kr/DRF)
→ promulgations 테이블 저장

사전 준비: open.law.go.kr 회원가입 후 OC(기관코드) 발급 필요
OC = 가입 이메일의 @ 앞부분
승인 후 .env에 LAW_OC=your_oc 추가
"""

import time
import xml.etree.ElementTree as ET

import requests

from config import LAW_OC
from db.client import get_client
from mapper.apply_ksic import tag_bill

DRF_URL = "https://www.law.go.kr/DRF/lawSearch.do"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Legiscope/1.0)",
}


def fetch_promulgations(page: int = 1, display: int = 100) -> list[dict]:
    """
    공포 법령 목록 조회
    target=law: 대한민국 현행법령 (open.law.go.kr에서 신청 승인된 항목)
    """
    if not LAW_OC:
        raise RuntimeError("LAW_OC가 설정되지 않았습니다. .env에 LAW_OC=이메일ID 추가 후 실행하세요.")

    params = {
        "OC":      LAW_OC,
        "target":  "law",       # 대한민국 현행법령
        "type":    "XML",
        "query":   "",
        "page":    page,
        "display": display,
    }

    try:
        resp = requests.get(DRF_URL, params=params, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  [오류] page {page}: {e}")
        return []

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        print(f"  [XML 파싱 오류] {e}")
        return []

    # 오류 응답 확인 (resultCode 기준)
    result_code = root.findtext(".//resultCode") or ""
    if result_code and result_code != "00":
        err = root.findtext(".//resultMsg") or root.findtext(".//errMsg") or result_code
        print(f"  [API 오류] {err}")
        return []

    rows = []
    for law in root.findall(".//law"):
        law_id        = law.findtext("법령일련번호") or ""
        law_name      = law.findtext("법령명한글") or ""
        promulgate_no = law.findtext("공포번호") or ""
        promulgate_dt = law.findtext("공포일자") or ""
        enforce_dt    = law.findtext("시행일자") or ""
        ministry      = law.findtext("소관부처명") or ""

        if not law_id or not law_name:
            continue

        # 날짜 형식 통일 (YYYYMMDD → YYYY-MM-DD)
        def fmt_date(d: str) -> str | None:
            d = d.strip()
            if len(d) == 8 and d.isdigit():
                return f"{d[:4]}-{d[4:6]}-{d[6:]}"
            return d or None

        ksic = tag_bill(law_name)

        rows.append({
            "id":             law_id,
            "law_name":       law_name,
            "promulgate_no":  promulgate_no or None,
            "promulgate_dt":  fmt_date(promulgate_dt),
            "enforce_dt":     fmt_date(enforce_dt),
            "ministry":       ministry or None,
            "bill_id":        None,   # bills 테이블 연결 (추후 매핑)
            "ksic_codes":     ksic,
        })

    return rows


def get_total_count() -> int:
    """전체 공포법령 건수 조회"""
    if not LAW_OC:
        return 0
    params = {
        "OC": LAW_OC, "target": "law", "type": "XML",
        "query": "", "page": 1, "display": 1,
    }
    try:
        resp = requests.get(DRF_URL, params=params, headers=HEADERS, timeout=15)
        root = ET.fromstring(resp.content)
        total = root.findtext(".//totalCnt") or "0"
        return int(total.replace(",", ""))
    except Exception:
        return 0


def save_promulgations(rows: list[dict]) -> int:
    if not rows:
        return 0
    db = get_client()
    db.table("promulgations").upsert(rows, on_conflict="id").execute()
    return len(rows)


# 행정입법(시행령·대통령령·훈령 등) 제외 패턴 — bills에 해당 없음
ADMIN_LAW_SUFFIXES = (
    "시행령", "시행규칙", "규칙", "훈령", "예규", "시행세칙", "내규",
    "령", "직제", "규정", "준칙", "지침", "칙령", "고시",
)

# 21대 국회 개원일 — 이전 법령은 bills에 없으므로 매칭 불필요
ASSEMBLY_21_START = "2020-05-30"


def _normalize(name: str) -> str:
    """매칭용 법령명 정규화: 특수문자 통일, 공백 제거"""
    return (
        name
        .replace("ㆍ", "·")   # U+318D → U+00B7 통일
        .replace("\u2022", "·")
        .replace(" ", "")
        .strip()
    )


def _fetch_all(db, table: str, columns: str, page_size: int = 1000, **filters):
    """페이지네이션으로 전체 행 수집. filters는 chain된 빌더에 적용됨."""
    out = []
    offset = 0
    while True:
        q = db.table(table).select(columns)
        for fn, args in filters.get("_chain", []):
            q = getattr(q, fn)(*args)
        res = q.range(offset, offset + page_size - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return out


def link_to_bills():
    """
    promulgations.law_name ↔ bills.bill_name 매칭으로 bill_id 연결
    - 시행령/대통령령/훈령 등 행정입법 제외
    - 21대 국회 개원(2020-05-30) 이후 공포된 법령만 시도
    - bills 전체를 한 번만 로드 후 메모리에서 substring 매칭
      (DB ilike 풀스캔이 18k+ bills × 5k+ promulgations에서 statement_timeout 유발)
    """
    db = get_client()

    # 1) 매칭 대상 promulgations 수집 (bill_id 미할당 & 21대 이후)
    todo = _fetch_all(
        db, "promulgations", "id, law_name, promulgate_dt",
        _chain=[
            ("is_", ("bill_id", "null")),
            ("gte", ("promulgate_dt", ASSEMBLY_21_START)),
        ],
    )

    # 행정입법 제외
    skipped = sum(
        1 for r in todo
        if any((r.get("law_name") or "").endswith(s) for s in ADMIN_LAW_SUFFIXES)
    )
    candidates = [
        r for r in todo
        if r.get("law_name") and not any(r["law_name"].endswith(s) for s in ADMIN_LAW_SUFFIXES)
    ]

    if not candidates:
        print(f"bills 연결 완료: 0/0건 (행정입법 제외: {skipped}건)")
        return

    # 2) bills 전체 로드 (한 번만)
    bills = _fetch_all(db, "bills", "bill_id, bill_name")
    bill_index = [
        (b["bill_id"], b.get("bill_name") or "", _normalize(b.get("bill_name") or ""))
        for b in bills if b.get("bill_id")
    ]

    # 3) 메모리 매칭: 원문 substring → 정규화 substring 순
    linked = 0
    for row in candidates:
        name = row["law_name"]
        norm = _normalize(name)

        hit = next((bid for bid, bn, _ in bill_index if name in bn), None)
        if hit is None and norm != name:
            hit = next((bid for bid, _, bnn in bill_index if norm in bnn), None)

        if hit is not None:
            db.table("promulgations").update({"bill_id": hit}).eq("id", row["id"]).execute()
            linked += 1

    print(
        f"bills 연결 완료: {linked}/{len(candidates)}건 "
        f"(행정입법 제외: {skipped}건, bills 로드: {len(bill_index)}건)"
    )


if __name__ == "__main__":
    import sys

    if not LAW_OC:
        print("[ERROR] LAW_OC 미설정")
        print("  1. open.law.go.kr 회원가입")
        print("  2. 활용신청 승인 후")
        print("  3. .env 파일에 추가: LAW_OC=이메일ID앞부분")
        sys.exit(1)

    print(f"공포 법령 수집 시작 (OC: {LAW_OC})...")

    total_count = get_total_count()
    print(f"전체 건수: {total_count}건")

    total = 0
    page = 1
    display = 100

    while True:
        rows = fetch_promulgations(page=page, display=display)
        if not rows:
            print(f"  → page {page}: 데이터 없음, 종료")
            break

        saved = save_promulgations(rows)
        total += saved
        print(f"  page {page}: {saved}건 저장 | 누적: {total}건")
        page += 1
        time.sleep(0.3)

    print(f"\n공포법령 저장 완료: {total}건")

    # bills 테이블과 연결
    print("\nbills 테이블 연결 중...")
    link_to_bills()
