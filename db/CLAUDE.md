# DB Module

## Purpose
- Supabase client setup and schema history for Legiscope datasets.

## Rules
- Treat schema files as coordinated changes, not scratch notes.
- If a table or column changes, reflect it in docs and downstream code paths.
- Avoid silent schema drift between Python code, SQL files, and product-facing consumers.

## Watchouts
- `industry_signals` is consumed by dashboards and product integrations.
- Bill-related schema changes can affect collectors, mappers, processors, exports, and article tooling at once.
