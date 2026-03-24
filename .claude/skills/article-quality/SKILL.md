---
name: article-quality
description: Verify NEWS EPOCH article drafts from Legiscope are fact-grounded and follow editorial policy. Use when reviewing article_*.py output or checking LLM-generated content.
allowed-tools: Read, Grep, Glob
---

## Legiscope Article Fact-Grounding Review

Reference: `docs/news_epoch_data_policy.md`

### Core Rule
ALL facts in NEWS EPOCH articles must be grounded in Legiscope pipeline outputs:
collectors → Supabase → exports. NO LLM-invented facts allowed.

### Verification Steps

1. **Check data source:**
   - Bill names/IDs must exist in `bills` table
   - Proposer names must be in `bills.proposer_members` JSON array
   - Committee names must match `bills.committee` field
   - Industry classifications must trace to `ksic_codes[]`

2. **Flag external fact markers:**
   - UN/EU/AI Act references → unverifiable from this pipeline
   - International comparisons → not in our data
   - Historical statistics not from our DB → flag as ungrounded

3. **Check LLM hallucination patterns:**
   - Fabricated legislator names
   - Incorrect bill passage dates
   - Wrong committee assignments
   - Merged details from different bills

4. **Article structure review:**
   - Uses sector groupings from `article_sectors.py` KSIC mappings
   - Risk scores match `signals/industry_signals.csv`
   - Trend claims supported by `recent_90d_bills` metric

5. **Deduplication check:**
   - Compare against `output/slack_brief_dedupe.json` (10-day lookback)
   - Ensure no duplicate coverage of same bill across daily/weekly
