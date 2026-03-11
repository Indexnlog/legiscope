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

# 공공데이터포털 OpenAPI 엔드포인트
BILL_LIST_URL = "https://open.assembly.go.kr/portal/openapi/TVBPMBILL11"
BILL_DETAIL_URL = "https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn"
COMMITTEE_URL = "https://open.assembly.go.kr/portal/openapi/CMAUERDALEGPROP"
PROMULGATION_URL = "https://open.law.go.kr/LSO/openApi/lawSearch.do"
