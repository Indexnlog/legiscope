---
paths:
  - "article_*.py"
---
# NEWS EPOCH Article Policy (Legiscope)

- ALL facts must be grounded in pipeline outputs (collectors → Supabase → exports)
- NO LLM-invented entities, statistics, or international context
- External fact markers (UN, EU, AI Act) must be flagged as unverifiable
- Proposer names must come from bills.proposer_members JSON array
- Check _EXTERNAL_FACT_MARKERS in article_weekly.py for hallucination detection
- Deduplication: check output/slack_brief_dedupe.json (10-day lookback)
- Reference docs/news_epoch_data_policy.md for full policy
