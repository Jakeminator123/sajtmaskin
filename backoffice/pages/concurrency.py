"""Samtidighet — hur många som bygger samtidigt och hur många
förhandsvisningsmaskiner som lever, över tid.

* Byggen: ``node scripts/db/build-concurrency.mjs --json`` (read-only mot vald
  env-fils DB). Historiken räknas fram ur ``engine_generation_logs``.
* Maskiner: preview-hostens API-nyckelskyddade ``GET /admin/metrics``
  (``SAJTMASKIN_PREVIEW_HOST_BASE_URL`` + ``SAJTMASKIN_PREVIEW_HOST_API_KEY``).
  Hosten samplar en gång per minut och sparar 14 dagar.

Tröskeln markerar hinkar där värdet är **över** tröskeln (default 3: Jakob
räknar med högst 2–3 samtidiga byggen).
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pandas as pd
import streamlit as st

from backoffice.concurrency import (
    DAY_MS,
    HOUR_MS,
    MINUTE_MS,
    build_intervals,
    builds_per_local_day,
    concurrency_steps,
    local_day_bounds,
    max_per_bucket_from_samples,
    max_per_bucket_from_steps,
    to_local_naive,
    uniform_bounds,
)
from backoffice.shared import BackofficeContext

_SCRIPT_REL = "scripts/db/build-concurrency.mjs"
_TIMEOUT_S = 60
_HOST_TIMEOUT_S = 20
_DEFAULT_THRESHOLD = 3

_ENV_CHOICES = {
    "Dev (.env.local)": ".env.local",
    "Prod (.env.vercel.production.pulled)": ".env.vercel.production.pulled",
}

# Fönster → (dagar, hinkstorlek, etikett för hinken)
_WINDOWS = {
    "Dag (24 h)": (1, 5 * MINUTE_MS, "5 min"),
    "Vecka (7 d)": (7, HOUR_MS, "1 h"),
    "14 dagar": (14, 2 * HOUR_MS, "2 h"),
}

_MACHINE_FIELDS = {
    "guests": "Gästmaskiner igång (maskinläge)",
    "runtimes": "Förhandsvisningar med dev-process",
    "sessions": "Aktiva preview-sessioner",
}

_LINE_COLOR = "#2a78d6"
_PEAK_COLOR = "#d03b3b"
_RULE_COLOR = "#8a8984"


@dataclass(frozen=True)
class BuildPayload:
    ok: bool
    error: str | None = None
    target: str = ""
    is_prod_like: bool = False
    now_ms: float = 0.0
    open_window_minutes: int = 0
    builds: list[dict[str, Any]] = field(default_factory=list)
    open_starts: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class HostPayload:
    ok: bool
    error: str | None = None
    host: str = ""
    isolation_mode: str = ""
    interval_ms: int = 0
    current: dict[str, Any] = field(default_factory=dict)
    samples: list[dict[str, Any]] = field(default_factory=list)
    write_errors: int = 0
    last_error: str | None = None


def _run_builds(repo_root: Path, env_file: str, days: int, allow_insecure: bool) -> BuildPayload:
    script = repo_root / _SCRIPT_REL
    if not script.is_file():
        return BuildPayload(ok=False, error=f"Script saknas: {_SCRIPT_REL}")
    args = ["node", str(script), "--json", f"--env={env_file}", f"--days={int(days)}"]
    if allow_insecure:
        args.append("--allow-insecure-ssl")
    try:
        result = subprocess.run(
            args,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return BuildPayload(ok=False, error=f"Script timeout efter {_TIMEOUT_S}s")
    except FileNotFoundError:
        return BuildPayload(ok=False, error="`node` saknas på PATH")
    stdout = (result.stdout or "").strip()
    if not stdout:
        return BuildPayload(ok=False, error=(result.stderr or "Tomt svar från script").strip())
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return BuildPayload(ok=False, error=f"Kunde inte tolka JSON: {exc}")
    if not data.get("ok"):
        return BuildPayload(ok=False, error=str(data.get("error") or "Okänt fel"))
    return BuildPayload(
        ok=True,
        target=str(data.get("target") or ""),
        is_prod_like=bool(data.get("isProdLike")),
        now_ms=float(data.get("nowMs") or time.time() * 1000),
        open_window_minutes=int(data.get("openWindowMinutes") or 0),
        builds=list(data.get("builds") or []),
        open_starts=list(data.get("openStarts") or []),
    )


def _fetch_host_metrics(base_url: str, api_key: str, hours: int) -> HostPayload:
    """Läs ``/admin/metrics``. Nyckeln skickas bara i headern och visas aldrig."""
    host = urlparse(base_url).netloc or base_url
    url = f"{base_url.rstrip('/')}/admin/metrics?hours={int(hours)}"
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=_HOST_TIMEOUT_S) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            reason = "hosten saknar /admin/metrics — deploya preview-host med samtidighetshistoriken"
        elif exc.code in (401, 403):
            reason = "API-nyckeln nekades (SAJTMASKIN_PREVIEW_HOST_API_KEY matchar inte hosten)"
        else:
            reason = f"HTTP {exc.code}"
        return HostPayload(ok=False, host=host, error=reason)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return HostPayload(ok=False, host=host, error=f"Når inte hosten: {exc}")
    except json.JSONDecodeError as exc:
        return HostPayload(ok=False, host=host, error=f"Kunde inte tolka svaret: {exc}")
    if not isinstance(data, dict) or not data.get("ok"):
        return HostPayload(ok=False, host=host, error="Oväntat svar från /admin/metrics")
    isolation = data.get("isolation") or {}
    return HostPayload(
        ok=True,
        host=host,
        isolation_mode=str(isolation.get("mode") or ""),
        interval_ms=int(data.get("intervalMs") or 0),
        current=dict(data.get("current") or {}),
        samples=list(data.get("samples") or []),
        write_errors=int(data.get("writeErrors") or 0),
        last_error=data.get("lastError"),
    )


@st.cache_data(ttl=60, max_entries=8, show_spinner=False)
def _cached_builds(repo_root: Path, env_file: str, days: int, allow_insecure: bool, _bust: int):
    return _run_builds(repo_root, env_file, days, allow_insecure)


@st.cache_data(ttl=60, max_entries=8, show_spinner=False)
def _cached_host(base_url: str, hours: int, _bust: int) -> HostPayload:
    api_key = (os.environ.get("SAJTMASKIN_PREVIEW_HOST_API_KEY") or "").strip()
    return _fetch_host_metrics(base_url, api_key, hours)


def series_frame(bounds: list[float], values: list[int | None]) -> pd.DataFrame:
    """Hinkserie som DataFrame med svensk tid; tomma hinkar behålls som NaN."""
    return pd.DataFrame(
        {
            "tid": [to_local_naive(b) for b in bounds[: len(values)]],
            "värde": [float("nan") if v is None else v for v in values],
        }
    )


def daily_table(
    day_bounds,
    steps,
    intervals,
    samples: list[dict[str, Any]],
    machine_field: str,
    threshold: int,
    host_ok: bool,
) -> pd.DataFrame:
    edges = [lo for _, lo, _ in day_bounds] + ([day_bounds[-1][2]] if day_bounds else [])
    build_max = max_per_bucket_from_steps(steps, edges) if day_bounds else []
    machine_max = (
        max_per_bucket_from_samples(samples, machine_field, edges) if day_bounds and host_ok else []
    )
    finished = builds_per_local_day(intervals)
    rows = []
    for k, (day, _, _) in enumerate(day_bounds):
        b = build_max[k] if k < len(build_max) else 0
        m = machine_max[k] if k < len(machine_max) else None
        over = []
        if b > threshold:
            over.append("byggen")
        if m is not None and m > threshold:
            over.append("maskiner")
        rows.append(
            {
                "Dag": day.isoformat(),
                "Max samtidiga byggen": b,
                "Klara byggen": finished.get(day, 0),
                f"Max {_MACHINE_FIELDS[machine_field].lower()}": m,
                "Över tröskel": ("⚠ " + " + ".join(over)) if over else "",
            }
        )
    table = pd.DataFrame(rows[::-1])
    machine_col = f"Max {_MACHINE_FIELDS[machine_field].lower()}"
    if machine_col in table:
        # Saknad sampling visas tom (<NA>), aldrig som en tyst nolla.
        table[machine_col] = table[machine_col].astype("Int64")
    return table


def _chart(df: pd.DataFrame, y_title: str, threshold: int):
    import altair as alt

    y_max = max(threshold + 1, int(df["värde"].max()) + 1 if df["värde"].notna().any() else 1)
    y = alt.Y("värde:Q", title=y_title, scale=alt.Scale(domain=[0, y_max]), axis=alt.Axis(tickMinStep=1))
    x = alt.X("tid:T", title=None, axis=alt.Axis(format="%d/%m %H:%M", labelOverlap=True))
    tooltip = [
        alt.Tooltip("tid:T", title="Hink från", format="%Y-%m-%d %H:%M"),
        alt.Tooltip("värde:Q", title="Max"),
    ]
    base = alt.Chart(df).encode(x=x, y=y)
    line = base.mark_line(interpolate="step-after", strokeWidth=2, color=_LINE_COLOR)
    hover = base.mark_point(size=120, opacity=0).encode(tooltip=tooltip)
    peaks = (
        base.transform_filter(alt.datum["värde"] > threshold)
        .mark_point(filled=True, size=80, color=_PEAK_COLOR, opacity=1)
        .encode(tooltip=tooltip)
    )
    rule = (
        alt.Chart(pd.DataFrame({"tröskel": [threshold]}))
        .mark_rule(strokeDash=[4, 4], color=_RULE_COLOR)
        .encode(y="tröskel:Q")
    )
    return (line + rule + hover + peaks).properties(height=220)


def render(ctx: BackofficeContext) -> None:
    st.title("Samtidighet: byggen och förhandsvisningsmaskiner")
    st.caption(
        "Hur många som bygger samtidigt och hur många förhandsvisningsmaskiner som lever, "
        "över tid. Byggen räknas fram ur `engine_generation_logs`; maskiner samplas en gång "
        "per minut av preview-hosten (`GET /admin/metrics`, 14 dagar). Read-only."
    )

    c1, c2, c3, c4 = st.columns([2, 2, 2, 1])
    env_label = c1.selectbox("Databas (env-fil)", list(_ENV_CHOICES.keys()), index=0)
    env_file = _ENV_CHOICES[env_label]
    window_label = c2.radio("Fönster", list(_WINDOWS.keys()), index=0, horizontal=True)
    days, bucket_ms, bucket_label = _WINDOWS[window_label]
    threshold = c3.slider(
        "Tröskel (markera toppar över)",
        min_value=1,
        max_value=20,
        value=_DEFAULT_THRESHOLD,
        help="Hinkar där max är över tröskeln markeras rött i diagrammen och med ⚠ i dagstabellen.",
    )
    allow_insecure = c4.checkbox("Tillåt osäker SSL", value=(env_file != ".env.local"))

    if "concurrency_bust" not in st.session_state:
        st.session_state["concurrency_bust"] = 0
    if st.button("Uppdatera nu"):
        st.session_state["concurrency_bust"] += 1
    bust = int(st.session_state["concurrency_bust"])

    base_url = (os.environ.get("SAJTMASKIN_PREVIEW_HOST_BASE_URL") or "").strip()
    has_key = bool((os.environ.get("SAJTMASKIN_PREVIEW_HOST_API_KEY") or "").strip())

    with st.spinner("Hämtar byggen och maskinhistorik ..."):
        builds = _cached_builds(ctx.repo_root, env_file, days, allow_insecure, bust)
        if base_url and has_key:
            host = _cached_host(base_url, days * 24, bust)
        else:
            host = HostPayload(
                ok=False,
                error="SAJTMASKIN_PREVIEW_HOST_BASE_URL och SAJTMASKIN_PREVIEW_HOST_API_KEY "
                "måste finnas i `.env.local`.",
            )
    st.caption("Data återanvänds i högst 60 sekunder. Tider i svensk tid.")

    now_ms = builds.now_ms if builds.ok and builds.now_ms else time.time() * 1000
    start_ms = now_ms - days * DAY_MS
    bounds = uniform_bounds(start_ms, now_ms, bucket_ms)

    machine_field = "guests" if host.ok and host.isolation_mode == "machine" else "runtimes"
    if host.ok:
        machine_field = st.selectbox(
            "Maskinmått",
            list(_MACHINE_FIELDS.keys()),
            index=list(_MACHINE_FIELDS.keys()).index(machine_field),
            format_func=lambda key: _MACHINE_FIELDS[key],
            help="Maskinläge (SM-080): en gästmaskin per projekt. Delat läge: dev-processer på hosten.",
        )

    # ── Aktuellt ────────────────────────────────────────────────────────
    m1, m2, m3, m4 = st.columns(4)
    if builds.ok:
        m1.metric(
            "Byggen pågår nu (uppskattat)",
            len(builds.open_starts),
            help=(
                f"Byggstarter senaste {builds.open_window_minutes} min utan klar generationsrad. "
                "Kan även vara avbrutna körningar eller frågor som aldrig blev ett bygge."
            ),
        )
    else:
        m1.metric("Byggen pågår nu (uppskattat)", "—")
    if host.ok:
        m2.metric(_MACHINE_FIELDS["guests"], host.current.get("guests", "—"))
        m3.metric(_MACHINE_FIELDS["runtimes"], host.current.get("runtimes") if host.current.get("runtimes") is not None else "—")
        m4.metric(_MACHINE_FIELDS["sessions"], host.current.get("sessions", "—"))
    else:
        for col in (m2, m3, m4):
            col.metric("—", "—")

    # ── Byggen ──────────────────────────────────────────────────────────
    st.subheader("Samtidiga byggen")
    intervals = build_intervals(builds.builds if builds.ok else [])
    steps = concurrency_steps(intervals.intervals)
    if not builds.ok:
        st.error(f"Kunde inte hämta byggen: {builds.error}")
    else:
        if builds.is_prod_like:
            st.warning(f"PROD-lik databas: `{builds.target}` — läsning only.")
        else:
            st.caption(f"Databas: `{builds.target}`")
        build_values = max_per_bucket_from_steps(steps, bounds)
        df_builds = series_frame(bounds, build_values)
        peak = max(build_values) if build_values else 0
        st.altair_chart(
            _chart(df_builds, f"Max per {bucket_label}", threshold),
            width="stretch",
        )
        st.caption(
            f"{len(intervals.intervals)} klara byggen i fönstret · topp {peak} · "
            f"{sum(1 for v in build_values if v > threshold)} hinkar över tröskeln {threshold}."
            + (
                f" {intervals.without_duration} rader saknar varaktighet och kan inte placeras."
                if intervals.without_duration
                else ""
            )
        )
        st.caption(
            "Ett bygge räknas från motorströmmens start till att versionen sparats. Avbrutna "
            "strömmar och plan-lägets turer lämnar ingen generationsrad och syns inte här; "
            "serverns efterkontroller (verify/repair) räknas inte in i bygget."
        )

    # ── Maskiner ────────────────────────────────────────────────────────
    st.subheader("Levande förhandsvisningsmaskiner")
    if not host.ok:
        where = f" (`{host.host}`)" if host.host else ""
        st.info(f"Ingen maskinhistorik{where}: {host.error}")
    else:
        machine_values = max_per_bucket_from_samples(host.samples, machine_field, bounds)
        df_machines = series_frame(bounds, machine_values)
        st.altair_chart(
            _chart(df_machines, f"Max per {bucket_label}", threshold),
            width="stretch",
        )
        known = [v for v in machine_values if v is not None]
        first_sample = min((s.get("t") for s in host.samples if isinstance(s.get("t"), (int, float))), default=None)
        coverage = (
            f"historik från {to_local_naive(first_sample):%Y-%m-%d %H:%M}"
            if first_sample is not None
            else "ingen historik ännu"
        )
        st.caption(
            f"Host `{host.host}` · läge `{host.isolation_mode or 'okänt'}` · "
            f"sampling var {max(1, math.ceil(host.interval_ms / 1000))} s · {coverage} · "
            f"topp {max(known) if known else '—'}. Tomma partier = ingen sampling (hosten nere "
            "eller före historiken)."
        )
        if host.write_errors or host.last_error:
            st.warning(
                f"Hosten rapporterar problem med historiken: {host.write_errors} skrivfel"
                + (f" · senaste: {host.last_error}" if host.last_error else "")
            )

    # ── Max per dag ─────────────────────────────────────────────────────
    st.subheader("Max per dag")
    day_bounds = local_day_bounds(start_ms, now_ms)
    table = daily_table(
        day_bounds,
        steps,
        intervals.intervals,
        host.samples if host.ok else [],
        machine_field,
        threshold,
        host.ok,
    )
    st.dataframe(table, hide_index=True, width="stretch")
