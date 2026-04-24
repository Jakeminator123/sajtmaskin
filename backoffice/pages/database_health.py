# -*- coding: utf-8 -*-
"""Databashälsa — visa alla tabeller, indexstatus och kör migrationer säkert.

Streamlit-sida med tre delar:
  1. **Hälso-koll** (read-only): kör `scripts/db/db-health-check.mjs` via
     subprocess och visar tabell-status + saknade index.
  2. **Applicera index** (mutation, gated): "röd knapp" som kör
     `scripts/db/add-performance-indexes.mjs` (idempotent + dedupe-aware).
     Kräver minst 10 teckens motivering + bekräftelse innan apply blir aktiv.
     Audit-logg skrivs till `data/observability/db-perf-indexes-runs.ndjson`.
  3. **Historik**: linjegrafer från snapshot-NDJSON (rader, latens, missing).

Auto-applicering: `npm run dev` triggar `predev` som kör perf-indexes som
soft-step (failar inte dev-server om migrationen krånglar). I prod körs
ingenting automatiskt — knappen är den enda triggern.

Designprincip: användaren kan vara icke-teknisk. Vi gör det medvetet
SVÅRT att råka klicka apply (text-ruta + checkbox). Skriptet är säkert
även vid "olyckliga" klick (idempotent), men friktionen tvingar reflektion.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext

_DEFAULT_TIMEOUT_S = 60
_PERF_INDEX_TIMEOUT_S = 300  # CREATE INDEX kan ta tid på stora tabeller
_HEALTH_SCRIPT_REL = "scripts/db/db-health-check.mjs"
_PERF_INDEX_SCRIPT_REL = "scripts/db/add-performance-indexes.mjs"
_SNAPSHOT_REL = "data/observability/db-health-snapshots.ndjson"
_PERF_AUDIT_REL = "data/observability/db-perf-indexes-runs.ndjson"


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


def _run_perf_indexes(ctx: BackofficeContext, *, reason: str, dry_run: bool) -> dict[str, Any]:
    """Kör add-performance-indexes.mjs med audit-reason. Returnerar parsed result."""
    node = _resolve_node_command()
    if node is None:
        return {"ok": False, "error": "node finns inte på PATH."}

    args: list[str] = list(node) + [
        str(ctx.repo_root / _PERF_INDEX_SCRIPT_REL),
        "--reason",
        reason,
    ]
    if dry_run:
        args.append("--dry-run")

    started = time.time()
    try:
        proc = subprocess.run(
            args,
            cwd=str(ctx.repo_root),
            capture_output=True,
            text=True,
            timeout=_PERF_INDEX_TIMEOUT_S,
            shell=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": f"Migrationen timade ut efter {_PERF_INDEX_TIMEOUT_S}s.",
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Misslyckades starta node: {exc}"}

    elapsed = time.time() - started
    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "stdout_tail": proc.stdout[-4000:],
        "stderr_tail": proc.stderr[-4000:],
        "elapsed_sec": round(elapsed, 2),
    }


def _load_perf_audit_log(ctx: BackofficeContext, max_rows: int = 50) -> list[dict[str, Any]]:
    path = ctx.repo_root / _PERF_AUDIT_REL
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    try:
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
        "Diagnos av Postgres (Supabase). **Hälsokollen är read-only**, men "
        "längre ner finns ett **APPLY-flöde** som muterar DB:n (skapar "
        "saknade index). APPLY kräver motivering + bekräftelse + audit-logg."
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
    _render_perf_index_button(ctx, payload)

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
    cols[1].metric(
        "Tabeller (närv/förv)",
        f"{summary.get('total_tables_present', '—')}/{summary.get('total_tables_expected', '—')}",
        delta=(
            None
            if summary.get("total_tables_missing", 0) == 0
            else f"-{summary['total_tables_missing']} saknas"
        ),
        delta_color="inverse",
    )
    cols[2].metric("Rader (estimate)", f"{summary.get('total_rows_estimate', 0):,}".replace(",", " "))
    cols[3].metric("Saknade index", summary.get("total_indexes_missing", 0))
    cols[4].metric("Extra index", summary.get("total_indexes_extra", 0))

    # BUG-FIX 2026-04-24 (rapport från test-agent): saknad tabell ska göra
    # toppstatusen NOT-ok, inte bara index-gap. db-health-skriptet sköter
    # ok-flaggan nu, men UI:t måste också skrika om tabeller saknas.
    if summary.get("total_tables_missing", 0) > 0:
        st.error(
            f"⚠️ **{summary['total_tables_missing']} förväntade tabeller saknas i DB:n.** "
            "Kör `npm run db:init` för att skapa dem (säker — `CREATE TABLE IF NOT EXISTS`)."
        )
    if summary.get("total_table_probe_failures", 0) > 0:
        st.error(
            f"⚠️ **{summary['total_table_probe_failures']} tabeller kunde inte queryas** "
            "(SELECT 1 LIMIT 1 misslyckades). Se `Probe-fel`-kolumnen nedan för detaljer."
        )

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


def _render_perf_index_button(ctx: BackofficeContext, payload: dict[str, Any] | None) -> None:
    """Röd knapp: skapa saknade index. Kräver motivering + bekräftelse + audit-logg.

    Designprincip: användaren kan vara icke-teknisk. Vi gör det medvetet
    SVÅRT att råka klicka — text-rutan tvingar reflektion, kryss-rutan
    bekräftar att man läst varningen, och targetet visas i klartext.
    Skriptet i sig (`add-performance-indexes.mjs`) är idempotent + dedupe-
    aware, så även "olyckliga" klick är säkra. Audit-logg skrivs alltid.
    """
    st.subheader("🔧 Applicera saknade index")

    missing_count = 0
    if payload:
        missing_count = (payload.get("summary") or {}).get("total_indexes_missing", 0)
        target = payload.get("target", "(okänd)")
        is_prod_like = payload.get("is_prod_like", False)
    else:
        target = "(okänd — tryck Testa allt nu först)"
        is_prod_like = False

    if missing_count == 0 and payload is not None:
        st.success(
            "✅ Inga saknade index. Den här knappen är gråad — det finns inget att applicera."
        )

    with st.expander("Vad gör knappen?", expanded=False):
        st.markdown(
            """
