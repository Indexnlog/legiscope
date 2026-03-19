# Collectors Module

## Purpose
- Source-specific ingestion code for legislative and policy datasets.

## Rules
- Preserve source-specific request and parsing behavior unless the task explicitly changes it.
- Be careful with pagination, encodings, and brittle HTML selectors.
- When changing collected fields, inspect downstream schema and mapper dependencies.

## Watchouts
- `lawmaking.go.kr` scraping behavior is sensitive to endpoint choice.
- `law.go.kr` DRF access and parameter handling are easy to break.
- API and scrape regressions often show up later in enrichment, not immediately in the collector.
