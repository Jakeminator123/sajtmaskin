# -*- coding: utf-8 -*-
"""Redis-hälsa — visa nyckelprefix, "testa allt"-knapp, historik-grafer.

Read-only Streamlit-sida som anropar `scripts/db/redis-health-check.mjs`
(använder `@upstash/redis` HTTP-klient) via subprocess. Sidan VISAR resultatet —
den enda mutation som sker är en self-test (write/read/del på en TTL-30s
hälsonyckel) som health-skriptet städar upp åt oss.

Snapshots → `data/observability/redis-health-snapshots.ndjson` (ND-JSON), grafas
över tid (total_keys, latens, per-prefix-counts).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext

_DEFAULT_TIMEOUT_S = 30
_HEALTH_SCRIPT_REL = "scripts/db/redis-health-check.mjs"
_SNAPSHOT_REL = "data/observability/redis-health-snapshots.ndjson"


def _resolve_node_command() -> tuple[str, ...] | None:
    path = shutil.which("node")
    return (path,) if path else None


def _run_redis_check(ctx: BackofficeContext, *, snapshot: bool) -> dict[str, Any]:
    node = _resolve_node_command()
    if node is None:
        return {"ok": False, "error": "node finns inte på PATH."}

    args: list[str] = list(node) + [str(ctx.repo_root / _HEALTH_SCRIPT_REL)]
    if snapshot:
        args.append("--snapshot")

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


def render(ctx: BackofficeContext) -> None:
    st.title("Redis-hälsa (Upstash REST)")
    st.caption(
        "Diagnos av Upstash Redis via **HTTP/REST-klienten** (`@upstash/redis`). "
        "Self-test skriver/läser/raderar en hälsonyckel — i övrigt inga mutationer."
    )

    # BUG-FIX 2026-04-24 (rapport från test-agenter): tidigare versioner av
    # denna sida lät det se ut som "är Redis OK?" rent generellt. I själva
    # verket använder appen TVÅ klienter mot samma Upstash-instans:
    #
    #   - `ioredis` (TCP, REDIS_URL/KV_URL): app-cache, sessioner,
    #     project-files, video-jobs, preview-sessions, deploy-status pubsub
    #   - `@upstash/redis` (HTTP/REST): rate-limiting + denna hälsokoll
    #
    # Samma databas, olika transport — REST-failure = pubsub kan ändå funka,
    # och TCP-failure = denna sida visar grön. Både är "äkta Redis".
    st.warning(
        "ℹ️ **Denna sida testar bara HTTP/REST-vägen.** App-cache, sessioner, "
        "deploy-status pubsub m.m. går via `ioredis` (TCP) som **inte** valideras "
        "här. För TCP-statusen, kolla `/api/health` eller server-loggar för "
        "`[Redis] Connected` / `[Redis] Connection error`."
    )

    with st.expander("Vad gör sidan?", expanded=False):
        st.markdown(
            """
- **PING** + INFO → server-version, uptime, used memory, total keys.
- Räknar nycklar per **prefix-bucket** (`dev:user:session:*`, `dev:cache:*`, etc.)
  via SCAN. Visar 3 sample-nycklar per bucket så man ser ungefär vad som ligger där.
- **Probe**: write → read → delete på `<env>:health:probe:<ts>` (TTL=30s som
  fail-safe om något går fel mitt i). Mäter latens per steg.
- Snapshots → `data/observability/redis-health-snapshots.ndjson` för historik.

