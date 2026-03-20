"""
입법 레이더 주간 트리거 감지 + 월간 리포트 생성기
실행: PYTHONPATH=. python article_weekly.py
     PYTHONPATH=. python article_weekly.py --monthly
     PYTHONPATH=. python article_weekly.py --slack        (Slack 전송 포함)
     PYTHONPATH=. python article_weekly.py --draft        (Gemini/Claude 초안, .env 키 기준)
     PYTHONPATH=. python article_weekly.py --sector 금융   (섹터 심층 기사 생성)
     PYTHONPATH=. python article_weekly.py --sector 디지털AI
     PYTHONPATH=. python article_weekly.py --sector 바이오의료
     PYTHONPATH=. python article_weekly.py --sector 에너지환경
     PYTHONPATH=. python article_weekly.py --sector 부동산건설
     PYTHONPATH=. python article_weekly.py --sector 제조업
"""
import csv
import re
import sys
import argparse
import io
from datetime import date, timedelta
from collections import defaultdict
from db.client import get_client
from utils.proposer_members import extract_member_names
from config import (
    ANTHROPIC_API_KEY,
    ARTICLE_LLM_PROVIDER,
    CLAUDE_ARTICLE_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    resolve_news_epoch_guideline_path,
)

sys.stdout.reconfigure(encoding="utf-8")


def resolve_article_llm_provider() -> str:
    """gemini | claude. ARTICLE_LLM_PROVIDER 우선, 없으면 키 있는 쪽."""
    if ARTICLE_LLM_PROVIDER in ("gemini", "claude"):
        return ARTICLE_LLM_PROVIDER
    if GEMINI_API_KEY:
        return "gemini"
    if ANTHROPIC_API_KEY:
        return "claude"
    return "gemini"


# 초안에 자주 끼어드는 ‘데이터 밖’ 배경. <SOURCE_FACTS>에 없으면 경고(환각 의심).
_EXTERNAL_FACT_MARKERS = (
    "국제기구",
    "국제 사회",
    "국제적 압력",
    "유엔",
    "UN ",
    "UN이",
    "OECD",
    "ILO",
    "국제노동기구",
    "국제노동기준",
    "유네스코",
    "UNESCO",
    "세계은행",
    "국제통화기금",
    "IMF",
    "유럽연합",
    "EU ",
    "EU의",
    " G7",
    "G7",
    " G20",
    "G20",
    "AI Act",
    "디지털시장법",
    "CBAM",
    "미국 의회",
    "백악관",
    "일본 정부",
    "중국 정부",
    "유럽의회",
    "세계무역기구",
    "WTO",
)

# LLM 기사 초안용 — 모델이 ‘기자답게’ 말하려다 데이터 밖 지식을 섞는 것을 줄이기 위한 시스템 지시
_LEGISCOPE_FACT_SYSTEM = """NEWS EPOCH 기사 초안은 편집자가 마련한 Legiscope API·수집·DB 파이프라인이 넘긴 데이터만 사실 근거로 씁니다. 상식·학습 코퍼스로 사실을 지어내거나 보강하지 마세요.

절대 규칙:
- SOURCE_FACTS(이번 호출에 포함된 파이프라인 출력 텍스트)에 없는 기관명·국가·국제협약·판례·통계·날짜·건수·인용을 새로 만들지 마세요.
- ‘기사처럼 보이게’ 데이터 밖 배경(국제기구, 외국 입법, 일반론)을 붙이지 마세요. 붙이고 싶으면 해당 문장은 통째로 삭제하세요.
- 법안명·의원명·위원회명·숫자는 SOURCE_FACTS에 나온 표기만 사용하세요.
- 해석·논지는 SOURCE_FACTS 안에서만 세우고, 원인을 데이터 밖에서 단정하지 마세요.
- 한국어 기사 형식을 유지하되, 위는 NEWS EPOCH 편집 지침 §0과 동일한 하드 제약입니다."""


def _scan_draft_for_external_markers(draft: str, source_facts: str) -> list[str]:
    """초안에 있으나 source_facts에 없는 외부 배경 키워드 목록."""
    if not draft or not source_facts:
        return []
    d = draft.casefold()
    s = source_facts.casefold()
    found: list[str] = []
    for m in _EXTERNAL_FACT_MARKERS:
        key = m.strip().casefold()
        if len(key) < 2:
            continue
        if key in d and key not in s:
            found.append(m.strip())
    # 중복 제거, 짧은 것이 긴 것에 포함되면 정리
    out, seen = [], set()
    for x in found:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _apply_draft_fact_guard(
    draft: str,
    source_facts: str,
    *,
    name_whitelist: frozenset[str] | None = None,
) -> str:
    """외부 배경 마커 + (선택) 의원·법안 화이트리스트 위반 시 편집자 경고."""
    chunks: list[str] = []
    ext = _scan_draft_for_external_markers(draft, source_facts)
    if ext:
        chunks.append(
            "다음 표현은 SOURCE_FACTS에 없습니다(환각 가능): " + ", ".join(ext)
        )
    if name_whitelist:
        wl = _scan_draft_whitelist_violations(draft, source_facts, name_whitelist)
        if wl:
            chunks.append(
                "화이트리스트 밖 고유명사·패턴(트리거 key_data 기준): " + "; ".join(wl)
            )
    if not chunks:
        return draft
    return (
        draft.rstrip()
        + "\n\n---\n[Legiscope 자동 검사]\n"
        + "\n".join(chunks)
        + "\n---"
    )


# 초안에서 기업·기관명으로 자주 지어내는 접미 패턴 (SOURCE_FACTS에 없으면 경고)
_ORG_LIKE_SUFFIXES = (
    "전자",
    "홀딩스",
    "홀딩",
    "증권",
    "은행",
    "화학",
    "통신",
    "그룹",
    "라이프",
    "케미칼",
    "바이오",
    "제약",
    "케이블",
)


def _bill_name_aliases(bill_name: str) -> set[str]:
    """법안명 전체 + 짧은 호칭(공직선거법 등)."""
    s = (bill_name or "").strip()
    if not s:
        return set()
    out: set[str] = {s}
    t = s.replace("「", "").replace("」", "").strip()
    if t:
        out.add(t)
    for suf in (
        " 일부개정법률안",
        " 일부개정법률",
        " 법률안",
        " 법률",
        " 제정법률안",
        " 제정법률",
    ):
        if s.endswith(suf):
            out.add(s[: -len(suf)].strip())
    return {x for x in out if len(x) >= 2}


