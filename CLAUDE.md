# Legiscope

## Purpose
- Collect Korean legislative and policy signals from multiple public sources.
- Classify bills by KSIC industry and regulation/support intent.
- Serve the results to pdeck and News Epoch through exports, dashboards, and article workflows.

## Repo Map
- `collectors/`: source-specific collectors for bills, committee data, promulgations, pre-announcements, admin laws, and policy briefs.
- `db/`: Supabase client and schema files.
- `mapper/`: KSIC tagging and regulation type classification.
- `processors/`: derived metrics such as `industry_signals`.
- `dashboard-next/`: Next.js dashboard for pdeck-facing views.
- `signals/`: generated industry signal CSVs.
- `output/`: exports, logs, and ad hoc validation artifacts. Treat as generated output, not source of truth.
- `article_*.py`: News Epoch article generation helpers.
- `run_weekly.py`: weekly pipeline runner.

## Rules
- Keep source code, generated output, and documentation separate.
- Do not treat files under `output/` as canonical inputs unless explicitly asked.
- Prefer updating schemas and docs together when DB structure changes.
- Preserve existing data collection behavior unless the task explicitly changes collection logic.
- Check related Obsidian project docs after substantial project changes.

## Common Commands
```bash
PYTHONPATH=. python collectors/bills.py
PYTHONPATH=. python collectors/committee.py
PYTHONPATH=. python collectors/promulgations.py
PYTHONPATH=. python mapper/apply_ksic.py
PYTHONPATH=. python -m mapper.regulation_type --apply
PYTHONPATH=. python processors/industry_signals.py
python run_weekly.py
```

## Workflow
- For data pipeline changes: inspect collector -> mapper -> processor impact before editing.
- For dashboard changes: check `dashboard-next/` separately from Python pipeline code.
- At end of day: git push, then update Obsidian `작업일지`, and update timeline or project overview if status changed.

## Related Docs
- `docs/project_map.md` (로컬 · GitHub · Obsidian 한눈에)
- `docs/architecture.md`
- `docs/pipeline.md`
- `docs/operations.md`
