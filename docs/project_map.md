# Legiscope — 로컬 · GitHub · Obsidian 한눈에

## 원격 · 브랜치

| 항목 | 값 |
|------|-----|
| GitHub | [Indexnlog/legiscope](https://github.com/Indexnlog/legiscope) (`origin`) |
| 기본 브랜치 | `master` |
| 로컬 경로 (예시) | `C:\Users\ekapr\legiscope` |

## 상위 디렉터리 (역할 체크리스트)

```
legiscope/
├── collectors/      # 소스별 수집 (발의, 상임위, 예고, 공포 등)
├── db/              # Supabase 클라이언트 · SQL 스키마
├── mapper/          # KSIC · 규제/지원 분류
├── processors/      # industry_signals 등 집계
├── dashboard-next/  # Next.js 대시보드
├── signals/         # 생성 CSV (다운스트림·커밋 대상일 수 있음)
├── output/          # 로그·검증 산출물 — 레포 정본 아님 (.gitignore)
├── docs/            # architecture, pipeline, operations, 본 파일
├── utils/
├── article_*.py, export_csv.py, report.py, run_weekly.py, config.py
├── data/raw/        # 원시 데이터 (일반적으로 로컬만)
└── .env             # 비밀값 — 커밋 금지
```

## Obsidian (볼트는 레포 밖)

- **역할:** 서술·상태·운영 맥락 (`docs/architecture.md` 경계 정의).
- **루틴:** 일일 `작업일지` · 이정표 시 `진행상황 타임라인` · 큰 변화 시 프로젝트 개요 (`docs/operations.md`).

## Git 위생 (이 레포 기준)

- `output/` — 생성물 전부 무시 (스크립트가 필요 시 디렉터리 생성).
- `*.bak` — 편집 백업 무시.
- `signals/*.csv` — 파이프라인 산출이면 **의도적으로** 커밋 여부 결정 (지금처럼 수정만 두고 두지 말고, 반영할지 되돌릴지 정리).
- `.claude/` — 로컬 커맨드용이면 커밋 안 함; 팀 공유면 선택적으로 추적.

## 주간 한 줄

`run_weekly.py` → 수집 → DB 반영 → KSIC/규제 → `industry_signals` → CSV/export · (선택) enricher.

## 상세 문서

- [architecture.md](./architecture.md) · [pipeline.md](./pipeline.md) · [operations.md](./operations.md) · 루트 [CLAUDE.md](../CLAUDE.md)