def build_sector_whitelist_from_db_text(db_data: str) -> frozenset[str]:
    """섹터 프롬프트 본문에서 `- 법안명 (` 형태 줄만 뽑아 별칭 화이트리스트."""
    wl: set[str] = set()
    for m in re.finditer(r"^-\s*(.+?)\s*\(", db_data, re.MULTILINE):
        wl.update(_bill_name_aliases(m.group(1).strip()))
    return frozenset(wl)


def build_weekly_trigger_whitelist(
    bill_rows: list[dict],
    detail_by_bill_id: dict | None = None,
    extra_phrases: tuple[str, ...] | None = None,
) -> frozenset[str]:
    """
    트리거용 key_data에 넣은 법안·DB 상세와 동일한 범위의 화이트리스트.
    bill_rows: passed[:3] | first_group[:8] | intl의 bill | moved[:3] 등.
    """
    wl: set[str] = set()
    detail_by_bill_id = detail_by_bill_id or {}
    for b in bill_rows:
        if not b:
            continue
        bn = (b.get("bill_name") or "").strip()
        wl.update(_bill_name_aliases(bn))
        cm = (b.get("committee") or "").strip()
        if cm:
            wl.add(cm)
        bid = b.get("bill_id")
        det = detail_by_bill_id.get(bid) if bid else None
        prop = ""
        rst = (b.get("rst_proposer") or "").strip()
        pkind = (b.get("proposer_kind") or "").strip()
        if isinstance(det, dict):
            prop = (det.get("proposer") or "").strip()
            rst = (det.get("rst_proposer") or rst).strip()
            pkind = (det.get("proposer_kind") or pkind).strip()
            cm2 = (det.get("committee") or "").strip()
            if cm2:
                wl.add(cm2)
            pm = det.get("proposer_members")
            if isinstance(pm, list):
                for x in pm:
                    if isinstance(x, str) and len(x.strip()) >= 2:
                        wl.add(x.strip())
        if not prop:
            prop = (b.get("proposer") or "").strip()
        pm_b = b.get("proposer_members")
        if isinstance(pm_b, list):
            for x in pm_b:
                if isinstance(x, str) and len(x.strip()) >= 2:
                    wl.add(x.strip())
        if prop:
            wl.add(prop)
        if rst:
            wl.add(rst)
        for n in extract_member_names(prop or None, rst or None, pkind or None):
            wl.add(n)
    if extra_phrases:
        for x in extra_phrases:
            t = (x or "").strip()
            if len(t) >= 2:
                wl.add(t)
    return frozenset(x for x in wl if x and len(x) >= 2)


def _whitelist_allows_phrase(phrase: str, source_facts: str, whitelist: frozenset[str]) -> bool:
    """phrase가 SOURCE_FACTS 부분문자열이거나 화이트리스트 항목과 겹치면 허용."""
    if not phrase or len(phrase) < 2:
        return True
    if phrase in source_facts:
        return True
    for w in whitelist:
        if len(w) < 2:
            continue
        if phrase == w:
            return True
        if len(w) >= 3 and phrase in w:
            return True
        if len(phrase) >= 4 and w in phrase:
            return True
    return False


def _strip_md_for_scan(text: str) -> str:
    return re.sub(r"[*_#`]+", "", text)


def _scan_draft_whitelist_violations(
    draft: str, source_facts: str, whitelist: frozenset[str]
) -> list[str]:
    """의원명 패턴, 「」 법안명, 기업형 접미어, 3글자 고유명사(휴리스틱) 검사."""
    plain = _strip_md_for_scan(draft)
    seen: set[str] = set()
    out: list[str] = []

    # 1) ○○의원 / ○○ 의원 (국회의원 등 오탐 제외)
    skip_before_uwon = frozenset(
        ("국회", "지방", "시의", "도의", "기초", "광역", "교육", "전문", "상임", "법률", "개정", "일부")
    )
    for rx in (r"([가-힣]{2,4})의원", r"([가-힣]{2,4})\s+의원"):
        for m in re.finditer(rx, plain):
            name = m.group(1)
            if name in skip_before_uwon:
                continue
            if _whitelist_allows_phrase(name, source_facts, whitelist):
                continue
            key = f"u:{name}"
            if key not in seen:
                seen.add(key)
                out.append(f"의원명·의원 패턴: {name}")

    # 2) 「...」 인용 — 법안명이 데이터·화이트리스트와 연결되는지
    for m in re.finditer(r"「([^」]{3,120})」", plain):
        inner = m.group(1).strip()
        if _whitelist_allows_phrase(inner, source_facts, whitelist):
            continue
        # 짧은 조각이라도 법안 별칭과 겹치면 허용
        ok = False
        for w in whitelist:
            if len(w) < 4:
                continue
            if inner in w or w in inner:
                ok = True
                break
        if ok:
            continue
        key = f"b:{inner[:40]}"
        if key not in seen:
            seen.add(key)
            out.append(f'법안명 인용: 「{inner[:50]}…」' if len(inner) > 50 else f"법안명 인용: 「{inner}」")

    # 3) 기업·지주형 이름 (…전자, …증권 등)
    org_pat = r"[가-힣]{2,12}(?:" + "|".join(re.escape(s) for s in _ORG_LIKE_SUFFIXES) + ")"
    for m in re.finditer(org_pat, plain):
        span = m.group(0)
        if _whitelist_allows_phrase(span, source_facts, whitelist):
            continue
        key = f"o:{span}"
        if key not in seen:
            seen.add(key)
            out.append(f"기업·기관형 명칭: {span}")

    return out


def _strip_yaml_frontmatter(md: str) -> str:
    md = md.lstrip("\ufeff").strip()
    if not md.startswith("---"):
        return md
    parts = md.split("---", 2)
    if len(parts) >= 3:
        return parts[2].strip()
    return md


def _load_news_epoch_guideline_excerpt() -> str:
    """Obsidian `NEWS EPOCH 작성 지침.md` — FlowTracer 전용 절(§10)은 토큰·혼선 방지로 제외."""
    path = resolve_news_epoch_guideline_path()
    if not path:
        return ""
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    body = _strip_yaml_frontmatter(raw)
    if "## 10. FlowTracer" in body:
        body = body.split("## 10. FlowTracer", 1)[0].strip()
    return body


