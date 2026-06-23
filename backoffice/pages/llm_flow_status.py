"""LLM-flöde status — backoffice-vy av den deterministiska LLM-flow-canvasen.

Läser JSON-sidecaren ``docs/canvases/llm-flow.canvas.json`` som
``scripts/canvas/build-llm-flow-canvas.mjs`` skriver tillsammans med
``.canvas.txt``-artefakten. Backoffice regenererar canvasen vid start
(``backoffice/app_main.py``); här finns även en manuell "Bygg om"-knapp.

Read-only: visar processer, status, faser och öppna huvudrisker. Samma
``buildData()``-payload driver Cursor-canvasen (``sync-to-cursor.mjs``) och
den fristående HTML-vyn (``npm run canvas:open``). Kod, ``domain-map.json``
och ``BUG-SWARM-BACKLOG.md`` är source of truth — panelen speglar dem.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext

_CANVAS_JSON_REL = "docs/canvases/llm-flow.canvas.json"
_BUILD_SCRIPT_REL = "scripts/canvas/build-llm-flow-canvas.mjs"
_TIMEOUT_S = 60


def build_canvas(repo_root: Path) -> dict[str, Any]:
    """Kör generatorn (node) som skriver om ``.txt`` + ``.json``. Mjuk felhantering."""
    script = repo_root / _BUILD_SCRIPT_REL
    if not script.exists():
        return {"ok": False, "error": f"Script saknas: {script}"}
    try:
        result = subprocess.run(
            ["node", str(script)],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timeout efter {_TIMEOUT_S}s"}
    except FileNotFoundError:
        return {"ok": False, "error": "`node` saknas på PATH"}
    if result.returncode != 0:
        return {"ok": False, "error": (result.stderr or "okänt fel").strip()}
    return {"ok": True, "stdout": (result.stdout or "").strip()}


def load_canvas(repo_root: Path) -> dict[str, Any] | None:
    """Läser JSON-sidecaren; ``None`` om den saknas eller inte parsar."""
    path = repo_root / _CANVAS_JSON_REL
    if not path.is_file():
        return None
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def render(ctx: BackofficeContext) -> None:
    st.title("LLM-flöde status")
    st.caption(
        "Deterministisk status över LLM-flödets processer (Klart / Pågår / Skakigt / "
        "Blockerat), genererad av `scripts/canvas/build-llm-flow-canvas.mjs` från "
        "`config/dashboard/domain-map.json`, `BUG-SWARM-BACKLOG.md`, eval-rapporten och "
        "git-churn. Backoffice regenererar vid start; samma data driver Cursor-canvasen."
    )

    if st.button("Bygg om nu", help="Kör generatorn och skriver om canvas .txt + .json"):
        with st.spinner("Genererar canvas ..."):
            res = build_canvas(ctx.repo_root)
        if res.get("ok"):
            st.success(res.get("stdout") or "Canvas regenererad.")
        else:
            st.warning(f"Kunde inte regenerera: {res.get('error')}")

    data = load_canvas(ctx.repo_root)
    if data is None:
        st.info(
            "Ingen canvas-data hittad ännu (`docs/canvases/llm-flow.canvas.json`). "
            "Klicka **Bygg om nu** ovan, eller kör "
            "`node scripts/canvas/build-llm-flow-canvas.mjs`."
        )
        return

    meta = data.get("meta") or {}
    totals = data.get("totals") or {}
    commit_date = f" ({meta.get('commitDate')})" if meta.get("commitDate") else ""
    st.caption(
        f"{meta.get('repo', '?')} · commit `{meta.get('commit', '?')}`{commit_date} · "
        f"churn-fönster {meta.get('sinceDays', '?')}d"
    )

    cols = st.columns(6)
    cols[0].metric("Processer", totals.get("processes", "?"))
    cols[1].metric("Blockerade", totals.get("blocked", "?"))
    cols[2].metric("Skakiga", totals.get("shaky", "?"))
    cols[3].metric("Öppna P0", totals.get("openP0", "?"))
    cols[4].metric("Öppna P1", totals.get("openP1", "?"))
    eval_pct = totals.get("evalExactHitPct")
    cols[5].metric("Eval exact-hit", "—" if eval_pct is None else f"{eval_pct}%")

    phases = data.get("phases") or []
    if phases:
        st.subheader("Faskedja")
        for i, phase in enumerate(phases, start=1):
            st.markdown(f"{i}. {phase}")

    processes = data.get("processes") or []
    if processes:
        st.subheader("Processer")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Process": p.get("name"),
                        "Status": p.get("statusLabel"),
                        "Öppna buggar": p.get("openBugs"),
                        "Churn": p.get("churn"),
                        "Not": p.get("note"),
                    }
                    for p in processes
                ]
            ),
            hide_index=True,
            use_container_width=True,
        )

    risks = data.get("topOpenRisks") or []
    if risks:
        st.subheader("Öppna huvudrisker (backlog)")
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Prio": r.get("prio"),
                        "Typ": "BLOCKER" if r.get("blocker") else "öppen",
                        "Fynd": r.get("fynd"),
                    }
                    for r in risks
                ]
            ),
            hide_index=True,
            use_container_width=True,
        )
        omitted = data.get("topOpenRisksOmitted") or 0
        if omitted:
            st.caption(
                f"+{omitted} fler lägre-prioriterade rader (se `BUG-SWARM-BACKLOG.md`)."
            )

    evals = data.get("evals")
    eval_rows = (evals or {}).get("rows") or []
    if evals and eval_rows:
        st.subheader("Eval-scorecard (scaffold-selection)")
        st.caption(
            f"exact-hit {evals.get('exactHitPct', '—')}% · "
            f"acceptable {evals.get('acceptableHitPct', '—')}% · "
            f"{evals.get('total') or len(eval_rows)} prompts · fel: {evals.get('errors', 0)}"
        )
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Prompt": r.get("id"),
                        "Träff": "ja" if r.get("ok") else "nej",
                        "Metod": r.get("method"),
                        "Confidence": r.get("confidence"),
                    }
                    for r in eval_rows
                ]
            ),
            hide_index=True,
            use_container_width=True,
        )

    st.divider()
    st.caption(
        "Cursor-rendering: `node scripts/canvas/sync-to-cursor.mjs` → öppna canvasen "
        "bredvid chatten. Fristående HTML: `npm run canvas:open`. Denna vy speglar samma "
        "`buildData()`-payload som båda."
    )
