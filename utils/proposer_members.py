"""
국회 OpenAPI PROPOSER / RST_PROPOSER 문자열에서 의원 실명 목록 추출.
DB 컬럼 proposer_members(jsonb) 및 기사 초안 화이트리스트에 사용.
"""
from __future__ import annotations

import re

# X의원 패턴에서 앞글자가 이름이 아닌 경우 (오탐)
_SKIP_BEFORE_UWON = frozenset(
    {
        "국회",
        "지방",
        "시의",
        "도의",
        "기초",
        "광역",
        "교육",
        "전문",
        "상임",
        "법률",
        "개정",
        "일부",
        "소속",
        "비례",
        "지역",
        "대표",
    }
)

# 정부·부처 발의 등: 인명 파싱 신뢰도 낮음 → 빈 목록 (대표 발의자만 RST에 있으면 그건 별도)
_KIND_PERSON_UNLIKELY = ("정부", "국무", "행정안전", "기획재정부", "법제처")


def _clean_hangul_name(token: str) -> str | None:
    t = token.strip()
    for suf in ("의원", "등", "외", "발의", "대표"):
        if t.endswith(suf) and len(t) > len(suf):
            t = t[: -len(suf)]
    t = t.strip()
    if not t or t in ("비례", "발의", "소관", "기타", "민간", "정부"):
        return None
    if re.fullmatch(r"[가-힣]{2,4}", t):
        return t
    return None


def extract_member_names(
    proposer: str | None,
    rst_proposer: str | None = None,
    proposer_kind: str | None = None,
) -> list[str]:
    """
    의원 실명 후보를 중복 없이 순서 유지해 반환.
    proposer_kind가 정부·국무 계열이면 인명 추출을 하지 않는다(오탐 방지).
    """
    kind = (proposer_kind or "").strip()
    if kind and any(k in kind for k in _KIND_PERSON_UNLIKELY):
        return []

    seen: set[str] = set()
    out: list[str] = []

    def add(name: str) -> None:
        if name and name not in seen:
            seen.add(name)
            out.append(name)

    rst = (rst_proposer or "").strip()
    if rst:
        for part in re.split(r"[\s·,/，、]+", rst):
            n = _clean_hangul_name(part)
            if n:
                add(n)

    prop = (proposer or "").strip()
    if prop:
        # 김철수의원, 김철수 의원
        for m in re.finditer(r"([가-힣]{2,4})의원", prop):
            n = m.group(1)
            if n in _SKIP_BEFORE_UWON:
                continue
            add(n)
        for m in re.finditer(r"([가-힣]{2,4})\s+의원", prop):
            n = m.group(1)
            if n in _SKIP_BEFORE_UWON:
                continue
            add(n)

        for part in re.split(r"[\s·,/，、]+", prop):
            n = _clean_hangul_name(part)
            if n and n not in _SKIP_BEFORE_UWON:
                add(n)

    return out