def _build_weekly_draft_prompt(trigger_summary: str, trigger_type: str) -> str:
    guide = _load_news_epoch_guideline_excerpt()
    guide_block = ""
    if guide:
        guide_block = f"""

---
[NEWS EPOCH 공통 작성 지침 — Legiscope 입법 데이터 기사에 적용. 타 파이프라인(예: FlowTracer)만의 규칙은 무시해도 된다.]
{guide}
---
"""
    return f"""아래 <SOURCE_FACTS> 안의 텍스트만 사실 근거로 사용하세요. 블록 밖 지식·상식·뉴스 배경을 끌어오지 마세요.

트리거 유형: {trigger_type}

<SOURCE_FACTS>
{trigger_summary}
</SOURCE_FACTS>

{_LEGISCOPE_FACT_SYSTEM}

{NEWS_EPOCH_SYSTEM_PROMPT}
{guide_block}
[Legiscope — 환각 방지, 최우선]
- 사실 단정 한 문장이라도 SOURCE_FACTS에 대응 문장·숫자가 없으면 쓰지 마세요. ‘그럴듯한’ 배경은 삭제가 정답입니다.
- 발의 건수·날짜·법안명·의원명·위원회명은 SOURCE_FACTS에 있는 표기만 씁니다.
- 출처는 본문에 한 번 이상 "Legiscope·국회 의안정보 기준" 등으로 밝힙니다.
- 본문 800~2200자(공백 포함), 소제목 2~3개. 마지막 문장은 완전한 한국어로 마침표(.)까지. 중간 절단 금지.
- 말미 고정 푸터 한 줄은 시스템 지시 문구를 그대로 붙입니다.

[추가 지시]
- 대표 기업명은 SOURCE_FACTS에 있을 때만. 없으면 업종·역할만.
- 제안이유는 인용된 텍스트만. 미수집이면 추측 금지, "제안이유 미공개" 등만.

한국어로 작성."""


def _gemini_response_text(response) -> str:
    out = ""
    try:
        out = (response.text or "").strip()
    except (ValueError, AttributeError):
        out = ""
    if not out and getattr(response, "candidates", None):
        cand = response.candidates[0]
        parts = getattr(getattr(cand, "content", None), "parts", None) or []
        out = "".join(getattr(p, "text", "") or "" for p in parts).strip()
    if not out:
        return "[Gemini: 응답 없음]"
    fr = None
    if getattr(response, "candidates", None):
        fr = getattr(response.candidates[0], "finish_reason", None)
    if fr is not None:
        fr_name = getattr(fr, "name", str(fr))
        if fr_name == "MAX_TOKENS":
            out += "\n\n[시스템: 모델 출력 길이 상한에 도달했을 수 있습니다. 문장이 끊기면 재생성하세요.]"
    return out

TODAY = date.today()
WEEK_AGO = TODAY - timedelta(days=7)
MONTH_AGO = TODAY - timedelta(days=30)

# NEWS EPOCH 기사 작성 (Legiscope용 요약 — 상세는 Obsidian 지침 파일 + §FlowTracer 제외 본문)
NEWS_EPOCH_SYSTEM_PROMPT = """당신은 정통 경제지 'NEWS EPOCH'의 수석 애널리스트이자 전문 기자입니다.
독자는 경영진·투자자·법무담당자입니다. 함의는 SOURCE_FACTS 안에서만 서술합니다. 데이터에 없는 원인·배경·국제 맥락을 ‘기사 품격’을 위해 보태지 마세요. 보태면 환각입니다.

[기사 구조]
1. 제목: `[Legiscope]` + 한 줄 제목 (대략 28~36자). 이슈 실체 + 영향 축 + 동사. 제목에 `전쟁` 등 과장 격투 메타포는 피합니다.
2. 리드: 2~4문장. 첫 문장 = thesis(왜 읽는지). 돈·비용·사업에 닿는 표현 우선. 리드에 KSIC·의안번호 같은 내부 코드는 쓰지 않습니다.
3. 본문: 소제목 `## ` 2~3개. 법안명은 「」. 뉴스 톤 소제목만 (보고서형 "~의 의미", "~가 가리키는 방향" 금지).
4. 클로징: 리드의 thesis를 닫습니다. 새 기관·새 이슈를 열지 않습니다. 질문으로만 끝내거나 "~의 본질이다" 선언으로 끝내지 않습니다.

[숫자]
- 단독 숫자만 던지지 말고 비교·범위·맥락을 붙입니다. 데이터에 없는 비교 수치는 만들지 않습니다.

[문체]
- 능동태·주어 명확. `~이다.` 만 3연속 금지 — 접속으로 묶습니다.
- 한 기사에서 `구조다`(또는 `구조적이다`)는 2회를 넘기지 않습니다. `보여준다` `주목할 만하다` 남용 금지.
- 본문에서 「이 기사에서」「아래에서는」 등 글 자체를 가리키는 메타 내비게이션 금지.
- 괄호는 최소화합니다.

[절대 금지]
- 관측된다·확인된다·알려졌다·예상된다 등 수동·모호 서술
- 향후 추이를 지켜볼 필요가 있다 / 기업은 대비해야 한다 / 모니터링이 필요하다
- 홍보·시적 비유·검증 안 된 수식어
- 데이터에 없는 국제기구·외국법·판례·통계 인용
- 계류 법안을 가결처럼 단정 — 필요 시 `통과 시` `가결되면` 조건
- KSIC 코드 노출

[말미 고정 문구 — 본문 끝에 한 줄 띄우고 반드시 그대로]
이 기사는 News Epoch가 구축한 입법 추적 엔진 Legiscope를 기반으로 작성했습니다."""

KSIC_NAME = {
    "582": "소프트웨어 개발·공급업", "620": "컴퓨터 프로그래밍·시스템통합",
    "631": "자료처리·호스팅·포털", "639": "기타 정보 서비스업",
    "611": "유선통신업", "612": "이동통신업",
    "261": "반도체 제조업", "262": "전자부품 제조업",
    "291": "자동차 제조업", "292": "자동차 부품 제조업",
    "201": "기초화학물질 제조업", "211": "의약품 제조업",
    "324": "의료기기 제조업", "861": "병원", "862": "의원",
    "351": "전기업", "352": "가스업",
    "381": "폐기물 수집운반업", "382": "폐기물 처리업",
    "410": "건물 건설업", "671": "부동산 임대업", "672": "부동산 개발·공급업",
    "641": "은행·저축기관", "642": "투자기관", "651": "보험업",
}

