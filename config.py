import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=True)


def _get(key: str) -> str | None:
    """로컬: .env / Streamlit Cloud: st.secrets 에서 우선 순위로 읽기"""
    val = os.getenv(key)
    if val:
        return val
    try:
        import streamlit as st
        return st.secrets.get(key)
    except Exception:
        return None


DATA_GO_KR_KEY = _get("DATA_GO_KR_API_KEY")
ASSEMBLY_KEY = _get("ASSEMBLY_API_KEY")
SUPABASE_URL = _get("SUPABASE_URL")
SUPABASE_ANON_KEY = _get("SUPABASE_ANON_KEY")
LAW_OC = _get("LAW_OC")  # 법제처 OC코드 (open.law.go.kr 가입 이메일 ID)

# 기사 초안 LLM: gemini | claude (미설정 시 GEMINI_API_KEY 있으면 gemini, 아니면 claude)
ARTICLE_LLM_PROVIDER = (_get("ARTICLE_LLM_PROVIDER") or "").strip().lower()
GEMINI_API_KEY = _get("GEMINI_API_KEY")
GEMINI_MODEL = _get("GEMINI_MODEL") or "gemini-2.5-flash"
ANTHROPIC_API_KEY = _get("ANTHROPIC_API_KEY")
CLAUDE_ARTICLE_MODEL = _get("CLAUDE_ARTICLE_MODEL") or "claude-sonnet-4-6"

# NEWS EPOCH Obsidian/Dropbox 경로. 미설정 시 현재 Second_Brain 기준 기본 경로 사용.
NEWS_EPOCH_OBSIDIAN_ROOT = _get("NEWS_EPOCH_OBSIDIAN_ROOT")
NEWS_EPOCH_ARTICLE_DRAFT_DIR = _get("NEWS_EPOCH_ARTICLE_DRAFT_DIR")

_DEFAULT_NEWS_EPOCH_OBSIDIAN_ROOT = Path(
    r"C:\Users\ekapr\Dropbox\앱\remotely-save\Second_Brain"
)
_DEFAULT_NEWS_EPOCH_ARTICLE_DRAFT_DIR = (
    _DEFAULT_NEWS_EPOCH_OBSIDIAN_ROOT
    / "20_Pitchdeck"
    / "22_NEWS_EPOCH"
    / "2026 입법레이더-Legiscope"
    / "01_기사초안"
)

# NEWS EPOCH Obsidian 작성 지침 (.md). 미설정 시 아래 경로에 파일이 있으면 자동 로드.
NEWS_EPOCH_GUIDELINE_PATH = _get("NEWS_EPOCH_GUIDELINE_PATH")
_DEFAULT_NEWS_EPOCH_GUIDE = (
    _DEFAULT_NEWS_EPOCH_OBSIDIAN_ROOT
    / "20_Pitchdeck"
    / "22_NEWS_EPOCH"
    / "NEWS EPOCH 작성 지침.md"
)


def resolve_news_epoch_obsidian_root() -> Path:
    if NEWS_EPOCH_OBSIDIAN_ROOT:
        return Path(NEWS_EPOCH_OBSIDIAN_ROOT)
    return _DEFAULT_NEWS_EPOCH_OBSIDIAN_ROOT


def resolve_news_epoch_article_draft_dir() -> Path:
    if NEWS_EPOCH_ARTICLE_DRAFT_DIR:
        return Path(NEWS_EPOCH_ARTICLE_DRAFT_DIR)
    return _DEFAULT_NEWS_EPOCH_ARTICLE_DRAFT_DIR


def resolve_news_epoch_guideline_path() -> Path | None:
    if NEWS_EPOCH_GUIDELINE_PATH:
        p = Path(NEWS_EPOCH_GUIDELINE_PATH)
        return p if p.is_file() else None
    return _DEFAULT_NEWS_EPOCH_GUIDE if _DEFAULT_NEWS_EPOCH_GUIDE.is_file() else None


# 공공데이터포털 OpenAPI 엔드포인트
BILL_LIST_URL = "https://open.assembly.go.kr/portal/openapi/TVBPMBILL11"
BILL_DETAIL_URL = "https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn"
COMMITTEE_URL = "https://open.assembly.go.kr/portal/openapi/CMAUERDALEGPROP"
PROMULGATION_URL = "https://open.law.go.kr/LSO/openApi/lawSearch.do"
