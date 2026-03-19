# Operations

## Routine Work
- Run collectors and enrichment incrementally during development.
- Use `run_weekly.py` for the scheduled end-to-end weekly flow.
- Keep generated logs and exports in `output/`.

## Documentation Routine
- Daily: update Obsidian `작업일지`.
- Milestone change: update Obsidian `진행상황 타임라인`.
- Major status or metric change: update Obsidian project overview.

## Git Routine
- Keep commits scoped to one logical change.
- Push before updating status docs when the work materially changed the repo.
- Leave generated artifacts untracked unless they are intentionally part of deliverables.

## Sensitive Areas
- `db/`: schema drift affects all downstream consumers.
- `collectors/`: source-specific parsing is brittle and should be changed carefully.
- `dashboard-next/`: frontend delivery may diverge from pipeline assumptions if fields change.