# EU/미국 연동 법안 키워드 → 참조 규제명
INTL_KEYWORDS = {
    "디지털시장법": "EU 디지털시장법(DMA)",
    "플랫폼 독점": "EU 디지털시장법(DMA)",
    "인공지능 기본법": "EU AI Act",
    "AI 기본법": "EU AI Act",
    "인공지능법": "EU AI Act",
    "반도체 지원": "미국 CHIPS Act",
    "반도체 특별법": "미국 CHIPS Act",
    "탄소국경": "EU 탄소국경조정제도(CBAM)",
    "탄소세": "EU 탄소국경조정제도(CBAM)",
    "공급망 실사": "EU 공급망 실사법(CSDDD)",
    "가상자산 규제": "EU MiCA",
    "스테이블코인": "EU MiCA",
    "개인정보 이동권": "EU GDPR",
    "데이터이동성": "EU GDPR",
}

PASSED = {"원안가결", "수정가결"}
DEAD = {"임기만료폐기", "폐기", "철회", "대안반영폐기"}

# 섹터별 3자리 KSIC 코드
SECTOR_KSIC = {
    "금융":     ["641", "642", "649", "651", "652", "653", "661", "662", "663"],
    "디지털AI": ["582", "620", "631", "639", "721"],
    "바이오의료": ["211", "212", "271", "272", "861", "862", "871", "872"],
    "에너지환경": ["351", "352", "381", "382", "390"],
    "부동산건설": ["410", "421", "681", "682"],
    "제조업":   ["201", "241", "261", "262", "291", "292"],
}

KSIC_LABEL = {
    "641": "은행·저축기관", "642": "투자기관", "649": "대부업·기타금융",
    "651": "보험업", "652": "재보험업", "653": "연금기금",
    "661": "금융지원서비스", "662": "보험지원서비스", "663": "금융투자자문",
    "582": "소프트웨어개발", "620": "컴퓨터프로그래밍", "631": "데이터처리·호스팅",
    "639": "기타정보서비스", "721": "연구개발업(AI)",
    "211": "의약품제조", "212": "한의약품제조", "271": "의료기기제조",
    "272": "측정기기제조", "861": "병원", "862": "의원", "871": "요양원", "872": "복지시설",
    "351": "전기업", "352": "가스업", "381": "폐기물수집운반",
    "382": "폐기물처리", "390": "환경정화",
    "410": "건물건설업", "421": "토목건설업", "681": "부동산임대", "682": "부동산개발",
    "201": "기초화학물질", "241": "금속제조", "261": "반도체제조",
    "262": "전자부품제조", "291": "자동차제조", "292": "자동차부품",
}


def load_bills():
    with open("output/bills_by_ksic.csv", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def industry_name(ksic_code):
    return KSIC_NAME.get(ksic_code[:3], ksic_code[:3])


def fmt_bill(b, show_date="proc"):
    dt = b.get("proc_dt") or b.get("propose_dt") or ""
    name = b["bill_name"][:52]
    ind = industry_name(b["ksic_code"])
    result = b.get("proc_result_cd", "")
    return f"  [{ind}] {name}\n    → {result} | {dt}"


# ─── 트리거 A: 규제 법안 가결 (최근 7일) ──────────────────────────
def trigger_reg_passed(bills):
    recent = [
        b for b in bills
        if b["regulation_type"] == "규제"
        and b["proc_result_cd"] in PASSED
        and b.get("proc_dt", "") >= str(WEEK_AGO)
    ]
    seen, unique = set(), []
    for b in recent:
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)
    return unique


# ─── 트리거 B: 동일 이슈 3건 이상 집중 발의 (최근 30일) ──────────
# 691(공공행정 버킷) 제외: 너무 광범위한 catch-all 코드
EXCLUDE_KSIC_PREFIX = {"691", "841", "851", "854", "881"}

def trigger_cluster(bills):
    # 691 등 catch-all 제외 + 최근 30일
    recent = [
        b for b in bills
        if b.get("propose_dt", "") >= str(MONTH_AGO)
        and b["ksic_code"][:3] not in EXCLUDE_KSIC_PREFIX
    ]
    # bill_id 기준 중복 제거 (같은 법안이 여러 KSIC에 매핑될 수 있음)
    seen_id = set()
    deduped = []
    for b in recent:
        if b["bill_id"] not in seen_id:
            seen_id.add(b["bill_id"])
            deduped.append(b)

    # 법안명 앞 15자 기준 클러스터링
    cluster = defaultdict(list)
    for b in deduped:
        key = b["bill_name"][:15].strip()
        cluster[key].append(b)

    hits = {k: v for k, v in cluster.items() if len(v) >= 3}
    # 건수 많은 순 정렬
    return dict(sorted(hits.items(), key=lambda x: len(x[1]), reverse=True))


# ─── 트리거 C: EU·미국 규제 연동 법안 (최근 30일) ────────────────
def trigger_intl(bills):
    recent = [b for b in bills if b.get("propose_dt", "") >= str(MONTH_AGO)]
    results = []
    seen = set()
    for b in recent:
        for kw, ref in INTL_KEYWORDS.items():
            if kw in b["bill_name"] and b["bill_name"] not in seen:
                seen.add(b["bill_name"])
                results.append((b, ref))
                break
    return results


# ─── 트리거 D: 계류 중인 규제 법안 상태 변화 감지 ────────────────
def trigger_pending_moved(bills):
    """규제 법안 중 최근 7일 내 상임위 결과가 생긴 것"""
    moved = [
        b for b in bills
        if b["regulation_type"] == "규제"
        and b.get("committee_result", "")
        and b.get("committee_dt", "") >= str(WEEK_AGO)
        and b["proc_result_cd"] not in PASSED | DEAD
    ]
    seen, unique = set(), []
    for b in moved:
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)
    return unique


# ─── 월간: risk_score 등락 ────────────────────────────────────────
def monthly_risk_change():
    db = get_client()
    # 최신 2개 스냅샷 날짜 가져오기
    res = db.table("industry_signals")\
        .select("as_of_date")\
        .order("as_of_date", desc=True)\
        .limit(100)\
        .execute()
    dates = sorted(set(r["as_of_date"] for r in res.data), reverse=True)
    if len(dates) < 2:
        return [], []

    latest, prev = dates[0], dates[1]
    cur = {r["ksic_code"]: r for r in db.table("industry_signals")
           .select("*").eq("as_of_date", latest).execute().data}
    old = {r["ksic_code"]: r for r in db.table("industry_signals")
           .select("*").eq("as_of_date", prev).execute().data}

    changes = []
    for code, c in cur.items():
        if code not in old:
            continue
        delta = float(c.get("risk_score") or 0) - float(old[code].get("risk_score") or 0)
        if abs(delta) >= 0.5:
            changes.append({
                "name": KSIC_NAME.get(code[:3], code),
                "code": code,
                "cur": float(c.get("risk_score") or 0),
                "prev": float(old[code].get("risk_score") or 0),
                "delta": delta,
            })

    changes.sort(key=lambda x: x["delta"])
    up = [c for c in changes if c["delta"] > 0][:5]
    down = [c for c in changes if c["delta"] < 0][:5]
    return up, down, latest, prev