**Vad körs:** `node scripts/db/add-performance-indexes.mjs --reason "<din motivering>"`

**Vad händer:**
- Skriptet skapar alla index som backoffice-checken markerat som "saknade" ovan.
- Skriptet är **idempotent** (`CREATE INDEX IF NOT EXISTS`) — om något redan
  finns hoppas det över. Du kan trycka den 100 gånger utan skada.
- Det är **dedupe-aware** — om ett index med annat namn redan täcker samma
  kolumner, hoppas det över istället för att skapa en duplikat.
- Skriptet **ändrar inte data** i tabellerna. Det skapar bara index, vilket
  Postgres bygger i bakgrunden och gör queries snabbare.
- En audit-rad skrivs till `data/observability/db-perf-indexes-runs.ndjson`
  med tidsstämpel, din motivering, och resultatet.

**Vad kan gå fel:**
- DB:n är otillgänglig → migrationen failar tyst, audit-logg visar varför.
- Två agenter försöker skapa samma index samtidigt → en av dem får
  "already exists" och hoppar över. Inget skadligt händer.
- Indexet tar längre tid att bygga än 5 minuter → timeout. På små tabeller
  (< 100k rader) bör det aldrig hända.

**När du ska klicka:**
- När hälsokollen ovan visar saknade index OCH du noterar att appen är slö.
- Efter en schema-migration som lagt till nya tabeller.
- Som rutin efter större deploys.

