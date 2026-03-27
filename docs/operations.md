# Operations

## 자동화 스케줄

| 작업 | 스케줄러 이름 | 주기 | 시각 | 실행 파일 | 비고 |
|------|-------------|------|------|-----------|------|
| **일간 브리프** | `LegiscopeDaily` | 매일 | 09:00 | `run_daily.bat` → `article_daily.py --slack --draft` | 어제 가결/발의 법안 감지 → Slack |
| **주간 파이프라인** | `LegiscopeWeekly` | 매주 금요일 | 07:00 | `run_weekly.bat` → `run_weekly.py` | 전체 수집 → 태깅 → 기사 브리프 → Slack |

### 금요일 주간 수집 이유
국회 본회의는 주로 화~목요일에 열리고, 상임위·발의도 주중에 집중된다.
금요일 아침에 돌려야 한 주치 입법 활동(가결·발의·위원회 진전)을 빠짐없이 잡을 수 있다.
주말에 기사 소재를 검토하고 월요일에 발행하는 흐름.

### 작업 스케줄러 관리
```powershell
# 조회
schtasks /query /tn "LegiscopeWeekly" /fo LIST /v
schtasks /query /tn "LegiscopeDaily" /fo LIST /v

# 수동 즉시 실행
schtasks /run /tn "LegiscopeWeekly"
schtasks /run /tn "LegiscopeDaily"

# 삭제
schtasks /delete /tn "LegiscopeWeekly" /f
```

### PC 꺼져 있으면?
Windows 작업 스케줄러는 PC가 꺼져 있으면 실행하지 않는다.
금요일 아침에 PC가 꺼져 있었다면, 부팅 후 수동으로 `run_weekly.bat`을 실행하거나:
```bash
PYTHONPATH=. python run_weekly.py
```

## 주간 파이프라인 단계 (run_weekly.py)

```
 1. 발의 수집          collectors.bills
 2. 상임위 보강        collectors.committee
 3. 입법예고           collectors.pre_announcements
 4. 행정입법예고       collectors.admin_laws
 5. 정책브리핑         collectors.policy_briefs
 6. 공포법령           collectors.promulgations
 7. KSIC 태깅          mapper.apply_ksic
 8. 규제분류           mapper.regulation_type --apply
 9. 공포법령 규제분류  mapper.regulation_type --apply-promulgations
10. 산업별 지표        processors.industry_signals
11. CSV 내보내기       export_csv.py
12. 법안 제안이유 보강 collectors.bill_enricher --limit 100
13. 주간 기사 브리프   article_weekly.py --slack --draft
```

## 일간 브리프 (article_daily.py)

- 어제 가결된 규제 법안, 어제 발의된 법안 중 기사감을 감지.
- `--slack`: Slack Block Kit 메시지 전송.
- `--draft`: LLM(Gemini/Claude) 기사 초안 생성 → Obsidian 초안 폴더 + Slack 전송.
- 일간/주간 Slack 브리프는 `output/slack_brief_dedupe.json`으로 최근 10일간 bill_id를 대조해 중복 노출을 줄임.

## Slack 설정

- 토큰: `.env` → `SLACK_TOKEN` (xoxb-...)
- 채널: `.env` → `SLACK_CHANNEL_ID` (기본값 `C0A6FDJBFJ5`)
- 사용 라이브러리: `slack-sdk`

## 기사 초안 LLM

| 환경변수 | 설명 | 기본값 |
|---------|------|--------|
| `ARTICLE_LLM_PROVIDER` | `gemini` 또는 `claude` | 키 있는 쪽 자동 |
| `GEMINI_API_KEY` | Google Gemini API 키 | — |
| `GEMINI_MODEL` | Gemini 모델 | `gemini-2.5-flash` |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | — |
| `CLAUDE_ARTICLE_MODEL` | Claude 모델 | `claude-sonnet-4-6` |

## 로그

- 주간: `output/logs/YYYY-MM-DD.log` (run_weekly.py 자체 로그)
- 주간 스케줄러: `output/logs/scheduler.log` (bat → stdout/stderr 리다이렉트)
- 일간: `output/logs/daily_YYYY-MM-DD.log`
- enricher: `output/logs/enricher_*.log`

## 문서 루틴

- **매일**: Obsidian `작업일지` 업데이트.
- **이정표 변경**: Obsidian `진행상황 타임라인` 업데이트.
- **큰 상태 변화**: Obsidian 프로젝트 개요 업데이트.

## Git 루틴

- 커밋은 논리적 변경 단위 하나로 유지.
- 작업 완료 후 push, 그다음 Obsidian 상태 문서 업데이트.
- `output/`은 `.gitignore`. `signals/*.csv`는 추적 — 파이프라인 갱신 후 의도적으로 커밋.

## 주의 영역

- `db/`: 스키마 변경은 모든 하류 소비자에 영향.
- `collectors/`: 소스별 파싱은 깨지기 쉬움 — 신중하게 변경.
- `dashboard-next/`: 파이프라인 필드 변경 시 프론트와 동기화 확인 필요.
