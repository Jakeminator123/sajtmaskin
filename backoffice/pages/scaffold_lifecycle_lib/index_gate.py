"""Blocking Blob-index gate after scaffold/variant create.

Creating files is not enough: Auto-match reads scaffold embeddings and
variant-pick reads variant embeddings from Vercel Blob. A terminal hint is
easy to skip, so Backoffice must run the same ``--require-blob`` commands.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext, run_repo_command
from backoffice.wizard_support import get_blob_read_write_token, get_openai_api_key

INDEX_PENDING_KEY = "scaffold_lifecycle_index_pending"
INDEX_RESULTS_KEY = "scaffold_lifecycle_index_results"


def indexing_steps(*, new_scaffold: bool) -> list[dict[str, Any]]:
    """npm commands that publish match indexes to Blob. No design-pattern step."""

    steps: list[dict[str, Any]] = []
    if new_scaffold:
        steps.append(
            {
                "key": "scaffold_embeddings",
                "label": "Indexera scaffold",
                "command": (
                    "npm",
                    "run",
                    "scaffolds:embeddings",
                    "--",
                    "--require-blob",
                ),
                "needs_api": True,
                "needs_blob": True,
                "help": (
                    "Bygger om scaffold-embeddings så Auto-match kan hitta den nya "
                    "scaffolden, och publicerar till Vercel Blob."
                ),
            }
        )
    steps.append(
        {
            "key": "embeddings",
            "label": "Indexera variant",
            "command": (
                "npm",
                "run",
                "scaffolds:variant-embeddings",
                "--",
                "--require-blob",
            ),
            "needs_api": True,
            "needs_blob": True,
            "help": (
                "Bygger om variant-embeddings så design-matchern kan välja "
                "varianten, och publicerar till Vercel Blob."
            ),
        }
    )
    return steps


def indexing_complete(results: Mapping[str, Any], steps: list[dict[str, Any]]) -> bool:
    for step in steps:
        res = results.get(step["key"])
        if not isinstance(res, Mapping):
            return False
        if res.get("skipped") or not res.get("ok"):
            return False
    return bool(steps)


def queue_index_after_create(*, new_scaffold: bool, scaffold_id: str) -> None:
    """Queue Blob-index after create/edit. Merge with an unfinished gate.

    A later variant-create must not drop a pending scaffold-embeddings step —
    ``scaffolds:embeddings`` is the Auto-match vector, and variant indexing
    does not publish it.
    """
    pending = st.session_state.get(INDEX_PENDING_KEY)
    prior_new = isinstance(pending, Mapping) and bool(pending.get("new_scaffold"))
    prior_id = ""
    if isinstance(pending, Mapping):
        prior_id = str(pending.get("scaffold_id") or "").strip()
    merged_new = prior_new or new_scaffold
    ids = [part for part in prior_id.split(", ") if part]
    if scaffold_id and scaffold_id not in ids:
        ids.append(scaffold_id)
    display_id = ", ".join(ids) if ids else scaffold_id

    results = st.session_state.get(INDEX_RESULTS_KEY)
    if not isinstance(results, dict):
        results = {}
    else:
        results = dict(results)
    if new_scaffold:
        results.pop("scaffold_embeddings", None)
    results.pop("embeddings", None)

    st.session_state[INDEX_PENDING_KEY] = {
        "new_scaffold": merged_new,
        "scaffold_id": display_id,
    }
    st.session_state[INDEX_RESULTS_KEY] = results


def render_index_gate(ctx: BackofficeContext) -> None:
    pending = st.session_state.get(INDEX_PENDING_KEY)
    if not isinstance(pending, Mapping):
        return

    new_scaffold = bool(pending.get("new_scaffold"))
    scaffold_id = str(pending.get("scaffold_id") or "")
    steps = indexing_steps(new_scaffold=new_scaffold)
    has_key = bool(get_openai_api_key())
    has_blob = bool(get_blob_read_write_token())
    results: dict[str, Any] = st.session_state.setdefault(INDEX_RESULTS_KEY, {})

    st.warning(
        f"Scaffold `{scaffold_id}` är skriven i worktreet men **inte redo för master** "
        "förrän matchningen är publicerad till Vercel Blob. Hoppa inte över det här — "
        "Auto-match pekar fel tills indexet innehåller den nya posten."
    )
    if not has_key:
        st.error("OPENAI_API_KEY saknas — indexeringen kan inte köras.")
    if not has_blob:
        st.error(
            "BLOB_READ_WRITE_TOKEN saknas — lokal cache räknas inte. "
            "Index-knapparna är avstängda."
        )

    def _disabled(step: dict[str, Any]) -> bool:
        return bool(
            (step.get("needs_api") and not has_key)
            or (step.get("needs_blob") and not has_blob)
        )

    def _run(step: dict[str, Any]) -> None:
        with st.spinner(f"Kör: {step['label']} …"):
            results[step["key"]] = run_repo_command(ctx.repo_root, step["command"])
        st.session_state[INDEX_RESULTS_KEY] = results

    cols = st.columns(len(steps) + 1)
    for step, col in zip(steps, cols):
        with col:
            if st.button(
                step["label"],
                key=f"sl_index_{step['key']}",
                disabled=_disabled(step),
                help=step["help"],
            ):
                _run(step)
                st.rerun()
    with cols[-1]:
        if st.button(
            "Kör all indexering",
            type="primary",
            key="sl_index_all",
            disabled=any(_disabled(step) for step in steps),
        ):
            for step in steps:
                _run(step)
                if not results.get(step["key"], {}).get("ok"):
                    break
            st.rerun()

    for step in steps:
        res = results.get(step["key"])
        if not isinstance(res, Mapping):
            st.caption(f"• {step['label']}: inte kört.")
            continue
        if res.get("ok"):
            st.success(f"{step['label']} publicerad till Blob.")
        else:
            error = res.get("error") or res.get("stderrTail") or "okänt fel"
            st.error(f"{step['label']} misslyckades: {error}")

    if indexing_complete(results, steps):
        st.success(
            "Matchningsindexen är publicerade. Kör `npm run scaffolds:validate` "
            "innan commit."
        )
        if st.button("Dölj index-grinden", key="sl_index_dismiss"):
            st.session_state.pop(INDEX_PENDING_KEY, None)
            st.session_state.pop(INDEX_RESULTS_KEY, None)
            st.rerun()
