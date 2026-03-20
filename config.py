import os
from dotenv import load_dotenv

load_dotenv()


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

# 공공데이터포털 OpenAPI 엔드포인트
BILL_LIST_URL = "https://open.assembly.go.kr/portal/openapi/TVBPMBILL11"
BILL_DETAIL_URL = "https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn"
COMMITTEE_URL = "https://open.assembly.go.kr/portal/openapi/CMAUERDALEGPROP"
PROMULGATION_URL = "https://open.law.go.kr/LSO/openApi/lawSearch.do"