`<env>`-prefixet är `dev:` lokalt, `preview:` på Vercel preview, `prod:` i prod.
Detta är rätt prefix automatiskt baserat på `VERCEL_ENV` / `NODE_ENV`.
            """
        )

    col1, col2 = st.columns([3, 1])
    with col1:
        st.write(
            "Sista körningen lagras i Streamlit-state — kör om för fräsch data."
        )
    with col2:
        save_snapshot = st.checkbox("Spara snapshot", value=False)

    if st.button("Testa allt nu", type="primary"):
        with st.spinner("Pratar med Upstash…"):
            payload = _run_redis_check(ctx, snapshot=save_snapshot)
        st.session_state["redis_health_last"] = payload

    payload = st.session_state.get("redis_health_last")
    if not payload:
        st.info("Tryck **Testa allt nu** för att köra första hälso-kollen.")
    else:
        _render_payload(payload)

    st.divider()
    _render_history(ctx)


def _render_payload(payload: dict[str, Any]) -> None:
    if payload.get("error") and not payload.get("connection"):
        st.error(payload["error"])
        if payload.get("client_stderr_tail"):
            with st.expander("stderr-tail"):
                st.code(payload["client_stderr_tail"])
        return

    ok = payload.get("ok")
    target = payload.get("target", "(okänd)")
    timestamp = payload.get("timestamp", "?")
    summary = payload.get("summary", {})
    conn = payload.get("connection", {})
    server = payload.get("server") or {}
    probe = payload.get("probe") or {}
    runtime_env = payload.get("runtime_env", "?")
    key_prefix = payload.get("key_prefix", "?")

    top_status = "✅ OK" if ok else "⚠️ Probe failade"
    st.subheader(f"{top_status} — {target}")
    st.caption(
        f"Körd: {timestamp} · runtime: **{runtime_env}** · prefix: `{key_prefix}` "
        f"· client elapsed {payload.get('client_elapsed_sec', '?')}s"
    )

    cols = st.columns(5)
    cols[0].metric("PING ms", conn.get("latency_ms", "—"))
    cols[1].metric("Total keys", summary.get("total_keys", "—"))
    cols[2].metric("Probe round-trip ms", summary.get("probe_round_trip_ms", "—"))
    cols[3].metric("Used memory", server.get("used_memory_human") or "—")
    cols[4].metric("Uptime (h)", round((server.get("uptime_seconds") or 0) / 3600, 1) if server.get("uptime_seconds") else "—")

    # Probe-detaljer
    if not (probe.get("write", {}).get("ok") and probe.get("read", {}).get("ok") and probe.get("delete", {}).get("ok")):
        st.error(
            "⚠️ Self-test (write/read/del) failade. Kontrollera Upstash-credentials "
            "(UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN i `.env.local`)."
        )

    with st.expander("Probe-detaljer (write/read/delete)", expanded=not ok):
        probe_rows = []
        for step in ("write", "read", "delete"):
            s = probe.get(step) or {}
            probe_rows.append(
                {
                    "Steg": step.upper(),
                    "OK": "✅" if s.get("ok") else "❌",
                    "Latens ms": s.get("latency_ms"),
                    "Fel": s.get("error") or "",
                }
            )
        st.dataframe(pd.DataFrame(probe_rows), use_container_width=True, hide_index=True)
        st.caption(f"Probe-nyckel: `{probe.get('key', '?')}` (TTL 30s, raderas direkt)")

    st.divider()
    st.subheader("Nyckel-buckets (per prefix-mönster)")

    prefixes = payload.get("prefixes") or []
    rows = []
    for p in prefixes:
        scope = p.get("scope", "?")
        rows.append(
            {
                "Bucket": p.get("label"),
                "Scope": "🔒 env" if scope == "env" else "🌐 global",
                "Pattern": p.get("pattern"),
                "Antal": p.get("key_count") if p.get("key_count") is not None else "?",
                "SCAN ms": p.get("latency_ms"),
                "Trunkerat": "⚠️" if p.get("truncated") else "",
                "Sample": ", ".join((p.get("sample_keys") or [])[:3]) or "—",
                "Fel": p.get("error") or "",
            }
        )
    df = pd.DataFrame(rows)
    st.dataframe(df, use_container_width=True, hide_index=True)
    st.caption(
        "**🔒 env** = pattern prefixad med denna miljös key-prefix (siffran "
        "avser bara denna miljö). **🌐 global** = pattern saknar miljöprefix "
        "(siffran kan blanda dev/preview/prod). "
        "**SCAN trunkeras efter ~50k nycklar** för att inte hänga backoffice."
    )

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

    rows = [
        {
            "timestamp": s.get("timestamp"),
            "total_keys": s.get("total_keys"),
            "ping_ms": s.get("connection_latency_ms"),
            "probe_round_trip_ms": s.get("probe_round_trip_ms"),
            "used_memory_human": s.get("used_memory_human"),
        }
        for s in snapshots
    ]
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df = df.dropna(subset=["timestamp"]).set_index("timestamp")
    if df.empty:
        st.warning("Snapshot-filen kunde inte parsas.")
        return

    tab_a, tab_b, tab_c = st.tabs(["Total keys", "PING-latens", "Probe round-trip"])
    with tab_a:
        st.line_chart(df["total_keys"])
    with tab_b:
        st.line_chart(df["ping_ms"])
    with tab_c:
        st.line_chart(df["probe_round_trip_ms"])

    with st.expander("Rådata (sista 200 snapshots)"):
        st.dataframe(df.reset_index(), use_container_width=True, hide_index=True)
