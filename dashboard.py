"""
Legiscope 대시보드
- 탭 1: 입법 프로세스 가이드
- 탭 2: 산업별 리스크 현황
- 탭 3: 산업 드릴다운
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from db.client import get_client

st.set_page_config(
    page_title="Legiscope — 입법 리스크 모니터",
    page_icon="⚖",
    layout="wide",
)

# ── KSIC 중분류 한글명 (주요 80개) ──────────────────────────────────────────
KSIC_NAMES = {
    "011": "작물재배업", "012": "축산업", "014": "농업 지원 서비스업",
    "021": "임업", "031": "어로어업", "032": "양식업",
    "101": "도축·육가공", "102": "수산물 가공", "103": "과실·채소 가공",
    "104": "유지 제조", "105": "낙농·아이스크림", "106": "곡물·전분",
    "107": "기타 식품", "108": "동물사료", "110": "음료 제조",
    "120": "담배 제조", "131": "방적·방사", "139": "기타 섬유",
    "141": "봉제의복", "151": "가죽·가방·신발",
    "161": "제재·목재", "162": "합판·목재제품",
    "171": "펄프·제지", "172": "판지·종이 제품",
    "181": "인쇄·기록매체",
    "191": "코크스·연탄", "192": "석유정제",
    "201": "기초화학", "202": "농약·비료", "203": "합성수지",
    "204": "기타 화학", "205": "세제·화장품",
    "206": "의약품", "210": "의약품 제조",
    "211": "고무제품", "212": "플라스틱",
    "221": "유리·요업", "222": "내화·비금속",
    "231": "1차 철강", "232": "1차 비철금속",
    "241": "금속가공",
    "281": "일반목적 기계", "282": "특수목적 기계",
    "291": "자동차·엔진", "292": "자동차 부품",
    "301": "선박", "303": "항공기",
    "311": "전자부품·반도체", "312": "컴퓨터·주변기기",
    "313": "통신·방송장비", "314": "영상·음향",
    "320": "의료·정밀기기",
    "351": "전기 공급", "352": "가스 공급", "360": "수도·하수",
    "381": "폐기물 처리",
    "410": "건물 건설", "421": "도로·철도 건설",
    "451": "자동차 판매", "452": "자동차 수리",
    "461": "상품 중개·도매", "471": "종합소매",
    "491": "철도 운송", "492": "도로 여객", "493": "화물 운송",
    "501": "해상 여객", "502": "해상 화물",
    "511": "항공 여객", "512": "항공 화물",
    "521": "창고·운송 지원",
    "581": "출판", "591": "영상·음악",
    "612": "유선통신", "613": "무선통신", "619": "기타 통신",
    "620": "컴퓨터 프로그래밍",
    "631": "자료처리·DB", "639": "기타 정보서비스",
    "641": "은행·저축", "642": "신탁", "649": "기타 금융",
    "651": "생명보험", "652": "손해보험",
    "661": "금융 지원서비스", "662": "보험 지원서비스",
    "681": "부동산 임대·공급",
    "691": "법률·회계", "692": "건축·엔지니어링",
    "701": "연구개발",
    "721": "광고", "722": "시장조사",
    "731": "전문 디자인",
    "841": "공공행정·국방",
    "851": "초중등교육", "852": "고등교육", "853": "기타 교육",
    "861": "병원", "862": "의원", "869": "기타 보건",
    "871": "사회복지 입소시설", "872": "사회복지 서비스",
    "881": "창작·예술", "882": "스포츠·오락",
    "901": "협회·단체", "999": "기타",
}

KSIC_L1 = {
    "0": "농림어업", "1": "광업", "2": "제조업(식품/섬유)",
    "3": "제조업(화학/금속)", "4": "제조업(기계/전자)",
    "5": "전기·가스·수도", "6": "건설업", "7": "서비스업(유통/운수)",
    "8": "서비스업(금융/전문)", "9": "교육·보건·공공",
}


@st.cache_data(ttl=3600)
def load_industry_signals():
    db = get_client()
    r = db.table("industry_signals").select("*").eq("ksic_level", 3).order("as_of_date", desc=True).execute()
    df = pd.DataFrame(r.data)
    if df.empty:
        return pd.DataFrame()
    latest = df["as_of_date"].max()
    df = df[df["as_of_date"] == latest].copy()
    df["ksic_str"] = df["ksic_code"].astype(str).str.zfill(3)
    df["산업명"] = df["ksic_str"].map(KSIC_NAMES).fillna(df["ksic_str"])
    return df


@st.cache_data(ttl=3600)
def load_bills_sample(ksic_code: str):
    db = get_client()
    r = (
        db.table("bills")
        .select("bill_name, propose_dt, proc_result_cd, regulation_type, committee_result")
        .contains("ksic_codes", [ksic_code])
        .order("propose_dt", desc=True)
        .limit(200)
        .execute()
    )
    return pd.DataFrame(r.data)


@st.cache_data(ttl=3600)
def load_funnel_stats():
    db = get_client()
    total    = db.table("bills").select("bill_id", count="exact").execute().count
    committee = db.table("bills").select("bill_id", count="exact").not_.is_("committee_result", "null").execute().count
    passed   = db.table("bills").select("bill_id", count="exact").in_("proc_result_cd", ["원안가결", "수정가결"]).execute().count
    promulg  = db.table("promulgations").select("id", count="exact").execute().count
    pre_ann  = db.table("pre_announcements").select("id", count="exact").execute().count
    reg_count = db.table("bills").select("bill_id", count="exact").eq("regulation_type", "규제").execute().count
    sup_count = db.table("bills").select("bill_id", count="exact").eq("regulation_type", "지원").execute().count
    return {
        "입법예고": pre_ann,
        "발의": total,
        "상임위 심사": committee,
        "본회의 가결": passed,
        "공포": promulg,
        "reg_count": reg_count,
        "sup_count": sup_count,
    }


# ── 레이아웃 ──────────────────────────────────────────────────────────────────
st.title("⚖ Legiscope — 입법 리스크 모니터")
st.caption("국회 입법 데이터 기반 산업별 규제·지원 법안 현황 | 21·22대 국회 42,736건")

tab1, tab2, tab3 = st.tabs(["📖 입법 프로세스 이해", "📊 산업별 리스크 현황", "🔍 산업 드릴다운"])


# ═══════════════════════════════════════════════════════════════════
# TAB 1 — 입법 프로세스 가이드
# ═══════════════════════════════════════════════════════════════════
with tab1:
    st.subheader("법안은 어떻게 만들어지는가?")
    st.markdown(
        "법이 만들어지기까지는 최소 5단계를 거칩니다. "
        "대부분의 법안은 **상임위원회**에서 멈추고, 본회의까지 가는 것은 전체의 **약 9.5%**에 불과합니다."
    )

    stats = load_funnel_stats()

    # 단계 설명 카드
    col1, col2, col3, col4, col5 = st.columns(5)
    stages = [
        ("①\n입법예고", stats["입법예고"], "정부·의원이 법안을\n사전 공고하는 단계\n(준비 중인 법안 예측 가능)", "#4A90D9"),
        ("②\n발의", stats["발의"], "국회의원 또는 정부가\n공식 법안을 제출\n(이때부터 추적 시작)", "#5BA85F"),
        ("③\n상임위 심사", stats["상임위 심사"], "소관 상임위원회에서\n법안 내용 심의\n(여기서 대부분 폐기)", "#F5A623"),
        ("④\n본회의 가결", stats["본회의 가결"], "전체 의원 투표로\n법안 최종 의결\n(평균 259일 소요)", "#E8554E"),
        ("⑤\n공포·시행", stats["공포"], "대통령 서명 후\n관보 게재·시행\n(법적 효력 발생)", "#9B59B6"),
    ]

    for col, (label, count, desc, color) in zip([col1, col2, col3, col4, col5], stages):
        with col:
            st.markdown(
                f"""<div style='background:{color}15; border-left:4px solid {color};
                    padding:12px; border-radius:6px; min-height:160px;'>
                    <div style='font-size:14px; font-weight:700; color:{color};
                        white-space:pre-line;'>{label}</div>
                    <div style='font-size:28px; font-weight:800; margin:8px 0;'>{count:,}건</div>
                    <div style='font-size:11px; color:#666; white-space:pre-line;'>{desc}</div>
                </div>""",
                unsafe_allow_html=True,
            )

    st.markdown("---")

    # 퍼널 차트
    col_l, col_r = st.columns([3, 2])
    with col_l:
        st.markdown("#### 법안 생존율 퍼널")
        funnel_labels = ["발의", "상임위 심사", "본회의 가결", "공포"]
        funnel_values = [stats["발의"], stats["상임위 심사"], stats["본회의 가결"], stats["공포"]]
        fig_funnel = go.Figure(go.Funnel(
            y=funnel_labels,
            x=funnel_values,
            textinfo="value+percent initial",
            marker=dict(color=["#5BA85F", "#F5A623", "#E8554E", "#9B59B6"]),
        ))
        fig_funnel.update_layout(margin=dict(l=0, r=0, t=20, b=0), height=320)
        st.plotly_chart(fig_funnel, use_container_width=True)

    with col_r:
        st.markdown("#### 법안 유형 분포")
        total = stats["발의"]
        reg = stats["reg_count"]
        sup = stats["sup_count"]
        neutral = total - reg - sup

        fig_pie = px.pie(
            values=[reg, sup, neutral],
            names=["규제 법안", "지원 법안", "중립 법안"],
            color_discrete_sequence=["#E8554E", "#5BA85F", "#AAAAAA"],
            hole=0.45,
        )
        fig_pie.update_traces(textinfo="percent+label")
        fig_pie.update_layout(margin=dict(l=0, r=0, t=20, b=0), height=320,
                              showlegend=False)
        st.plotly_chart(fig_pie, use_container_width=True)

    st.markdown("---")

    # 용어 설명
    st.markdown("#### 주요 개념 설명")
    col_a, col_b, col_c = st.columns(3)
    with col_a:
        st.markdown("""