# ─── 월간: 임기만료 위험 법안 ────────────────────────────────────
def monthly_expiry_risk(bills):
    """22대 발의 후 18개월 이상 계류 중인 규제 법안"""
    cutoff = str(TODAY - timedelta(days=548))  # 18개월
    stale = [
        b for b in bills
        if b["regulation_type"] == "규제"
        and b.get("propose_dt", "") <= cutoff
        and b["proc_result_cd"] not in PASSED | DEAD
        and b.get("propose_dt", "") >= "2024-05-30"  # 22대만
    ]
    seen, unique = set(), []
    for b in sorted(stale, key=lambda x: x.get("propose_dt", "")):
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)
    return unique[:15]


# ─── 출력 ─────────────────────────────────────────────────────────
def print_weekly_brief(bills):
    print("=" * 65)
    print(f"입법 레이더 주간 트리거 브리프 ({TODAY})")
    print("=" * 65)

    article_count = 0

    # A. 규제 법안 가결
    passed = trigger_reg_passed(bills)
    if passed:
        article_count += 1
        print(f"\n[●] [즉시 기사감 A] 규제 법안 가결 ({len(passed)}건)")
        print(f"   기사 각도: '○○법 통과 — 기업 영향과 대응 방법'")
        print(f"   기간: {WEEK_AGO} ~ {TODAY}")
        for b in passed[:5]:
            print(fmt_bill(b))
    else:
        print(f"\n[-] [A] 이번 주 규제 법안 가결 없음")

    # B. 집중 발의 클러스터
    clusters = trigger_cluster(bills)
    if clusters:
        article_count += 1
        print(f"\n[●] [즉시 기사감 B] 동일 이슈 집중 발의 클러스터 ({len(clusters)}개)")
        print(f"   기사 각도: '국회가 ○○산업을 겨냥했다'")
        for key, group in list(clusters.items())[:5]:
            ind = industry_name(group[0]["ksic_code"])
            print(f"  [{ind}] '{key}…' 관련 {len(group)}건")
            for b in group[:2]:
                print(f"      - {b['bill_name'][:50]} ({b['propose_dt']})")
    else:
        print(f"\n[-] [B] 이번 달 집중 발의 클러스터 없음")

    # C. EU/미국 연동
    intl = trigger_intl(bills)
    if intl:
        article_count += 1
        print(f"\n[●] [즉시 기사감 C] 국제 규제 연동 법안 ({len(intl)}건)")
        print(f"   기사 각도: '한국판 ○○ 나오나'")
        for b, ref in intl[:5]:
            print(f"  [참조: {ref}] {b['bill_name'][:50]}")
            print(f"      → 발의 {b['propose_dt']} | {b['committee']}")
    else:
        print(f"\n[-] [C] 이번 달 국제 연동 법안 없음")

    # D. 계류 법안 움직임
    moved = trigger_pending_moved(bills)
    if moved:
        article_count += 1
        print(f"\n[●] [즉시 기사감 D] 계류 규제법안 심사 진전 ({len(moved)}건)")
        print(f"   기사 각도: '잠자던 ○○법, 이번엔 통과되나'")
        for b in moved[:5]:
            print(f"  {b['bill_name'][:52]}")
            print(f"      → 상임위 결과: {b.get('committee_result','')} ({b.get('committee_dt','')})")
    else:
        print(f"\n[-] [D] 이번 주 계류 규제법안 심사 진전 없음")

    print(f"\n{'─'*65}")
    if article_count > 0:
        print(f"[OK] 이번 주 기사 소재 {article_count}개 감지됨 → 기사 작성 권고")
    else:
        print(f"⏸  이번 주 즉시 기사감 없음 → 패스 (월간 리포트 준비)")
    print(f"{'─'*65}")


def print_monthly_report(bills):
    print("=" * 65)
    print(f"입법 레이더 월간 리포트 브리프 ({TODAY.strftime('%Y년 %m월')})")
    print("=" * 65)

    # risk_score 등락
    print("\n📊 [월간 A] 규제 리스크 등락 산업")
    try:
        result = monthly_risk_change()
        if len(result) == 4:
            up, down, latest, prev = result
            print(f"   비교: {prev} → {latest}")
            print(f"   기사 각도: '이달 규제 리스크 오른 산업, 내린 산업'")
            print(f"\n   ▲ 리스크 상승:")
            for c in up:
                print(f"     {c['name']:25s}  {c['prev']:.2f} → {c['cur']:.2f}  (+{c['delta']:.2f})")
            print(f"\n   ▼ 리스크 하락:")
            for c in down:
                print(f"     {c['name']:25s}  {c['prev']:.2f} → {c['cur']:.2f}  ({c['delta']:.2f})")
        else:
            print("   스냅샷 2개 이상 필요 (현재 1개)")
    except Exception as e:
        print(f"   Supabase 조회 오류: {e}")

    # 임기만료 위험
    stale = monthly_expiry_risk(bills)
    print(f"\n⏰ [월간 B] 22대 계류 규제법안 중 18개월+ 방치 ({len(stale)}건)")
    print(f"   기사 각도: '이번 회기 못 넘기면 폐기되는 법안들'")
    for b in stale[:10]:
        ind = industry_name(b["ksic_code"])
        print(f"  [{ind}] {b['bill_name'][:50]}")
        print(f"      → 발의 {b['propose_dt']} | {b['committee']}")

    # 이달 가결 요약
    this_month = str(TODAY.replace(day=1))
    passed_this_month = [
        b for b in bills
        if b["proc_result_cd"] in PASSED
        and b.get("proc_dt", "") >= this_month
    ]
    seen, unique = set(), []
    for b in passed_this_month:
        if b["bill_name"] not in seen:
            seen.add(b["bill_name"])
            unique.append(b)

    print(f"\n[OK] [월간 C] 이달 가결 법안 총 {len(unique)}건")
    reg_passed = [b for b in unique if b["regulation_type"] == "규제"]
    sup_passed = [b for b in unique if b["regulation_type"] == "지원"]
    print(f"   규제 {len(reg_passed)}건 / 지원 {len(sup_passed)}건 / 중립 {len(unique)-len(reg_passed)-len(sup_passed)}건")
    if reg_passed:
        print(f"   주요 규제 가결:")
        for b in reg_passed[:5]:
            print(f"     - {b['bill_name'][:52]} ({b['proc_dt']})")


