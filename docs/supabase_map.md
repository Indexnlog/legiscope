# Supabase 프로젝트 전체 지도

> 최종 업데이트: 2026-03-31

---

## 계정 개요

| 계정 | 조직명 | MCP 연결 | 프로젝트 |
|------|--------|----------|----------|
| **개인 계정** | Indexnlog's Org (`kbilaiarzckvpajjkomr`) | O (MCP 직접 조회 가능) | the-origin, flow-tracer |
| **회사 계정** | _(미확인)_ | X (Python 클라이언트로 접근) | legiscope |

---

## 1. legiscope (회사 계정)

| 항목 | 값 |
|------|----|
| Project ID | `jbxufhsrvvhygmzftkre` |
| Region | _(미확인 — .env 참조)_ |
| 용도 | 한국 입법·정책 데이터 수집 파이프라인 |
| 로컬 코드 | `C:\Users\ekapr\Documents\GitHub\legiscope\` |
| .env 위치 | `C:\Users\ekapr\Documents\GitHub\legiscope\.env` |
| 접근 방법 | `db.client.get_client()` (Python supabase-py) |

### 테이블

| 테이블 | rows | 설명 | PK |
|--------|------|------|----|
| `bills` | 43,197 | 국회 발의 법안 (KSIC 태깅, 규제/지원 분류) | `bill_id` |
| `pre_announcements` | 353 | 입법예고 (부처·행정·지방) | `id` |
| `admin_laws` | 464 | 시행령·시행규칙·고시·훈령 | `id` |
| `promulgations` | 7,022 | 공포 법령 | `id` |
| `policy_briefs` | 203 | 정책브리핑 (RSS 수집) | `id` |
| `industry_signals` | 582 | 산업별 입법활성도·규제리스크 지표 (매주 upsert) | `(ksic_code, ksic_level)` |

### bills 주요 컬럼

```
bill_id, bill_no, bill_name, proposer, rst_proposer, proposer_kind,
proposer_members (jsonb), committee, propose_dt, pass_gubun,
proc_result_cd, age, link_url,
committee_result, committee_dt, proc_dt,        -- v2 추가
regulation_type,                                 -- v3 추가 ('규제'|'지원'|'중립')
created_at
```

### industry_signals 주요 컬럼

```
ksic_code, ksic_level (1=대분류, 3=중분류),
total_bills, passed_bills, processed_bills, pending_bills, pass_rate,
recent_90d_bills, avg_days_to_pass,
reg_count, support_count, neutral_count, reg_ratio,
reg_pass_rate, risk_score, updated_at
```

---

## 2. the-origin (개인 계정)

| 항목 | 값 |
|------|----|
| Project ID | `mtlvvzcyfxopegnkmhdj` |
| Region | ap-south-1 |
| 용도 | 인물·회사·투자 DB + 다중 도메인 데이터 수집 |
| MCP 직접 조회 | O |

### 테이블

| 테이블 | rows | 설명 |
|--------|------|------|
| `people` | 2,579 | 인물 (pdeck 연동) |
| `educations` | 1,026 | 학력 → people FK |
| `careers` | 3,050 | 경력 → people, companies FK |
| `companies` | 3,834 | 기업 (유니콘, 피치덱 플래그) |
| `dashboard_state` | 1 | 대시보드 HTML 캐시 |
| `pipeline_runs` | 0 | 파이프라인 실행 로그 |
| `court_opinions` | 305 | 미국 법원 의견 |
| `court_dockets` | 315 | 미국 법원 사건부 |
| `clinical_trials` | 3,909 | 임상시험 (ClinicalTrials.gov) |
| `github_ai_repos` | 623 | AI 관련 GitHub 레포 |
| `hf_models` | 789 | HuggingFace 모델 |
| `fda_drugs` | 7 | FDA 의약품 승인 |
| `fda_devices` | 104 | FDA 의료기기 승인 |
| `hira_hospitals` | 79,535 | 건강보험심사평가원 병원 |
| `apt_trades` | 239,750 | 아파트 실거래가 |
| `noctua_filings` | 0 | SEC Form D 스코어링 (NOCTUA) |
| `noctua_bdc_snapshots` | 0 | BDC 일별 스냅샷 (NOCTUA) |

### 주요 관계

```
people ──< educations   (person_id FK)
people ──< careers      (person_id FK)
companies ──< careers   (company_id FK)
```

---

## 3. flow-tracer (개인 계정)

| 항목 | 값 |
|------|----|
| Project ID | `kdjjcdhigbkukqwxjoup` |
| Region | ap-northeast-2 |
| 용도 | DART 전자공시 + 투자/인수 + 펀드 |
| MCP 직접 조회 | O |

### 테이블

| 테이블 | rows | 설명 |
|--------|------|------|
| `disclosures` | 17,263 | DART 전자공시 (접수번호 PK) |
| `investments` | 1,273 | 투자/인수 공시 파싱 결과 |
| `funds` | 1,168 | 펀드 정보 (KVIC 등) |

### investments 주요 컬럼

```
rcept_no, rcept_dt, disc_type,
investor_name, target_name, target_industry,
acqs_amount, acqs_amount_bil, acqs_purpose, acqs_method,
relation, allotment_type, allottee
```

---

## 접근 방법 요약

| 프로젝트 | Claude MCP | Python 클라이언트 | 비고 |
|----------|-----------|-------------------|------|
| the-origin | `execute_sql(project_id="mtlvvzcyfxopegnkmhdj")` | - | 개인 계정 |
| flow-tracer | `execute_sql(project_id="kdjjcdhigbkukqwxjoup")` | - | 개인 계정 |
| legiscope | X | `cd Documents/GitHub/legiscope && PYTHONPATH=. python ...` | 회사 계정, .env 필요 |

### legiscope 빠른 조회 템플릿

```bash
cd "C:/Users/ekapr/Documents/GitHub/legiscope" && PYTHONPATH=. python -u -c "
import sys; sys.stdout.reconfigure(encoding='utf-8')
from db.client import get_client
sb = get_client()
res = sb.table('bills').select('*').limit(10).execute()
for r in res.data:
    print(r)
"
```
