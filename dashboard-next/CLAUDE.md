# Dashboard Module

## Purpose
- Next.js dashboard for pdeck-facing legislative risk views.

## Rules
- Keep frontend assumptions aligned with the Python pipeline outputs.
- Prefer documenting new API/data dependencies when adding views.
- Do not assume frontend-only changes are isolated if they depend on new fields.

## Watchouts
- `industry_signals` and bill drilldown payloads are shared contract surfaces.
- If chart or tab logic changes, verify it still matches current data semantics from the pipeline.