**규제 법안 🔴**
기업 활동에 의무·제한·처벌을 부과하는 법안.
예) 중대재해처벌법, 공정거래법 개정안

통과 시 해당 산업의 **준수 비용 상승** 또는 **사업 구조 변경** 요구.
""")
    with col_b:
        st.markdown("""
**지원 법안 🟢**
특정 산업·기업에 예산·세제혜택·인허가 완화를 제공하는 법안.
예) 반도체특별법, 스타트업 세제지원법

통과 시 해당 산업의 **성장 모멘텀** 또는 **비용 절감** 기회.
""")
    with col_c:
        st.markdown("""
**리스크 스코어 📊**
```
risk_score = 규제법안수 × 규제법안가결률
```
숫자가 높을수록 실제로 **규제가 통과되고 있는** 산업.
단순 발의 건수가 아닌 '실제 입법화'된 규제의 무게를 반영.
""")


# ═══════════════════════════════════════════════════════════════════
# TAB 2 — 산업별 리스크 현황
# ═══════════════════════════════════════════════════════════════════
with tab2:
    df = load_industry_signals()
    if df.empty:
        st.warning("데이터를 불러올 수 없습니다.")
        st.stop()

    st.subheader("산업별 입법 리스크 현황")

    # 상단 요약 지표
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("커버 산업 수", f"{len(df)}개")
    c2.metric("총 법안 수", f"{df['total_bills'].sum():,}건")
    top_risk = df.nlargest(1, "risk_score").iloc[0]
    c3.metric("최고 리스크 산업", top_risk["산업명"], f"스코어 {top_risk['risk_score']:.1f}")
    top_active = df.nlargest(1, "recent_90d_bills").iloc[0]
    c4.metric("최근 90일 최다 법안", top_active["산업명"], f"{top_active['recent_90d_bills']:.0f}건")

    st.markdown("---")

    col_left, col_right = st.columns([1, 1])

    with col_left:
        st.markdown("#### 리스크 스코어 TOP 20")
        top20 = df.nlargest(20, "risk_score")[["산업명", "risk_score", "reg_ratio", "pass_rate", "total_bills"]]
        top20.columns = ["산업명", "리스크스코어", "규제비율(%)", "가결률(%)", "전체법안"]
        fig_bar = px.bar(
            top20.sort_values("리스크스코어"),
            x="리스크스코어",
            y="산업명",
            orientation="h",
            color="리스크스코어",
            color_continuous_scale="Reds",
            text="리스크스코어",
        )
        fig_bar.update_traces(texttemplate="%{text:.1f}", textposition="outside")
        fig_bar.update_layout(
            margin=dict(l=0, r=40, t=10, b=0),
            height=520,
            coloraxis_showscale=False,
            yaxis_title="",
            xaxis_title="리스크 스코어",
        )
        st.plotly_chart(fig_bar, use_container_width=True)

    with col_right:
        st.markdown("#### 최근 90일 입법 활동 TOP 20")
        top20a = df.nlargest(20, "recent_90d_bills")[["산업명", "recent_90d_bills", "reg_ratio", "total_bills"]]
        top20a.columns = ["산업명", "최근90일", "규제비율(%)", "전체법안"]
        fig_bar2 = px.bar(
            top20a.sort_values("최근90일"),
            x="최근90일",
            y="산업명",
            orientation="h",
            color="최근90일",
            color_continuous_scale="Blues",
            text="최근90일",
        )
        fig_bar2.update_traces(texttemplate="%{text:.0f}건", textposition="outside")
        fig_bar2.update_layout(
            margin=dict(l=0, r=40, t=10, b=0),
            height=520,
            coloraxis_showscale=False,
            yaxis_title="",
            xaxis_title="법안 건수 (최근 90일)",
        )
        st.plotly_chart(fig_bar2, use_container_width=True)

    st.markdown("---")

    # 산포도: 전체 법안 vs 규제비율
    st.markdown("#### 입법 활동량 × 규제집중도 (버블 = 리스크스코어)")
    fig_scatter = px.scatter(
        df,
        x="total_bills",
        y="reg_ratio",
        size=df["risk_score"].clip(lower=1),
        color="risk_score",
        color_continuous_scale="RdYlGn_r",
        hover_name="산업명",
        hover_data={"total_bills": True, "reg_ratio": True, "risk_score": ":.1f", "pass_rate": True},
        labels={
            "total_bills": "전체 법안 수",
            "reg_ratio": "규제법안 비율 (%)",
            "risk_score": "리스크 스코어",
        },
    )
    fig_scatter.update_layout(height=420, margin=dict(l=0, r=0, t=10, b=0))
    st.plotly_chart(fig_scatter, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════
# TAB 3 — 산업 드릴다운
# ═══════════════════════════════════════════════════════════════════
with tab3:
    df = load_industry_signals()
    if df.empty:
        st.stop()

    st.subheader("산업별 상세 법안 현황")

    # 산업 선택
    sorted_df = df.sort_values("risk_score", ascending=False)
    options = sorted_df["산업명"].tolist()
    selected = st.selectbox("산업 선택 (리스크 스코어 높은 순)", options)

    row = df[df["산업명"] == selected].iloc[0]
    ksic = row["ksic_str"]

    # 지표 카드
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("전체 법안", f"{row['total_bills']:.0f}건")
    c2.metric("가결률", f"{row['pass_rate']:.1f}%")
    c3.metric("규제법안 비율", f"{row['reg_ratio']:.1f}%")
    c4.metric("리스크 스코어", f"{row['risk_score']:.1f}")
    c5.metric("최근 90일 법안", f"{row['recent_90d_bills']:.0f}건")

    st.markdown("---")

    with st.spinner("법안 목록 불러오는 중..."):
        bills_df = load_bills_sample(ksic)

    if bills_df.empty:
        st.info("해당 산업의 법안 데이터가 없습니다.")
    else:
        # 규제분류별 색상
        reg_counts = bills_df["regulation_type"].value_counts()
        col_pie, col_status = st.columns(2)

        with col_pie:
            st.markdown("#### 법안 유형 분포")
            fig_p = px.pie(
                values=reg_counts.values,
                names=reg_counts.index,
                color=reg_counts.index,
                color_discrete_map={"규제": "#E8554E", "지원": "#5BA85F", "중립": "#AAAAAA"},
                hole=0.4,
            )
            fig_p.update_layout(height=280, margin=dict(l=0, r=0, t=0, b=0), showlegend=True)
            st.plotly_chart(fig_p, use_container_width=True)

        with col_status:
            st.markdown("#### 처리 상태 분포")
            status_counts = bills_df["proc_result_cd"].fillna("계류중").value_counts()
            fig_s = px.bar(
                x=status_counts.values,
                y=status_counts.index,
                orientation="h",
                color=status_counts.index,
                color_discrete_sequence=px.colors.qualitative.Pastel,
            )
            fig_s.update_layout(height=280, margin=dict(l=0, r=0, t=0, b=0),
                                showlegend=False, yaxis_title="", xaxis_title="건수")
            st.plotly_chart(fig_s, use_container_width=True)

        # 법안 목록 테이블
        st.markdown(f"#### 법안 목록 (최근 {len(bills_df)}건)")
        display_df = bills_df[["bill_name", "propose_dt", "regulation_type", "proc_result_cd"]].copy()
        display_df.columns = ["법안명", "발의일", "유형", "처리결과"]
        display_df["처리결과"] = display_df["처리결과"].fillna("계류중")

        def highlight_reg(val):
            if val == "규제":
                return "background-color: #fde8e8"
            elif val == "지원":
                return "background-color: #e8f5e9"
            return ""

        st.dataframe(
            display_df.style.applymap(highlight_reg, subset=["유형"]),
            use_container_width=True,
            height=400,
        )
