# -*- coding: utf-8 -*-
"""Databashälsa — visa alla tabeller, indexstatus och en "testa allt"-knapp.

Read-only Streamlit-sida som anropar `scripts/db/db-health-check.mjs`
(Node-script) via subprocess. Sidan VISAR resultatet — den ändrar aldrig
databasen själv. Saknade index → en knapp som föreslår att köra
`npm run db:perf-indexes` (men kör det inte själv; användaren bestämmer).

Snapshots sparas i `data/observability/db-health-snapshots.ndjson` när
"Spara snapshot"-rutan är ikryssad. Historiken renderas som linjegrafer
(rader per tabell över tid + connection-latens).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext

_DEFAULT_TIMEOUT_S = 60
_HEALTH_SCRIPT_REL = "scripts/db/db-health-check.mjs"
_PERF_INDEX_SCRIPT_REL = "scripts/db/add-performance-indexes.mjs"
_SNAPSHOT_REL = "data/observability/db-health-snapshots.ndjson"


def _resolve_node_command() -> tuple[str, ...] | None:
    """Hitta `node` på PATH (Windows-vänligt — `shutil.which` hanterar .cmd/.exe)."""
    for cand in ("node",):
        path = shutil.which(cand)
        if path:
            return (path,)
    return None


def _run_health_check(ctx: BackofficeContext, *, snapshot: bool, exact_count: bool) -> dict[str, Any]:
    node = _resolve_node_command()
    if node is None:
        return {
            "ok": False,
            "error": "node finns inte på PATH. Installera Node.js eller justera shell.",
        }

    args: list[str] = list(node) + [str(ctx.repo_root / _HEALTH_SCRIPT_REL)]
    if snapshot:
        args.append("--snapshot")
    if exact_count:
        args.append("--exact-count")

    started = time.time()
    try:
        proc = subprocess.run(
            args,
            cwd=str(ctx.repo_root),
            capture_output=True,
            text=True,
            timeout=_DEFAULT_TIMEOUT_S,
            shell=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Hälsokollen timade ut efter {_DEFAULT_TIMEOUT_S}s."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Misslyckades starta node: {exc}"}

    elapsed = time.time() - started
    stdout = proc.stdout.strip()

    payload: dict[str, Any]
    try:
        payload = json.loads(stdout) if stdout else {"ok": False, "error": "Tomt svar"}
    except json.JSONDecodeError:
        payload = {
            "ok": False,
            "error": "Kunde inte parsa JSON-svaret.",
            "raw_stdout_tail": stdout[-2000:],
        }

    payload.setdefault("client_elapsed_sec", round(elapsed, 2))
    payload.setdefault("client_exit_code", proc.returncode)
    if proc.stderr:
        payload.setdefault("client_stderr_tail", proc.stderr[-2000:])
    return payload


def _load_snapshots(ctx: BackofficeContext, max_rows: int = 200) -> list[dict[str, Any]]:
    path = ctx.repo_root / _SNAPSHOT_REL
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    try:
        # Läs sista N rader effektivt
        with path.open("rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            chunk = min(size, 256_000)
            fh.seek(size - chunk)
            tail = fh.read().decode("utf-8", errors="replace")
        lines = [ln for ln in tail.splitlines() if ln.strip()]
        for ln in lines[-max_rows:]:
            try:
                rows.append(json.loads(ln))
            except json.JSONDecodeError:
                continue
    except OSError:
        return []
    return rows


def _format_target(payload: dict[str, Any]) -> str:
    target = payload.get("target") or "(okänd)"
    if payload.get("is_prod_like"):
        return f"⚠️ {target}  · matchar `.env.vercel.production.pulled` (PROD-LIK)"
    return target


def render(ctx: BackofficeContext) -> None:
    st.title("Databashälsa")
    st.caption(
        "Read-only diagnos av Postgres (Supabase). Kör `scripts/db/db-health-check.mjs` "
        "via subprocess. Inga skrivningar görs av denna sida."
    )

    with st.expander("Vad gör sidan?", expanded=False):
        st.markdown(
            """
- Listar **alla förväntade tabeller** (definierade i `src/lib/db/schema.ts`).
- Räknar rader per tabell (estimate via `pg_class.reltuples`, snabb även på stora tabeller).
- Verifierar att alla **förväntade index** finns. Saknade → "köra `npm run db:perf-indexes`".
- Mäter **anslutnings­latens** + en `SELECT 1`-probe per tabell.
- Vid behov: spara **snapshots** för historik-grafer (ND-JSON i `data/observability/`).

