---
name: add-collector
description: Guide for adding a new data source collector to Legiscope. Use when integrating a new public API, scraping a new legislative source, or extending data collection.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

## Adding a New Collector

### 1. Create Collector Script

Location: `collectors/new_source.py`

Follow existing patterns:
- Import `db.client` for Supabase operations
- Import `mapper.apply_ksic.tag_bill` for auto-KSIC tagging during ingestion
- Use `config.py` for API keys and endpoints
- Implement incremental collection (date-range based, not full re-scrape)

### 2. Database Schema

- Add table definition in `db/schema_vN.sql` (increment version)
- Include: id, source fields, ksic_codes (jsonb[]), regulation_type, created_at, updated_at
- Apply migration to Supabase

### 3. Mapper Integration

- Ensure `mapper/apply_ksic.py` covers the new data type
- If new keywords needed, update `mapper/ksic_ruleset.py` KEYWORD_TO_KSIC
- Apply regulation_type classification if applicable

### 4. Pipeline Integration

- Add to `run_weekly.py` execution order
- Add PYTHONPATH command to root `CLAUDE.md`
- Update `docs/pipeline.md` with new stage
- Update `docs/architecture.md` entity list

### 5. Dashboard & Article Integration

- If signals needed: extend `processors/industry_signals.py`
- If dashboard display needed: add tab or extend existing in `dashboard-next/`
- If article coverage needed: extend `article_weekly.py` data queries

### 6. Conventions

- All collectors must be idempotent (safe to re-run)
- Use upsert (ON CONFLICT) for database writes
- Log collection stats (new/updated/skipped counts)
- Handle API rate limits with retry + backoff
