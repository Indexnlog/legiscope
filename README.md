# Legiscope

Korean Legislative Radar -- 입법/정책 시그널 수집 및 산업 영향 분석 파이프라인.

## Overview

국회 발의 법안, 행정예고, 입법예고, 정책브리핑, 공포법령 등 다중 소스에서 입법 동향을 수집하고, KSIC 산업분류 자동 태깅 + 규제/지원 분류를 수행합니다. NEWS EPOCH 생태계의 입법 인텔리전스 소스.

## Key Features

- **6개 소스 수집**: 법안, 위원회 보고, 입법예고, 행정예고, 정책브리핑, 공포법령
- **KSIC 산업분류**: 92+ 업종 자동 태깅
- **규제 유형 분류**: 규제/지원/중립 자동 판별
- **자동화**: 주간 (금 07:00) + 일간 (09:00) 파이프라인
- **대시보드**: Next.js 기반 리스크/기업/프로세스 뷰
- **기사 생성**: LLM 기반 팩트 기반 초안 (Claude/Gemini)

## Quick Start

```bash
pip install -r requirements.txt
cp .env.example .env
# .env에 API 키 설정

# 주간 전체 파이프라인
PYTHONPATH=. python run_weekly.py

# 개별 실행
PYTHONPATH=. python collectors/bills.py
PYTHONPATH=. python mapper/apply_ksic.py
PYTHONPATH=. python processors/industry_signals.py
```

## Dashboard

```bash
cd dashboard-next && npm install && npm run dev
# http://localhost:3000/risk
```

## Stack

- **Backend**: Python, SQLAlchemy, Supabase PostgreSQL
- **Frontend**: Next.js 14, TypeScript, Tailwind, Recharts
- **LLM**: Claude API / Gemini (기사 생성)
- **Automation**: Windows Task Scheduler

## Structure

```
collectors/             # 소스별 수집기 (bills, committee, admin_laws...)
mapper/                 # KSIC 태깅 + 규제 분류
processors/             # 산업 시그널 집계
db/                     # Supabase 클라이언트 + 스키마
dashboard-next/         # Next.js 대시보드
article_*.py            # News Epoch 기사 생성
docs/                   # 아키텍처, 파이프라인, 운영 문서
signals/                # 산업 시그널 CSV (버전 관리)
```

## Pipeline Flow

```
Government APIs -> Collectors -> Supabase -> Mappers -> Processors
                                                 |-> Dashboard
                                                 |-> CSV Export
                                                 |-> Article Drafts
```

## API Sources

- **국회**: open.assembly.go.kr (법안, 위원회)
- **법제처**: open.law.go.kr (공포법령)
- **정부 데이터**: korea.kr (정책브리핑, 예고)

## Environment

```bash
SUPABASE_URL=               # Supabase (필수)
SUPABASE_ANON_KEY=          # Supabase (필수)
ASSEMBLY_API_KEY=           # 국회 API (필수)
DATA_GO_KR_API_KEY=         # 공공데이터포털 (필수)
ANTHROPIC_API_KEY=          # Claude (기사 생성)
GEMINI_API_KEY=             # Gemini (기사 생성)
SLACK_TOKEN=                # Slack 알림 (선택)
```

## Docs

- [architecture.md](docs/architecture.md) -- 시스템 설계
- [pipeline.md](docs/pipeline.md) -- 데이터 흐름
- [operations.md](docs/operations.md) -- 스케줄링/운영
- [news_epoch_data_policy.md](docs/news_epoch_data_policy.md) -- 팩트 기반 기사 정책