**När du INTE ska klicka:**
- Om du inte har kollat att DB-pekaren ovan stämmer (`.env.local` POSTGRES_URL).
- Om appen pågår en stor write-burst (t.ex. mass-import). Vänta tills lugnt.
            """
        )

    st.markdown(
        f"**Mål-DB:** `{target}`"
        + (" ⚠️ **PROD-LIKE — extra försiktig!**" if is_prod_like else "")
    )

    col1, col2 = st.columns([3, 1])
    with col1:
        reason = st.text_input(
            "Varför kör du detta? (loggas i audit-NDJSON)",
            value="",
            placeholder="Ex: 'Hälsokollen visade 17 saknade index efter dagens deploy'",
            help="Skriv minst 10 tecken. Tomt eller för kort → knappen är inaktiv.",
            key="perf_idx_reason",
        )
    with col2:
        st.write("")  # spacer
        st.write("")  # spacer
        confirmed = st.checkbox(
            "Jag förstår vad knappen gör",
            value=False,
            key="perf_idx_confirmed",
        )

    valid_reason = isinstance(reason, str) and len(reason.strip()) >= 10
    can_run = valid_reason and confirmed

    btn_col1, btn_col2 = st.columns([1, 1])
    with btn_col1:
        if st.button(
            "🔍 Dry-run (se exakt vad som skulle göras)",
            disabled=not valid_reason,
            help="Säker — skapar inga index, bara visar.",
            key="perf_idx_dry",
        ):
            with st.spinner("Kör dry-run…"):
                result = _run_perf_indexes(ctx, reason=reason.strip(), dry_run=True)
            st.session_state["perf_idx_last_result"] = {"mode": "dry_run", **result}
    with btn_col2:
        # Använd type="primary" för att markera den som "huvudknapp" (visuellt röd/blå
        # beroende på Streamlit-tema). Vi simulerar "röd" genom att namnet är tydligt.
        if st.button(
            "⚡ APPLY — skapa saknade index nu",
            type="primary",
            disabled=not can_run,
            help=("Bocka i bekräftelsen + minst 10 tecken motivering" if not can_run else None),
            key="perf_idx_apply",
        ):
            with st.spinner("Applicerar — kan ta upp till 5 min på stora tabeller…"):
                result = _run_perf_indexes(ctx, reason=reason.strip(), dry_run=False)
            st.session_state["perf_idx_last_result"] = {"mode": "apply", **result}

    last = st.session_state.get("perf_idx_last_result")
    if last:
        mode_label = "DRY-RUN" if last.get("mode") == "dry_run" else "APPLY"
        if last.get("ok"):
            st.success(
                f"✅ {mode_label} klar på {last.get('elapsed_sec', '?')}s (exit {last.get('exit_code', '?')})"
            )
        else:
            st.error(
                f"❌ {mode_label} failade — {last.get('error') or 'se stdout/stderr nedan'}"
            )
        with st.expander(f"{mode_label}: stdout/stderr (för debug)", expanded=not last.get("ok")):
            if last.get("stdout_tail"):
                st.code(last["stdout_tail"], language="bash")
            if last.get("stderr_tail"):
                st.caption("stderr:")
                st.code(last["stderr_tail"], language="bash")

    # Audit-historik (alla kör — auto-predev + manuella)
    audit_rows = _load_perf_audit_log(ctx, max_rows=20)
    if audit_rows:
        with st.expander(f"Audit-logg (sista {len(audit_rows)} körningar)", expanded=False):
            display_rows = []
            for entry in reversed(audit_rows):  # nyast först
                display_rows.append(
                    {
                        "Tidsstämpel": entry.get("timestamp", "?"),
                        "Läge": "DRY-RUN" if entry.get("dry_run") else "APPLY",
                        "Skapade": entry.get("created", 0),
                        "Fanns": entry.get("already", 0),
                        "Failade": entry.get("failed", 0),
                        "Av": entry.get("process_user") or "?",
                        "Miljö": entry.get("runtime_env", "?"),
                        "Motivering": entry.get("reason") or "(ingen)",
                    }
                )
            st.dataframe(
                pd.DataFrame(display_rows),
                use_container_width=True,
                hide_index=True,
            )


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
