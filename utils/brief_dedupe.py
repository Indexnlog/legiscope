"""
일간/주간 Slack 브리프에 같은 bill_id가 연달아 올라가는 것을 줄이기 위한 로컬 기록.

- 주간 브리프 전송 시 포함된 bill_id → 이후 일간에서 최근 retention_days 동안 제외
- 일간 브리프 전송 시 포함된 bill_id → 이후 주간에서 최근 retention_days 동안 제외

상태 파일: output/slack_brief_dedupe.json (output/은 .gitignore)
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

RETENTION_DAYS = 10
_STATE_NAME = "slack_brief_dedupe.json"


def _state_path() -> str:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "output")
    os.makedirs(out, exist_ok=True)
    return os.path.join(out, _STATE_NAME)


def _load() -> dict[str, Any]:
    path = _state_path()
    if not os.path.isfile(path):
        return {"entries": []}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or "entries" not in data:
            return {"entries": []}
        return data
    except (json.JSONDecodeError, OSError):
        return {"entries": []}


def _save(data: dict[str, Any]) -> None:
    path = _state_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)


def _prune_entries(entries: list[dict], cutoff: datetime) -> list[dict]:
    kept = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        t = e.get("t")
        if not t:
            continue
        try:
            # ISO8601 with or without Z
            ts = datetime.fromisoformat(t.replace("Z", "+00:00"))
        except ValueError:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= cutoff.replace(tzinfo=ts.tzinfo):
            kept.append(e)
    return kept


def recent_bill_ids_from_source(other_source: str, *, retention_days: int = RETENTION_DAYS) -> frozenset[str]:
    """
    other_source: 'daily' | 'weekly'
    반대 채널에서 최근 retention_days 안에 브리프에 실린 bill_id 집합.
    """
    if other_source not in ("daily", "weekly"):
        return frozenset()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=retention_days)
    want = "weekly" if other_source == "daily" else "daily"
    data = _load()
    ids: set[str] = set()
    for e in data.get("entries") or []:
        if e.get("source") != want:
            continue
        t = e.get("t")
        if not t:
            continue
        try:
            ts = datetime.fromisoformat(str(t).replace("Z", "+00:00"))
        except ValueError:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts < cutoff:
            continue
        for bid in e.get("bill_ids") or []:
            if bid:
                ids.add(str(bid))
    return frozenset(ids)


def record_brief_bill_ids(source: str, bill_ids: list[str | None]) -> None:
    """Slack 브리프 전송 직후 호출. source는 'daily' | 'weekly'."""
    if source not in ("daily", "weekly"):
        return
    clean = [str(b) for b in bill_ids if b]
    if not clean:
        return
    now = datetime.now(timezone.utc).isoformat()
    data = _load()
    trim_cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS + 4)
    entries = _prune_entries(data.get("entries") or [], trim_cutoff)
    entries.append({"t": now, "source": source, "bill_ids": clean})
    data["entries"] = entries
    _save(data)
