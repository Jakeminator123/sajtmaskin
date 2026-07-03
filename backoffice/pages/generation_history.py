"""Generation History — tidigare genereringar av användarsidor + vad varje steg gjorde.

Read-only mot DB:n som `.env.local` pekar på. Kör Node-scriptet
`scripts/db/generation-history.mjs --json` via subprocess (samma mönster som
`scaffold_performance.py` — backoffice har ingen egen Postgres-driver) och
renderar resultatet.

Två lager:
  1. Senaste genereringar (lista) — en rad per `generation_telemetry`-post med
     scaffold, model, retry/Normalize, preflight, RenderGate/ReleaseGate och preview-utfall.
  2. Drilldown per chatt — versioner (F2/F3 lifecycle), telemetri, fel-loggar
     (`engine_version_error_logs`) och generation-loggar.

Datakällor (skrivs av pipelinen): `generation_telemetry`, `engine_versions`,
`engine_version_error_logs`, `engine_generation_logs`, `engine_chats`,
`app_projects`. Inget skrivs härifrån.
"""

from __future__ import annotations

import json
import subprocess
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext

_SCRIPT_REL = "scripts/db/generation-history.mjs"
_TIMEOUT_S = 60


def _run_history(repo_root, extra_args: list[str]) -> dict[str, Any]:
    """Kör generation-history.mjs read-only och returnerar parsad JSON.

    Returnerar alltid en dict; vid fel ligger orsaken i nyckeln ``error``.
    """
    script_path = repo_root / _SCRIPT_REL
    if not script_path.exists():
        return {"error": f"Script saknas: {script_path}"}
    try:
        result = subprocess.run(
            ["node", str(script_path), "--json", *extra_args],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"error": f"Script timeout efter {_TIMEOUT_S}s"}
    except FileNotFoundError:
        return {"error": "`node` saknas på PATH"}

    stdout = (result.stdout or "").strip()
    if not stdout:
        return {"error": (result.stderr or "Tomt svar från script").strip()}
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return {"error": f"Kunde inte tolka JSON: {exc}"}
    if isinstance(data, dict):
        return data
    return {"error": "Oväntat svarsformat (förväntade objekt)."}


def _preview_label(value: Any) -> str:
    # M#pv1 (honest preview_success tri-state):
    #   True  -> runtime confirmed ready (runtime-ready receipt), not just
    #            "preflight did not block" as the old semantics claimed.
    #   False -> confirmed no working preview (blocked, or session start failed).
    #   None  -> pending / unconfirmed (fresh boot queued, or no preview attempt).
    # Rows before the 2026-07 semantic cutoff used the old over-optimistic
    # meaning, so an older "ready" is weaker evidence than a current one.
    if value is True:
        return "ready"
    if value is False:
        return "failed"
    return "pending"


def _short(value: Any, length: int = 36) -> str:
    text = "" if value is None else str(value)
    return text[:length]


def _recent_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    out = []
    for r in rows:
        out.append(
            {
                "Tid": _short(r.get("created_at"), 19),
                "Projekt": r.get("project_name") or "—",
                "Chatt": r.get("chat_title") or _short(r.get("chat_id"), 12),
                "v#": r.get("version_number"),
                "Stage": r.get("lifecycle_stage") or "—",
                "Scaffold": r.get("scaffold_id") or "—",
                "Model": r.get("model") or "—",
                "Intent": r.get("build_intent") or "—",
                "Preview": _preview_label(r.get("preview_success")),
                "Quality gate": r.get("quality_gate_result") or "—",
                "Deploy": r.get("deploy_result") or "—",
                "Retry": r.get("retry_count"),
                "Autofix": "ja" if r.get("autofix_applied") else "nej",
                "Preflight E/W": f"{r.get('preflight_error_count', 0)}/{r.get('preflight_warning_count', 0)}",
                "Blocking": _short(r.get("preview_blocking_reason"), 40) or "—",
                "Filer": r.get("file_count"),
                "chat_id": r.get("chat_id") or "",
            }
        )
    return pd.DataFrame(out)


