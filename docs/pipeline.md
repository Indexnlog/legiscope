# Pipeline Guide

## Core Flow
1. Collect source data into Supabase-backed tables.
2. Enrich bills with KSIC and regulation type metadata.
3. Compute industry-level aggregates.
4. Export or serve results to downstream consumers.

## Collection Entry Points
- `collectors/bills.py`
- `collectors/committee.py`
- `collectors/pre_announcements.py`
- `collectors/admin_laws.py`
- `collectors/policy_briefs.py`
- `collectors/promulgations.py`

## Enrichment
- `mapper/apply_ksic.py`: assigns KSIC codes.
- `mapper/regulation_type.py`: applies regulation/support/neutral labels.
- `bill_enricher`-style workflows feed article-quality fields such as `proposal_reason`.

## Aggregation
- `processors/industry_signals.py` rolls bill-level data into industry metrics used by pdeck and dashboards.

## Delivery Paths
- CSV exports for manual or partner handoff.
- `dashboard-next/` for interactive product views.
- `article_weekly.py` and related scripts for News Epoch article generation.

## Change Checklist
- If a collector changes, verify downstream schema assumptions.
- If schema changes, update schema docs and affected mappers/processors.
- If signal logic changes, verify dashboard and article consumers still match the new fields.
