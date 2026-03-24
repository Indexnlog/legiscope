---
name: pipeline-debug
description: Debug Legiscope pipeline failures. Use when collectors fail, KSIC tagging produces unexpected results, industry signals are stale, or the dashboard shows incorrect data.
allowed-tools: Read, Grep, Glob, Bash
---

## Legiscope Pipeline Debugging

### 1. Identify the Failure Layer

```
collectors/ → db/ → mapper/ → processors/ → dashboard-next/ / article_*.py
```

Determine which layer broke by checking:
- `output/` for recent logs and exports
- `signals/` CSV timestamps for staleness
- Dashboard data freshness (industry_signals.as_of_date)

### 2. Collector Failures

| Collector | API Source | Common Failures |
|-----------|-----------|-----------------|
| bills.py | open.assembly.go.kr | API key expired, response schema change |
| committee.py | open.assembly.go.kr | Missing bill_id in response |
| pre_announcements.py | lawmaking.go.kr (scrape) | HTML structure change |
| admin_laws.py | lawmaking.go.kr (scrape) | HTML structure change |
| policy_briefs.py | korea.kr RSS | Feed URL change, encoding issues |
| promulgations.py | law.go.kr DRF (XML) | OC code invalid, XML parse error |

### 3. Mapper Failures

- **KSIC tagging returns empty**: Check `ksic_ruleset.py` KEYWORD_TO_KSIC dictionary coverage
- **Wrong classifications**: Verify SKIP_LAW_KEYWORDS isn't catching valid bills
- **regulation_type errors**: Check keyword scoring balance in `regulation_type.py`

### 4. Signal Aggregation Issues

- `processors/industry_signals.py` depends on: ksic_codes[], regulation_type, proc_result_cd, propose_dt, proc_dt
- If any upstream field is NULL, aggregation skews
- Check `risk_score` formula: (reg_count/total) × (regulation_pass_rate) × (recent_activity)

### 5. Dashboard Data Contract

- `industry_signals` table is the shared contract
- Field changes break frontend — verify `lib/types.ts` matches DB schema
- Run `PYTHONPATH=. python processors/industry_signals.py` to regenerate

### 6. Verify Full Pipeline

```bash
PYTHONPATH=. python collectors/bills.py
PYTHONPATH=. python mapper/apply_ksic.py
PYTHONPATH=. python -m mapper.regulation_type --apply
PYTHONPATH=. python processors/industry_signals.py
```