def get_sector_data(sector_name: str) -> dict:
    """섹터별 industry_signals + 실제 법안 목록을 DB에서 직접 조회"""
    db = get_client()
    ksic_prefixes = SECTOR_KSIC.get(sector_name, [])
    if not ksic_prefixes:
        raise ValueError(f"알 수 없는 섹터: {sector_name}. 가능: {list(SECTOR_KSIC.keys())}")

    from datetime import date, timedelta
    sixty_days_ago = str(date.today() - timedelta(days=60))

    # 1. industry_signals 조회 (각 KSIC 3자리, level=3)
    signals = []
    for prefix in ksic_prefixes:
        rows = db.table("industry_signals").select("*").eq("ksic_code", prefix).order("as_of_date", desc=True).limit(1).execute().data
        if rows:
            signals.append(rows[0])

    # 2. 최근 60일 발의 법안 (계류 포함, 해당 섹터 KSIC)
    # bills.ksic_codes는 배열이라 contains 필터 불가 → bill_name 키워드 대신 industry_signals 기준으로 데이터 구성
    # → 섹터 대표 키워드로 조회
    sector_keywords = {
        "금융":     ["가상자산", "보험", "은행", "금융", "대부업", "자본시장"],
        "디지털AI": ["인공지능", "AI", "플랫폼", "데이터", "소프트웨어", "정보통신"],
        "바이오의료": ["의약품", "의료기기", "병원", "약사법", "제약"],
        "에너지환경": ["전기", "에너지", "탄소", "환경", "폐기물", "신재생"],
        "부동산건설": ["부동산", "건설", "주택", "임대", "분양"],
        "제조업":   ["반도체", "자동차", "화학", "제조", "공장"],
    }
    keywords = sector_keywords.get(sector_name, [])

    recent_bills, pending_reg_bills = [], []
    seen_ids = set()
    for kw in keywords:
        rows = db.table("bills").select(
            "bill_id,bill_name,propose_dt,committee,pass_gubun,proc_result_cd,"
            "regulation_type,proposer,rst_proposer,proposer_kind,proposer_members"
        ).like("bill_name", f"%{kw}%").eq("age", "22").order("propose_dt", desc=True).limit(30).execute().data
        for r in rows:
            if r["bill_id"] in seen_ids:
                continue
            seen_ids.add(r["bill_id"])
            if r.get("propose_dt", "") >= sixty_days_ago:
                recent_bills.append(r)
            if (r.get("regulation_type") == "규제"
                    and r.get("proc_result_cd") not in ("원안가결", "수정가결", "임기만료폐기", "폐기", "철회")):
                pending_reg_bills.append(r)

    recent_bills = sorted(recent_bills, key=lambda x: x.get("propose_dt",""), reverse=True)[:15]
    pending_reg_bills = sorted(pending_reg_bills, key=lambda x: x.get("propose_dt",""))[:10]

    return {
        "sector_name": sector_name,
        "signals": signals,
        "recent_bills": recent_bills,
        "pending_reg_bills": pending_reg_bills,
    }


def build_sector_prompt_data(data: dict) -> str:
    """DB 조회 결과를 Claude 프롬프트용 텍스트로 변환 — 모든 수치가 DB 기반"""
    sector_name = data["sector_name"]
    signals = data["signals"]
    recent_bills = data["recent_bills"]
    pending_reg_bills = data["pending_reg_bills"]
    from datetime import date
    today = str(date.today())

    lines = [f"[섹터: {sector_name}업]", f"[기준일: {today}]", ""]

    # industry_signals 수치 (검증된 DB 데이터)
    lines.append("=== 세부 산업별 지표 (industry_signals, DB 직접 조회) ===")
    lines.append("※ 이 수치 외의 숫자를 임의로 생성하는 것은 절대 금지")
    for s in sorted(signals, key=lambda x: float(x.get("risk_score") or 0), reverse=True):
        code = s["ksic_code"]
        label = KSIC_LABEL.get(code, code)
        lines.append(
            f"- {label}({code}): 전체 {s['total_bills']}건, "
            f"규제 {s['reg_count']}건({s['reg_ratio']}%), "
            f"규제가결률 {s['reg_pass_rate']}%, "
            f"계류 {s['pending_bills']}건, "
            f"risk_score {s['risk_score']}"
        )

    # 최근 60일 실제 법안
    lines.append(f"\n=== 최근 60일 발의 법안 ({len(recent_bills)}건, DB 직접 조회) ===")
    for b in recent_bills:
        status = b.get("proc_result_cd") or b.get("pass_gubun") or "계류"
        cmt = (b.get("committee") or "미배정")[:20]
        lines.append(f"- {b['bill_name']} ({b['propose_dt']}, {status}, {cmt})")

    # 계류 중인 규제 법안
    lines.append(f"\n=== 계류 중인 규제 법안 ({len(pending_reg_bills)}건, DB 직접 조회) ===")
    for b in pending_reg_bills:
        cmt = (b.get("committee") or "미배정")[:20]
        lines.append(f"- {b['bill_name']} (발의 {b['propose_dt']}, {cmt})")

    return "\n".join(lines)


