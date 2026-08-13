"""Blocking Blob-index gate after scaffold/variant create.

Creating files is not enough: Auto-match reads scaffold embeddings and
variant-pick reads variant embeddings from Vercel Blob. A terminal hint is
easy to skip, so Backoffice must run the same ``--require-blob`` commands.
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext, run_repo_command
from backoffice.wizard_support import get_blob_read_write_token, get_openai_api_key

INDEX_PENDING_KEY = "scaffold_lifecycle_index_pending"
INDEX_RESULTS_KEY = "scaffold_lifecycle_index_results"


def indexing_steps(*, new_scaffold: bool, push_only: bool = False) -> list[dict[str, Any]]:
    """npm commands that publish match indexes to Blob. No design-pattern step.

    ``push_only`` is for delete: the local JSON is already pruned, so we only
    upload it. A full ``scaffolds:*-embeddings`` rebuild would demand OpenAI
    just to republish a smaller index.
    """

    if push_only:
        steps: list[dict[str, Any]] = []
        if new_scaffold:
            steps.append(
                {
                    "key": "push_scaffold",
                    "label": "Publicera scaffold-index",
                    "command": (
                        "npm",
                        "run",
                        "embeddings:push",
                        "--",
                        "--only=scaffold",
                    ),
                    "needs_api": False,
                    "needs_blob": True,
                    "help": (
                        "Laddar upp den lokala scaffold-embeddings-cachen till "
                        "Vercel Blob. Ingen OpenAI-nyckel — filen är redan rensad."
                    ),
                }
            )
        steps.append(
            {
                "key": "push_variant",
                "label": "Publicera variant-index",
                "command": (
                    "npm",
                    "run",
                    "embeddings:push",
                    "--",
                    "--only=variant",
                ),
                "needs_api": False,
                "needs_blob": True,
                "help": (
                    "Laddar upp den rensade variant-embeddings-cachen till "
                    "Vercel Blob. Ingen OpenAI-nyckel — prune har redan skrivit filen."
                ),
            }
        )
        return steps

    steps = []
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


def can_push_pruned_index(ctx: BackofficeContext, *, new_scaffold: bool) -> bool:
    """True when local caches exist so ``embeddings:push`` can publish a prune.

    Missing cache → push exits «nothing uploaded» and Auto-match keeps the
    deleted id in Blob. Callers must fall back to a full ``--require-blob``
    rebuild in that case.
    """
    variant_path = ctx.variants_dir / "_index" / "variant-embeddings.json"
    if not variant_path.is_file():
        return False
    if new_scaffold:
        path = getattr(ctx, "embeddings_json", None)
        if not isinstance(path, Path) or not path.is_file():
            return False
    return True


def indexing_complete(results: Mapping[str, Any], steps: list[dict[str, Any]]) -> bool:
    for step in steps:
        res = results.get(step["key"])
        if not isinstance(res, Mapping):
            return False
        if res.get("skipped") or not res.get("ok"):
            return False
    return bool(steps)


def queue_index_after_create(
    *,
    new_scaffold: bool,
    scaffold_id: str,
    push_only: bool = False,
) -> None:
    """Queue Blob-index after create/edit/delete. Merge with an unfinished gate.

    A later variant-create must not drop a pending scaffold-embeddings step —
    ``scaffolds:embeddings`` is the Auto-match vector, and variant indexing
    does not publish it. A rebuild pending must not be downgraded to push-only.
    """
    pending = st.session_state.get(INDEX_PENDING_KEY)
    prior_new = isinstance(pending, Mapping) and bool(pending.get("new_scaffold"))
    prior_push_only = isinstance(pending, Mapping) and bool(pending.get("push_only"))
    prior_id = ""
    if isinstance(pending, Mapping):
        prior_id = str(pending.get("scaffold_id") or "").strip()
    merged_new = prior_new or new_scaffold
    merged_push_only = (
        push_only if not isinstance(pending, Mapping) else prior_push_only and push_only
    )
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
        results.pop("push_scaffold", None)
    results.pop("embeddings", None)
    results.pop("push_variant", None)

    st.session_state[INDEX_PENDING_KEY] = {
        "new_scaffold": merged_new,
        "scaffold_id": display_id,
        "push_only": merged_push_only,
    }
    st.session_state[INDEX_RESULTS_KEY] = results


def render_index_gate(ctx: BackofficeContext) -> None:
    pending = st.session_state.get(INDEX_PENDING_KEY)
    if not isinstance(pending, Mapping):
        return

    new_scaffold = bool(pending.get("new_scaffold"))
    push_only = bool(pending.get("push_only"))
    scaffold_id = str(pending.get("scaffold_id") or "")
    steps = indexing_steps(new_scaffold=new_scaffold, push_only=push_only)
    has_key = bool(get_openai_api_key())
    has_blob = bool(get_blob_read_write_token())
    results: dict[str, Any] = st.session_state.setdefault(INDEX_RESULTS_KEY, {})
    complete = indexing_complete(results, steps)

    if not complete:
        st.warning(
            f"Worktreet och Vercel Blob är ur synk efter `{scaffold_id}`. "
            "Publicera matchningen med knapparna — Auto-match pekar fel tills Blob "
            "speglar filerna (saknad *eller* raderad post)."
        )
        if not has_key and any(step.get("needs_api") for step in steps):
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

    if complete:
        st.success(
            "Matchningsindexen är publicerade. Kör `npm run scaffolds:validate` "
            "innan commit."
        )
        if st.button("Dölj index-grinden", key="sl_index_dismiss"):
            st.session_state.pop(INDEX_PENDING_KEY, None)
            st.session_state.pop(INDEX_RESULTS_KEY, None)
            st.rerun()
