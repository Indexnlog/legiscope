# Architecture Overview

## Goal
Legiscope aggregates legislative activity into a structured dataset that can be reused across product, dashboard, and article workflows.

## Main Layers
- Collection: `collectors/` gathers raw data from Assembly APIs, lawmaking.go.kr, law.go.kr, and korea.kr.
- Storage: `db/` connects to Supabase/PostgreSQL and applies schema changes.
- Enrichment: `mapper/` adds KSIC tags and regulation/support classification.
- Aggregation: `processors/industry_signals.py` computes industry-level metrics.
- Delivery:
  - `export_csv.py` for CSV handoff.
  - `dashboard-next/` for web dashboard delivery.
  - `article_*.py` for News Epoch content workflows.

## Primary Entities
- `bills`
- `pre_announcements`
- `admin_laws`
- `policy_briefs`
- `promulgations`
- `industry_signals`
- `proposal_reason` via enrichment workflow

## System Boundaries
- Code in this repo is the technical source of truth.
- Obsidian stores project narrative, status, and operating context.
- `output/` and debug files are disposable artifacts unless promoted into docs or code.