Om databasen pekar mot din production-snapshot (`.env.vercel.production.pulled`)
flaggas det med ⚠️. Sidan är read-only så det är säkert, men bra att veta.
            """
        )

    col1, col2, col3 = st.columns([2, 1, 1])
    with col1:
        st.write("**Sista körningen** lagras i Streamlit-state — kör om för fräsch data.")
    with col2:
        save_snapshot = st.checkbox("Spara snapshot", value=False, help="Lägg till rad i historik-NDJSON")
    with col3:
        exact_count = st.checkbox(
            "Exakt rad-räkning",
            value=False,
            help="Använd COUNT(*) istället för pg_class-estimate. Långsammare men exakt.",
        )

    run_clicked = st.button("Testa allt nu", type="primary")
    if run_clicked:
        with st.spinner("Pratar med Postgres…"):
            payload = _run_health_check(ctx, snapshot=save_snapshot, exact_count=exact_count)
        st.session_state["db_health_last"] = payload

    payload = st.session_state.get("db_health_last")
    if not payload:
        st.info("Tryck **Testa allt nu** för att köra första hälso-kollen.")
    else:
        _render_payload(payload, ctx)

    st.divider()
    _render_history(ctx)


def _render_payload(payload: dict[str, Any], ctx: BackofficeContext) -> None:
    if payload.get("error") and not payload.get("connection"):
        st.error(payload["error"])
        if payload.get("client_stderr_tail"):
            with st.expander("stderr-tail"):
                st.code(payload["client_stderr_tail"])
        return

    ok = payload.get("ok")
    target = _format_target(payload)
    timestamp = payload.get("timestamp", "?")

    summary = payload.get("summary", {})
    conn = payload.get("connection", {})
    missing_indexes = payload.get("missing_indexes") or []
    extra_indexes = payload.get("extra_indexes") or []

    top_status = "✅ OK" if ok else "⚠️ Ej helt OK"
    st.subheader(f"{top_status} — {target}")
    st.caption(f"Körd: {timestamp} · client elapsed {payload.get('client_elapsed_sec', '?')}s")

    cols = st.columns(5)
    cols[0].metric("Connection ms", conn.get("latency_ms", "—"))
    cols[1].metric("Tabeller (närv/förv)", f"{summary.get('total_tables_present', '—')}/{summary.get('total_tables_expected', '—')}")
    cols[2].metric("Rader (estimate)", f"{summary.get('total_rows_estimate', 0):,}".replace(",", " "))
    cols[3].metric("Saknade index", summary.get("total_indexes_missing", 0))
    cols[4].metric("Extra index", summary.get("total_indexes_extra", 0))

    if missing_indexes:
        st.error(
            f"⚠️ **{len(missing_indexes)} index saknas.** Det här är den vanligaste orsaken till "
            "långsamma queries. Kör:"
        )
        st.code("npm run db:perf-indexes", language="bash")
        st.caption(
            "Skriptet är idempotent (`CREATE INDEX IF NOT EXISTS`) — säkert att köra om-och-om-igen, "
            "även mot prod. Skapar bara de index som saknas."
        )
        with st.expander("Vilka index saknas?", expanded=True):
            df = pd.DataFrame(missing_indexes)
            st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.success("✅ Alla förväntade index finns på plats.")

    if extra_indexes:
        with st.expander(f"Extra index i DB:n ({len(extra_indexes)} st) — finns men inte deklarerade i schemat", expanded=False):
            st.caption(
                "Dessa kan vara legacy från manuella `CREATE INDEX`-körningar eller drift "
                "mellan `schema.ts` och faktisk DB. Inte automatiskt fel — bara värt att veta."
            )
            df = pd.DataFrame(extra_indexes)
            st.dataframe(df, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Tabeller")

    tables = payload.get("tables", [])
    rows = []
    for t in tables:
        rows.append(
            {
                "Tabell": t.get("name"),
                "Finns": "✅" if t.get("exists") else "❌",
                "Rader (est.)": t.get("row_count_estimate", 0),
                "Rader (exakt)": t.get("row_count_exact", "—") if t.get("row_count_exact") is not None else "—",
                "PK": "✅" if t.get("has_pk") else "—",
                "Index": len(t.get("indexes") or []),
                "Saknade idx": len(t.get("missing_indexes") or []),
                "Probe ms": t.get("probe_latency_ms"),
                "Probe-fel": t.get("probe_error") or "",
            }
        )
    df = pd.DataFrame(rows)
    # Färga saknade-idx-kolumnen
    st.dataframe(df, use_container_width=True, hide_index=True)

    with st.expander("Råa JSON-svaret (för debug)", expanded=False):
        st.json(payload)


def _render_history(ctx: BackofficeContext) -> None:
    st.subheader("Historik (snapshots)")
    snapshots = _load_snapshots(ctx)
    if not snapshots:
        st.info(
            "Inga snapshots än. Kryssa i **Spara snapshot** ovan och kör "
            "**Testa allt nu** för att börja samla historik."
        )
        return

    df_summary = pd.DataFrame(
        [
            {
                "timestamp": s.get("timestamp"),
                "rows_total": s.get("total_rows_estimate"),
                "tables_present": s.get("total_tables_present"),
                "indexes_missing": s.get("total_indexes_missing"),
                "connection_ms": s.get("connection_latency_ms"),
            }
            for s in snapshots
        ]
    )
    df_summary["timestamp"] = pd.to_datetime(df_summary["timestamp"], errors="coerce", utc=True)
    df_summary = df_summary.dropna(subset=["timestamp"]).set_index("timestamp")

    if df_summary.empty:
        st.warning("Snapshot-filen kunde inte parsas.")
        return

    tab_a, tab_b, tab_c = st.tabs(["Rader över tid", "Latens över tid", "Saknade index över tid"])
    with tab_a:
        st.line_chart(df_summary["rows_total"])
    with tab_b:
        st.line_chart(df_summary["connection_ms"])
    with tab_c:
        st.line_chart(df_summary["indexes_missing"])

    with st.expander("Rådata (sista 200 snapshots)"):
        st.dataframe(df_summary.reset_index(), use_container_width=True, hide_index=True)
