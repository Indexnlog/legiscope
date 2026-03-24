---
paths:
  - "collectors/**"
  - "mapper/**"
  - "processors/**"
  - "db/**"
---
# Data Integrity Rules

- All collectors must be idempotent — safe to re-run without duplicating data
- Use upsert (ON CONFLICT) for all database writes
- KSIC tagging happens at ingestion time via mapper.apply_ksic.tag_bill()
- Never modify db/schema*.sql without updating docs/architecture.md and docs/pipeline.md
- Schema changes cascade: collectors → mappers → processors → dashboard → articles
- SKIP_LAW_KEYWORDS in ksic_ruleset.py intentionally excludes ~14k bills — do not remove without understanding impact
- regulation_type uses keyword scoring — changes affect risk_score downstream