def generate_sector_article(sector_name: str) -> str:
    """섹터 심층 기사 — DB 수치 직입; LLM은 ARTICLE_LLM_PROVIDER(기본 Gemini)."""
    data = get_sector_data(sector_name)
    db_data = build_sector_prompt_data(data)

    guide = _load_news_epoch_guideline_excerpt()
    guide_block = (
        f"\n\n---\n[NEWS EPOCH 공통 작성 지침]\n{guide}\n---\n"
        if guide
        else ""
    )
    prompt = f"""아래 <SOURCE_FACTS>만 사실 근거로 {sector_name}업 입법 기사를 작성하세요.

<SOURCE_FACTS>
{db_data}
</SOURCE_FACTS>

{_LEGISCOPE_FACT_SYSTEM}

{NEWS_EPOCH_SYSTEM_PROMPT}
{guide_block}
[추가 지시]
- industry_signals 수치는 SOURCE_FACTS 그대로. 임의 변경 금지.
- 최근 발의 법안 중 주목할 것 2~3건 구체 서술.
- 계류 규제법안 건수와 위원회 정보 언급.
- 수혜자(기회)와 피해자(부담) 구분. 기업명은 SOURCE_FACTS에 있을 때만.
- 마지막 문장 완결. 본문+푸터 800~2200자 목표. SOURCE_FACTS 밖 배경·국제기구 금지.

한국어로 작성."""

    raw = _generate_article_completion(
        prompt, max_tokens_claude=4096, max_tokens_gemini=8192
    )
    sec_wl: set[str] = set(build_sector_whitelist_from_db_text(db_data))
    for rb in data["recent_bills"] + data["pending_reg_bills"]:
        pm = rb.get("proposer_members")
        if isinstance(pm, list):
            for x in pm:
                if isinstance(x, str) and len(x.strip()) >= 2:
                    sec_wl.add(x.strip())
        for n in extract_member_names(
            rb.get("proposer"),
            rb.get("rst_proposer"),
            rb.get("proposer_kind"),
        ):
            sec_wl.add(n)
    wl_fz = frozenset(x for x in sec_wl if x and len(x) >= 2)
    wl_opt = wl_fz if len(wl_fz) >= 2 else None
    return _apply_draft_fact_guard(raw, db_data, name_whitelist=wl_opt)


def generate_draft_gemini(
    trigger_summary: str,
    trigger_type: str,
    *,
    name_whitelist: frozenset[str] | None = None,
) -> str:
    """Gemini API로 주간 트리거 기사 초안."""
    if not GEMINI_API_KEY:
        return "[GEMINI_API_KEY 미설정 — Google AI Studio에서 발급 후 .env에 추가]"

    try:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            GEMINI_MODEL,
            system_instruction=_LEGISCOPE_FACT_SYSTEM,
        )
        prompt = _build_weekly_draft_prompt(trigger_summary, trigger_type)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=8192,
                temperature=0.15,
            ),
        )
        return _apply_draft_fact_guard(
            _gemini_response_text(response),
            trigger_summary,
            name_whitelist=name_whitelist or None,
        )
    except Exception as e:
        return f"[Gemini API 오류: {e}]"


def generate_draft_claude(
    trigger_summary: str,
    trigger_type: str,
    *,
    name_whitelist: frozenset[str] | None = None,
) -> str:
    """Claude API로 주간 트리거 기사 초안."""
    if not ANTHROPIC_API_KEY or (ANTHROPIC_API_KEY or "").startswith("여기에"):
        return "[ANTHROPIC_API_KEY 미설정 — .env에 키 추가 필요]"

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        prompt = _build_weekly_draft_prompt(trigger_summary, trigger_type)
        msg = client.messages.create(
            model=CLAUDE_ARTICLE_MODEL,
            max_tokens=4096,
            system=_LEGISCOPE_FACT_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        return _apply_draft_fact_guard(
            msg.content[0].text,
            trigger_summary,
            name_whitelist=name_whitelist or None,
        )
    except Exception as e:
        return f"[Claude API 오류: {e}]"


def generate_article_draft(
    trigger_summary: str,
    trigger_type: str,
    *,
    name_whitelist: frozenset[str] | None = None,
) -> str:
    """주간 트리거 기사 초안 — resolve_article_llm_provider()에 따라 Gemini 또는 Claude."""
    if resolve_article_llm_provider() == "claude":
        return generate_draft_claude(
            trigger_summary, trigger_type, name_whitelist=name_whitelist
        )
    return generate_draft_gemini(
        trigger_summary, trigger_type, name_whitelist=name_whitelist
    )


def _generate_article_completion(
    prompt: str, *, max_tokens_claude: int, max_tokens_gemini: int
) -> str:
    """섹터 기사 등 긴 단발 프롬프트용."""
    if resolve_article_llm_provider() == "claude":
        if not ANTHROPIC_API_KEY:
            return "[ANTHROPIC_API_KEY 미설정]"
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            msg = client.messages.create(
                model=CLAUDE_ARTICLE_MODEL,
                max_tokens=max_tokens_claude,
                system=_LEGISCOPE_FACT_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text
        except Exception as e:
            return f"[Claude API 오류: {e}]"

    if not GEMINI_API_KEY:
        return "[GEMINI_API_KEY 미설정]"
    try:
        import google.generativeai as genai

        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            GEMINI_MODEL,
            system_instruction=_LEGISCOPE_FACT_SYSTEM,
        )
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=max_tokens_gemini,
                temperature=0.15,
            ),
        )
        return _gemini_response_text(response)
    except Exception as e:
        return f"[Gemini API 오류: {e}]"


