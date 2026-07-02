# -*- coding: utf-8 -*-
"""Logg-export — välj vilka och hur många loggar du vill tanka hem från DB:n.

Interaktiv yta för att hämta (read-only) rader ur logg-tabellerna och ladda
ner dem som JSON/CSV. Kan peka mot:

  * **Dev** — DB:n som `.env.local` pekar på (samma som övriga backoffice-sidor).
  * **Produktion** — DB:n i `.env.vercel.production.pulled` (du måste hämta den
    prod-env-filen först; en knapp för `vercel env pull` finns nedan, och en
    knapp för att radera filen efteråt så prod-secrets inte ligger kvar).

Allt här är **read-only** (SELECT). Drivs av `scripts/db/dump-logs.mjs` via
subprocess (backoffice har ingen egen Postgres-driver) — samma mönster som
`generation_history.py` och `database_health.py`.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext, render_where_panel, read_json

_DUMP_SCRIPT_REL = "scripts/db/dump-logs.mjs"
_PROD_ENV_FILE = ".env.vercel.production.pulled"
_DEV_ENV_FILE = ".env.local"
_TIMEOUT_S = 90
_PULL_TIMEOUT_S = 120

# Kind-id -> (etikett, hjälptext). Speglar KIND_SPECS i dump-logs.mjs.
_KIND_LABELS: dict[str, tuple[str, str]] = {
    "prompts": ("Promptar (prompt_logs)", "Användarens prompt + formaterad prompt per tur."),
    "generations": ("Genereringar (engine_generation_logs)", "Model, tokens, duration, success/fel per generering."),
    "versions": ("Versioner (engine_versions)", "Version-rader: lifecycle, release/verify-state, summary."),
    "telemetry": ("Telemetri (generation_telemetry)", "Scaffold, retry, autofix, preflight, quality gate, preview."),
    "errors": ("Fel/warnings (engine_version_error_logs)", "Per-version fel- och varningsrader."),
    "chats": ("Chattar (engine_chats)", "Chatt/projekt-metadata."),
    "oc": ("OpenClaw-fynd (oc_debug_findings)", "Bug-hunt (Mode B): severity, build_result, repair_outcome."),
    "ragevents": ("RAG-events (error_log_events)", "Durabel fault/fix-telemetri: fault, fix_text, result."),
    "deploys": ("Deploys (deployments)", "Vercel-deploy per sajt: deployment/project-id, url, status."),
}
_DEFAULT_KINDS = ["prompts", "generations", "versions", "telemetry", "errors"]


def _resolve_cmd(name: str) -> str | None:
    return shutil.which(name)


def _run_dump(
    ctx: BackofficeContext,
    *,
    env_file: str,
    kinds: list[str],
    limit: int,
    chat_id: str | None,
    allow_insecure_ssl: bool = True,
) -> dict[str, Any]:
    node = _resolve_cmd("node")
    if node is None:
        return {"error": "`node` saknas på PATH."}
    script = ctx.repo_root / _DUMP_SCRIPT_REL
    if not script.exists():
        return {"error": f"Script saknas: {script}"}

    args = [
        node,
        str(script),
        "--json",
        f"--env={env_file}",
        f"--kinds={','.join(kinds)}",
        f"--limit={int(limit)}",
    ]
    if allow_insecure_ssl:
        args.append("--allow-insecure-ssl")
    if chat_id:
        args.append(f"--chat={chat_id.strip()}")

    try:
        proc = subprocess.run(
            args,
            cwd=str(ctx.repo_root),
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"error": f"dump-logs.mjs timade ut efter {_TIMEOUT_S}s."}

    stdout = (proc.stdout or "").strip()
    if not stdout:
        return {"error": (proc.stderr or "Tomt svar från dump-logs.mjs").strip()}
    # Robusthet: om något (t.ex. dotenv) råkat skriva en rad före JSON:en,
    # extrahera från första "{".
    brace = stdout.find("{")
    candidate = stdout[brace:] if brace != -1 else stdout
    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError as exc:
        return {"error": f"Kunde inte tolka JSON: {exc}", "raw": stdout[-2000:]}
    return payload if isinstance(payload, dict) else {"error": "Oväntat svarsformat."}


def _run_vercel_pull(ctx: BackofficeContext) -> dict[str, Any]:
    vercel = _resolve_cmd("vercel")
    if vercel is None:
        return {"ok": False, "error": "`vercel` CLI saknas på PATH (npm i -g vercel)."}
    args = [
        vercel, "env", "pull", _PROD_ENV_FILE,
        "--environment=production", "--yes",
    ]
    started = time.time()
    try:
        proc = subprocess.run(
            args,
            cwd=str(ctx.repo_root),
            capture_output=True,
            text=True,
            timeout=_PULL_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"vercel env pull timade ut efter {_PULL_TIMEOUT_S}s."}
    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-2000:],
        "stderr_tail": (proc.stderr or "")[-2000:],
        "elapsed_sec": round(time.time() - started, 2),
    }


def _truncate_cols(df: pd.DataFrame, limit: int = 160) -> pd.DataFrame:
    out = df.copy()
    for col in out.columns:
        out[col] = out[col].apply(
            lambda v: (v[:limit] + "…") if isinstance(v, str) and len(v) > limit else v
        )
    return out


def render(ctx: BackofficeContext) -> None:
    st.title("Logg-export")
    st.caption(
        "Välj vilka loggtyper och hur många rader du vill tanka hem från databasen, "
        "och ladda ner som JSON/CSV. **Read-only** (SELECT). Kan peka mot dev "
        "(`.env.local`) eller produktion (`.env.vercel.production.pulled`)."
    )

    domain_map = (
        read_json(ctx.domain_map_json)
        if ctx.domain_map_json.is_file()
        else {"pages": {}, "repoSiblings": {}}
    )
    render_where_panel("Logg-export", domain_map)

    # --- Mål-DB ---------------------------------------------------------------
    st.subheader("1. Mål-databas")
    target_choice = st.radio(
        "Vilken databas?",
        ["Dev (.env.local)", "Produktion (.env.vercel.production.pulled)"],
        index=0,
        horizontal=True,
        key="log_export_target",
    )
    is_prod = target_choice.startswith("Produktion")
    env_file = _PROD_ENV_FILE if is_prod else _DEV_ENV_FILE
    prod_path = ctx.repo_root / _PROD_ENV_FILE
    prod_exists = prod_path.is_file()

    if is_prod:
        st.warning(
            "Produktionsläge. Du läser mot prod-DB:n. Filen "
            f"`{_PROD_ENV_FILE}` innehåller prod-secrets — radera den när du är klar."
        )
        if prod_exists:
            st.success(f"✅ `{_PROD_ENV_FILE}` finns. Klart att läsa prod.")
        else:
            st.error(f"❌ `{_PROD_ENV_FILE}` saknas. Hämta prod-env först:")
        col_pull, col_del = st.columns(2)
        with col_pull:
            confirm_pull = st.checkbox(
                "Jag vill hämta prod-env (skriver prod-secrets till disk)",
                value=False,
                key="log_export_confirm_pull",
            )
            if st.button(
                "⬇ Hämta prod-env (vercel env pull)",
                disabled=not confirm_pull,
                key="log_export_pull",
            ):
                with st.spinner("Kör `vercel env pull`…"):
                    res = _run_vercel_pull(ctx)
                st.session_state["log_export_pull_result"] = res
                st.rerun()
        with col_del:
            if st.button(
                "🗑 Radera prod-env-filen",
                disabled=not prod_exists,
                key="log_export_del",
            ):
                try:
                    prod_path.unlink()
                    st.session_state["log_export_pull_result"] = {"ok": True, "deleted": True}
                except OSError as exc:
                    st.session_state["log_export_pull_result"] = {"ok": False, "error": str(exc)}
                st.rerun()

        pull_res = st.session_state.get("log_export_pull_result")
        if pull_res:
            if pull_res.get("deleted"):
                st.info("Prod-env-filen raderad.")
            elif pull_res.get("ok"):
                st.success(f"Prod-env hämtad ({pull_res.get('elapsed_sec', '?')}s).")
            else:
                st.error(f"Misslyckades: {pull_res.get('error') or 'se logg'}")
                if pull_res.get("stderr_tail"):
                    st.code(pull_res["stderr_tail"])

    # --- Val ------------------------------------------------------------------
    st.subheader("2. Vad och hur mycket")
    kinds = st.multiselect(
        "Loggtyper",
        options=list(_KIND_LABELS.keys()),
        default=_DEFAULT_KINDS,
        format_func=lambda k: _KIND_LABELS[k][0],
        key="log_export_kinds",
    )
    with st.expander("Vad är varje loggtyp?", expanded=False):
        for k, (label, hint) in _KIND_LABELS.items():
            st.markdown(f"- **{label}** — {hint}")

    col_a, col_b = st.columns([1, 2])
    with col_a:
        limit = st.number_input(
            "Antal rader per typ (nyast först)",
            min_value=1,
            max_value=1000,
            value=50,
            step=10,
            key="log_export_limit",
        )
    with col_b:
        chat_id = st.text_input(
            "Filtrera på chat-id (valfritt)",
            value="",
            placeholder="t.ex. 86c4bb41-cb43-426b-8810-7d552adb384f",
            help="Lämna tomt för senaste rader över alla chattar.",
            key="log_export_chat",
        )

    allow_insecure_ssl = st.checkbox(
        "Tillåt självsignerat TLS-cert (Supabase)",
        value=True,
        help=(
            "Supabase-poolern uppfattas ofta som självsignerad i den här miljön "
            "(se AGENTS.md: DB_SSL_REJECT_UNAUTHORIZED=false). Lämna ikryssad om du "
            "får 'self-signed certificate in certificate chain'."
        ),
        key="log_export_ssl",
    )

    # --- Hämta ----------------------------------------------------------------
    st.subheader("3. Hämta")
    fetch_disabled = not kinds or (is_prod and not prod_exists)
    if st.button("📥 Hämta loggar", type="primary", disabled=fetch_disabled, key="log_export_fetch"):
        with st.spinner(f"Läser {', '.join(kinds)} från {env_file}…"):
            payload = _run_dump(
                ctx,
                env_file=env_file,
                kinds=kinds,
                limit=int(limit),
                chat_id=chat_id or None,
                allow_insecure_ssl=allow_insecure_ssl,
            )
        st.session_state["log_export_payload"] = payload

    payload = st.session_state.get("log_export_payload")
    if not payload:
        st.info("Välj loggtyper och tryck **Hämta loggar**.")
        return

    if payload.get("error"):
        st.error(f"Kunde inte hämta: {payload['error']}")
        if payload.get("raw"):
            with st.expander("Rå stdout"):
                st.code(payload["raw"])
        st.caption(
            "Tips: för dev måste `.env.local` ha `POSTGRES_URL`. För prod, hämta "
            f"`{_PROD_ENV_FILE}` med knappen ovan."
        )
        return

    target = payload.get("target", "?")
    prod_like = payload.get("isProdLike")
    st.markdown(
        f"**Källa:** `{payload.get('envPath')}` → `{target}`"
        + ("  ⚠️ **PROD-LIKE**" if prod_like else "")
    )
    counts = payload.get("counts") or {}
    st.caption("Rader: " + " · ".join(f"{k}={v}" for k, v in counts.items()))

    # Hela nedladdningen som JSON (full data, inte trunkerad).
    full_json = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    st.download_button(
        "⬇ Ladda ner allt som JSON",
        data=full_json.encode("utf-8"),
        file_name=f"logs-{'prod' if prod_like else 'dev'}-{int(time.time())}.json",
        mime="application/json",
        key="log_export_dl_json",
    )

    data = payload.get("data") or {}
    for kind in payload.get("kinds", []):
        rows = data.get(kind) or []
        label = _KIND_LABELS.get(kind, (kind, ""))[0]
        st.markdown(f"#### {label} — {len(rows)} rader")
        if not rows:
            st.caption("Inga rader.")
            continue
        df = pd.DataFrame(rows)
        st.dataframe(_truncate_cols(df), hide_index=True, use_container_width=True)
        st.download_button(
            f"⬇ {kind}.csv",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name=f"{kind}-{int(time.time())}.csv",
            mime="text/csv",
            key=f"log_export_dl_csv_{kind}",
        )
