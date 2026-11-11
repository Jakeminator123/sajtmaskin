"""Samtidighet över tid — ren beräkning för sidan ``pages/concurrency.py``.

Två källor, samma form ut:

* **Byggen** ur DB (``scripts/db/build-concurrency.mjs``): intervall
  ``[slut - duration_ms, slut)`` per rad i ``engine_generation_logs``. Antalet
  samtidiga byggen är en stegfunktion; en hink visar det högsta värdet i hinken.
* **Förhandsvisningsmaskiner** ur preview-hostens ``GET /admin/metrics``: en
  sampling per minut. En hink visar högsta samplingen i hinken.

Allt i millisekunder sedan epoch; dagsgränser räknas i svensk tid så
"max per dag" följer Jakobs dygn, inklusive sommartidsbyten.
"""

from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Sequence
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("Europe/Stockholm")
MINUTE_MS = 60_000
HOUR_MS = 60 * MINUTE_MS
DAY_MS = 24 * HOUR_MS


@dataclass(frozen=True)
class BuildIntervals:
    intervals: list[tuple[float, float]]
    without_duration: int
    failed: int


def build_intervals(builds: Iterable[dict[str, Any]]) -> BuildIntervals:
    """Intervall ur skriptets ``builds``. Rader utan giltig varaktighet räknas
    separat — de kan inte placeras i tiden och får inte bli nollintervall."""
    intervals: list[tuple[float, float]] = []
    without_duration = 0
    failed = 0
    for row in builds:
        end = row.get("endMs")
        duration = row.get("durationMs")
        if row.get("success") is False:
            failed += 1
        if not isinstance(end, (int, float)) or not isinstance(duration, (int, float)):
            without_duration += 1
            continue
        if duration <= 0:
            without_duration += 1
            continue
        intervals.append((float(end) - float(duration), float(end)))
    intervals.sort()
    return BuildIntervals(intervals, without_duration, failed)


def concurrency_steps(intervals: Sequence[tuple[float, float]]) -> list[tuple[float, int]]:
    """Stegfunktion ``[(t, nivå efter t)]`` för halvöppna intervall ``[start, slut)``.

    Händelser vid samma tidpunkt slås ihop: ett bygge som slutar exakt när
    ett annat börjar ger ingen falsk topp på två."""
    deltas: dict[float, int] = {}
    for start, end in intervals:
        if end <= start:
            continue
        deltas[start] = deltas.get(start, 0) + 1
        deltas[end] = deltas.get(end, 0) - 1
    steps: list[tuple[float, int]] = []
    level = 0
    for t in sorted(deltas):
        if deltas[t] == 0:
            continue
        level += deltas[t]
        steps.append((t, level))
    return steps


def max_per_bucket_from_steps(
    steps: Sequence[tuple[float, int]], bounds: Sequence[float]
) -> list[int]:
    """Högsta nivån i varje hink ``[bounds[k], bounds[k+1])``."""
    out: list[int] = []
    times = [t for t, _ in steps]
    for lo, hi in zip(bounds, bounds[1:]):
        # Nivån som gäller vid hinkens start: sista steget med t <= lo.
        idx = bisect_left(times, lo)
        if idx < len(times) and times[idx] == lo:
            idx += 1
        peak = steps[idx - 1][1] if idx > 0 else 0
        j = idx
        while j < len(times) and times[j] < hi:
            peak = max(peak, steps[j][1])
            j += 1
        out.append(peak)
    return out


def max_per_bucket_from_samples(
    samples: Sequence[dict[str, Any]], field: str, bounds: Sequence[float]
) -> list[int | None]:
    """Högsta samplingen av ``field`` per hink; ``None`` när hinken saknar data
    (hosten var nere eller historiken började senare) — aldrig en tyst nolla."""
    out: list[int | None] = [None] * max(len(bounds) - 1, 0)
    if not out:
        return out
    for sample in samples:
        t = sample.get("t")
        value = sample.get(field)
        if not isinstance(t, (int, float)) or not isinstance(value, (int, float)):
            continue
        if t < bounds[0] or t >= bounds[-1]:
            continue
        k = bisect_left(bounds, t)
        if k == len(bounds) or bounds[k] != t:
            k -= 1
        current = out[k]
        out[k] = int(value) if current is None else max(current, int(value))
    return out


def uniform_bounds(start_ms: float, end_ms: float, bucket_ms: int) -> list[float]:
    """Hinkgränser jämnt fördelade och avrundade nedåt till ``bucket_ms``."""
    first = (int(start_ms) // bucket_ms) * bucket_ms
    bounds = list(range(first, int(end_ms) + bucket_ms, bucket_ms))
    return [float(b) for b in bounds]


def local_day_bounds(start_ms: float, end_ms: float) -> list[tuple[date, float, float]]:
    """Lokala dygn som täcker ``[start_ms, end_ms)``: ``(dag, från, till)``."""
    first = datetime.fromtimestamp(start_ms / 1000, tz=LOCAL_TZ).date()
    last = datetime.fromtimestamp(end_ms / 1000, tz=LOCAL_TZ).date()
    days: list[tuple[date, float, float]] = []
    day = first
    while day <= last:
        lo = datetime(day.year, day.month, day.day, tzinfo=LOCAL_TZ)
        nxt = day + timedelta(days=1)
        hi = datetime(nxt.year, nxt.month, nxt.day, tzinfo=LOCAL_TZ)
        days.append((day, lo.timestamp() * 1000, hi.timestamp() * 1000))
        day = nxt
    return days


def to_local_naive(ms: float) -> datetime:
    """Svensk väggklocka utan tidszon — så diagram och tabell visar samma tid."""
    return (
        datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone(LOCAL_TZ).replace(tzinfo=None)
    )


def builds_per_local_day(intervals: Sequence[tuple[float, float]]) -> dict[date, int]:
    """Antal klara byggen per lokalt dygn (räknat på sluttid)."""
    counts: dict[date, int] = {}
    for _, end in intervals:
        day = datetime.fromtimestamp(end / 1000, tz=LOCAL_TZ).date()
        counts[day] = counts.get(day, 0) + 1
    return counts