def _render_chat_detail(ctx: BackofficeContext, chat_id: str) -> None:
    payload = _run_history(ctx.repo_root, [f"--chat={chat_id}"])
    if payload.get("error"):
        st.error(f"Kunde inte hämta chatt-detaljer: {payload['error']}")
        return

    chat = payload.get("chat") or {}
    if chat.get("missing"):
        st.warning(f"Hittade ingen chatt med id `{chat_id}`.")
        return

    st.markdown(
        f"**Projekt:** {chat.get('project_name') or '—'} · "
        f"**Chatt:** {chat.get('title') or '—'} · "
        f"`{chat.get('id', chat_id)}`"
    )

    versions = payload.get("versions") or []
    st.markdown(f"#### Versioner ({len(versions)})")
    if versions:
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "v#": v.get("version_number"),
                        "Stage": v.get("lifecycle_stage") or "—",
                        "Release": v.get("release_state") or "—",
                        "Verify": v.get("verification_state") or "—",
                        "Parent": _short(v.get("parent_version_id"), 12) or "—",
                        "Preview-URL": "ja" if v.get("preview_url") else "nej",
                        "Tid": _short(v.get("created_at"), 19),
                        "version_id": _short(v.get("id"), 16),
                    }
                    for v in versions
                ]
            ),
            hide_index=True,
            use_container_width=True,
        )
    else:
        st.caption("Inga versioner — chatten kan ha aborterat innan en version skapades.")

    telemetry = payload.get("telemetry") or []
    if telemetry:
        st.markdown(f"#### Telemetri per generering ({len(telemetry)})")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Tid": _short(t.get("created_at"), 19),
                        "Scaffold": t.get("scaffold_id") or "—",
                        "Model": t.get("model") or "—",
                        "Intent": t.get("build_intent") or "—",
                        "Preview": _preview_label(t.get("preview_success")),
                        "Quality gate": t.get("quality_gate_result") or "—",
                        "Deploy": t.get("deploy_result") or "—",
                        "Retry": t.get("retry_count"),
                        "Autofix": "ja" if t.get("autofix_applied") else "nej",
                        "Syntax-fixer": "ja" if t.get("syntax_fixer_used") else "nej",
                        "Preflight E/W": f"{t.get('preflight_error_count', 0)}/{t.get('preflight_warning_count', 0)}",
                        "Blocking": _short(t.get("preview_blocking_reason"), 40) or "—",
                    }
                    for t in telemetry
                ]
            ),
            hide_index=True,
            use_container_width=True,
        )

    error_logs = payload.get("errorLogs") or []
    st.markdown(f"#### Fel/warnings ({len(error_logs)})")
    if error_logs:
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Tid": _short(e.get("created_at"), 19),
                        "Level": e.get("level") or "—",
                        "Kategori": e.get("category") or "—",
                        "Version": _short(e.get("version_id"), 12),
                        "Meddelande": _short(e.get("message"), 120),
                    }
                    for e in error_logs
                ]
            ),
            hide_index=True,
            use_container_width=True,
        )
    else:
        st.caption("Inga fel-/warning-rader för den här chatten.")

    gen_logs = payload.get("generationLogs") or []
    if gen_logs:
        st.markdown(f"#### Generation-loggar ({len(gen_logs)})")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Tid": _short(g.get("created_at"), 19),
                        "Model": g.get("model") or "—",
                        "Prompt tokens": g.get("prompt_tokens"),
                        "Completion tokens": g.get("completion_tokens"),
                        "Duration ms": g.get("duration_ms"),
                        "Success": "ja" if g.get("success") else "nej",
                        "Fel": _short(g.get("error_message"), 80) or "—",
                    }
                    for g in gen_logs
                ]
            ),
            hide_index=True,
            use_container_width=True,
        )


def render(ctx: BackofficeContext) -> None:
    st.title("Generation History")
    st.caption(
        "Tidigare genereringar av användarsidor + vad varje steg gjorde "
        "(scaffold, model, retry/Normalize, preflight, RenderGate/ReleaseGate, preview-utfall). "
        "Read-only mot DB:n som `.env.local` pekar på. Källor: `generation_telemetry`, "
        "`engine_versions`, `engine_version_error_logs`, `engine_generation_logs`."
    )

    limit = st.number_input(
        "Antal senaste genereringar",
        min_value=10,
        max_value=500,
        value=50,
        step=10,
        help="Hur många rader (nyast först) som hämtas från generation_telemetry.",
    )

    with st.spinner("Hämtar genererings-historik ..."):
        payload = _run_history(ctx.repo_root, [f"--limit={int(limit)}"])

    if payload.get("error"):
        st.error(f"Kunde inte hämta data: {payload['error']}")
        st.caption(
            "Tips: kontrollera att `.env.local` har `POSTGRES_URL` (eller kör "
            "`npm run env:pull`) och att `node scripts/db/generation-history.mjs` kan köras lokalt."
        )
        return

    summary = payload.get("summary") or {}
    rows = payload.get("rows") or []
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Genereringar", summary.get("total", len(rows)))
    col2.metric("Preview ok", summary.get("success", "?"))
    col3.metric("Preview FAIL", summary.get("failed", "?"))
    col4.metric("Pending (ingen signal)", summary.get("pending", "?"))

    if not rows:
        st.info(
            "Ingen telemetri hittad. Antingen en färsk DB, eller så har inga "
            "genereringar körts ännu mot den DB som `.env.local` pekar på."
        )
        return

    st.subheader("Senaste genereringar")
    df = _recent_dataframe(rows)
    st.dataframe(df.drop(columns=["chat_id"]), hide_index=True, use_container_width=True)

    st.divider()
    st.subheader("Detaljer per chatt")
    options: dict[str, str] = {}
    for r in rows:
        cid = r.get("chat_id")
        if not cid or cid in options.values():
            continue
        label = (
            f"{r.get('project_name') or '—'} · "
            f"{r.get('chat_title') or _short(cid, 12)} · "
            f"{_short(r.get('created_at'), 19)}"
        )
        options[label] = cid

    if not options:
        st.caption("Inga chattar att visa detaljer för.")
        return

    selected_label = st.selectbox("Välj chatt", list(options.keys()), key="gen_history_chat_pick")
    if st.button("Visa detaljer", key="gen_history_chat_show"):
        st.session_state["gen_history_selected_chat"] = options[selected_label]

    selected_chat = st.session_state.get("gen_history_selected_chat")
    if selected_chat:
        st.divider()
        _render_chat_detail(ctx, selected_chat)