def save_to_obsidian(title: str, content: str) -> str:
    """기사 초안을 Obsidian 작업일지 폴더에 저장"""
    import os
    obsidian_dir = (
        r"C:\Users\ekapr\Dropbox\앱\remotely-save\Second_Brain"
        r"\20_Projects_Builder\21_News Epoch\2026 입법레이더-Legiscope\01_기사초안"
    )
    os.makedirs(obsidian_dir, exist_ok=True)
    filename = f"{TODAY} {title[:20].replace('/', '-')}.md"
    path = os.path.join(obsidian_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"---\ntags: [legiscope, 입법레이더, 기사, 자동생성]\ndate: {TODAY}\nstatus: 초안(AI)\n---\n\n")
        f.write(content)
    print(f"[OK] Obsidian 저장: {filename}")
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--monthly", action="store_true", help="월간 리포트 모드")
    parser.add_argument("--slack",   action="store_true", help="Slack 전송 포함")
    parser.add_argument(
        "--draft",
        action="store_true",
        help="기사 초안 생성 (ARTICLE_LLM_PROVIDER 또는 GEMINI/Anthropic 키)",
    )
    parser.add_argument("--sector",  type=str, default="", help=f"섹터 심층 기사 생성: {list(SECTOR_KSIC.keys())}")
    args = parser.parse_args()

    # --sector 모드: DB 수치 직접 주입해서 섹터 기사 생성
    if args.sector:
        print(f"📊 {args.sector}업 섹터 기사 생성 중 (DB 직접 조회)...")
        draft = generate_sector_article(args.sector)
        print("\n" + "=" * 65)
        print(draft)
        print("=" * 65)
        save_to_obsidian(f"{args.sector}편", draft)
        return

    bills = load_bills()

    if args.monthly:
        # 월간 모드: 출력 캡처 후 Slack 전송
        buf = io.StringIO()
        sys.stdout = buf
        print_monthly_report(bills)
        sys.stdout = sys.__stdout__
        report_text = buf.getvalue()
        print(report_text)

        if args.slack:
            from utils.slack import send_monthly_report
            send_monthly_report(report_text, str(TODAY))
    else:
        # 주간 모드: 출력 캡처 후 Slack 전송 + 초안 생성
        buf = io.StringIO()
        sys.stdout = buf
        print_weekly_brief(bills)
        sys.stdout = sys.__stdout__
        brief_text = buf.getvalue()
        print(brief_text)

        # 트리거 감지 여부 확인
        passed  = trigger_reg_passed(bills)
        clusters = trigger_cluster(bills)
        intl    = trigger_intl(bills)
        moved   = trigger_pending_moved(bills)
        has_triggers = any([passed, clusters, intl, moved])

        if args.slack:
            from utils.slack import send_weekly_brief
            send_weekly_brief(has_triggers, brief_text, str(TODAY))

        if args.draft and has_triggers:
            # 가장 강한 트리거 선택해서 초안 생성
            file_label = ""  # Obsidian 파일명용 레이블
            slice_bills: list[dict] = []
            detail_by_id: dict = {}
            extra_phrases: tuple[str, ...] = ()

            if passed:
                trigger_type = "규제 법안 가결"
                slice_bills = passed[:3]
                key_data = "\n".join(
                    [
                        f"- {b['bill_name']} ({b['proc_result_cd']}, {b['proc_dt']})"
                        for b in slice_bills
                    ]
                )
                file_label = passed[0]["bill_name"][:15]
                try:
                    db = get_client()
                    pids = [b["bill_id"] for b in slice_bills if b.get("bill_id")]
                    if pids:
                        rows = (
                            db.table("bills")
                            .select(
                                "bill_id,proposer,rst_proposer,proposer_kind,proposer_members,committee"
                            )
                            .in_("bill_id", pids)
                            .execute()
                            .data
                        )
                        detail_by_id = {r["bill_id"]: r for r in (rows or [])}
                except Exception:
                    detail_by_id = {}

            elif clusters:
                trigger_type = "동일 이슈 집중 발의"
                first_key, first_group = list(clusters.items())[0]
                file_label = first_key[:15]  # 예: "약사법", "정보통신망"
                ind = industry_name(first_group[0]["ksic_code"])
                slice_bills = list(first_group[:8])
                key_data = f"[{ind}] '{first_key}…' 관련 법안 {len(first_group)}건 집중 발의\n"
                try:
                    db = get_client()
                    bill_ids = [b["bill_id"] for b in slice_bills if b.get("bill_id")]
                    if bill_ids:
                        detail_rows = (
                            db.table("bills")
                            .select(
                                "bill_id,bill_name,propose_dt,proposer,rst_proposer,proposer_kind,"
                                "proposer_members,committee,proposal_reason"
                            )
                            .in_("bill_id", bill_ids)
                            .execute()
                            .data
                        )
                        detail_by_id = {r["bill_id"]: r for r in (detail_rows or [])}
                        for b in slice_bills:
                            detail = detail_by_id.get(b.get("bill_id"), {})
                            reason = detail.get("proposal_reason") or ""
                            reason_summary = (
                                reason[:300].replace("\n", " ") if reason else "제안이유 미수집"
                            )
                            committee = detail.get("committee") or b.get("committee", "")
                            key_data += (
                                f"- {b['bill_name']} ({b['propose_dt']}, {detail.get('proposer', '')})\n"
                                f"  소관위원회: {committee}\n"
                                f"  제안이유: {reason_summary}\n"
                            )
                    else:
                        key_data += "\n".join(
                            [f"- {b['bill_name']} ({b['propose_dt']})" for b in first_group[:5]]
                        )
                except Exception:
                    key_data += "\n".join(
                        [f"- {b['bill_name']} ({b['propose_dt']})" for b in first_group[:5]]
                    )

            elif intl:
                trigger_type = "국제 규제 연동 법안"
                slice_bills = [b for b, _ in intl[:3]]
                extra_phrases = tuple(ref for _, ref in intl[:3])
                key_data = "\n".join(
                    [f"- {b['bill_name']} [참조: {ref}]" for b, ref in intl[:3]]
                )
                file_label = intl[0][0]["bill_name"][:15]
            else:
                trigger_type = "계류 규제법안 심사 진전"
                slice_bills = moved[:3]
                key_data = "\n".join(
                    [
                        f"- {b['bill_name']} ({b.get('committee_result', '')})"
                        for b in slice_bills
                    ]
                )
                file_label = moved[0]["bill_name"][:15]
                try:
                    db = get_client()
                    mids = [b["bill_id"] for b in slice_bills if b.get("bill_id")]
                    if mids:
                        rows = (
                            db.table("bills")
                            .select(
                                "bill_id,proposer,rst_proposer,proposer_kind,proposer_members,committee"
                            )
                            .in_("bill_id", mids)
                            .execute()
                            .data
                        )
                        detail_by_id = {r["bill_id"]: r for r in (rows or [])}
                except Exception:
                    detail_by_id = {}

            name_whitelist = build_weekly_trigger_whitelist(
                slice_bills,
                detail_by_id if detail_by_id else None,
                extra_phrases=extra_phrases if extra_phrases else None,
            )

            llm = resolve_article_llm_provider()
            print(f"\n📝 기사 초안 생성 중 ({llm}, {trigger_type})...")
            draft = generate_article_draft(
                key_data, trigger_type, name_whitelist=name_whitelist
            )
            print("\n" + "=" * 65)
            print(draft)
            print("=" * 65)

            # Obsidian 저장 (파일명: 날짜 + 법안명)
            save_to_obsidian(file_label or trigger_type, draft)

            # Slack으로 초안 전송
            if args.slack:
                from utils.slack import send_article_draft
                send_article_draft(trigger_type, draft, str(TODAY))

        print(f"\n💡 월간 리포트: python article_weekly.py --monthly")
        print(f"💡 Slack 전송: python article_weekly.py --slack")
        print(f"💡 기사 초안:  python article_weekly.py --slack --draft")


if __name__ == "__main__":
    main()
