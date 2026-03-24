# Mapper Module

## Purpose
- KSIC (한국표준산업분류) 태깅 및 규제/지원 분류.

## Key Files
- `apply_ksic.py`: 법안에 KSIC 코드 태깅. `tag_bill()` 함수는 collectors에서 ingestion 시 호출됨.
- `ksic_ruleset.py`: 키워드→KSIC 매핑 사전 (92+ 산업). SKIP_LAW_KEYWORDS로 ~14,200건 의도적 제외.
- `regulation_type.py`: 규제/지원/중립 분류. 키워드 점수 기반.
- `validate_regulation_type.py`: 분류 결과 검증.

## Watch Out For
- SKIP_LAW_KEYWORDS 수정 시 ~14k건 법안 태깅에 영향 — 반드시 영향도 확인
- KEYWORD_TO_KSIC 키워드 추가/삭제는 industry_signals 전체에 영향
- regulation_type 점수 기준 변경 시 risk_score 하류 영향 확인 필요
- `--apply` 플래그로 DB 일괄 적용 — 되돌리기 어려움
