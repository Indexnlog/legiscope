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
├── signals/         # industry_signals CSV — Git 추적 유지, 갱신 시 의도적으로 커밋 (아래 표)
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
- `.claude/` — 로컬 전용; `.gitignore`에 포함됨.

### `signals/*.csv` — 어떤 선택이 나을까

**추천 (이 프로젝트 기준):** 파일은 **계속 Git에 추적**하고, 파이프라인으로 숫자가 바뀌었을 때만 **`git add` + `git commit`** 한다.  
이유: 레포만 클론해도 “그 시점 지표 스냅샷”을 볼 수 있고, 대시보드·기사·외부 도구가 파일 경로만으로 붙이기 쉽다. DB·`.env` 없는 환경에서도 diff로 “무엇이 바뀌었는지”가 남는다.

| 선택 | 그때 되는 일 |
|------|----------------|
| **추적 + 갱신 시 커밋** (추천) | 원격/히스토리에 지표 스냅샷이 쌓임. 실수로 돌린 파이프라인이면 `git restore signals/*.csv`로 직전 커밋 내용으로 되돌리면 됨. |
| **추적은 유지, 수정만 두고 둠** | `git status`가 항상 지저분함. 나중에 다른 작업 커밋할 때 실수로 CSV까지 섞이기 쉬움 → 피하는 게 좋음. |
| **`.gitignore`로 CSV 무시** | 레포는 가벼워지지만, 클론한 사람은 반드시 `processors/industry_signals.py` 등을 돌려야 같은 파일을 얻음 (DB·키 필요). “파일만 넘겨주기”는 어려움. |

정리 습관: 주간 배치 직후 또는 지표를 공유/배포할 때 한 번 커밋하고, 실험용으로만 돌린 결과면 `git restore`로 버리기.

## 주간 한 줄

`run_weekly.py` → 수집 → DB 반영 → KSIC/규제 → `industry_signals` → CSV/export · (선택) enricher.

## 기사 초안 · NEWS EPOCH 지침

- `article_weekly.py`는 가능하면 Obsidian `NEWS EPOCH 작성 지침.md`를 읽어 프롬프트에 붙입니다.
- 경로: `NEWS_EPOCH_GUIDELINE_PATH`(.env) → 없으면 `config.py`의 Dropbox 기본 경로(파일 있을 때만).

## 상세 문서

- [architecture.md](./architecture.md) · [pipeline.md](./pipeline.md) · [operations.md](./operations.md) · 루트 [CLAUDE.md](../CLAUDE.md)
