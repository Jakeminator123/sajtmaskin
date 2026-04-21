"""
Fixer Registry — visualises the canonical FIXER_REGISTRY snapshot from
`src/lib/gen/autofix/fixer-registry.ts` (dumped to JSON by
`scripts/observability/dump-fixer-registry.mjs`).

Lets the user browse all ~40 fixers grouped by category + owner-phase, see
status badges, source paths, telemetry counters, and triggers — without
greping through 40+ TypeScript files.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext


SNAPSHOT_PATH_PARTS = ("data", "observability", "fixer-registry.snapshot.json")


def _load_snapshot(repo_root: Path) -> dict[str, Any] | None:
    p = repo_root.joinpath(*SNAPSHOT_PATH_PARTS)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


CATEGORY_COLORS = {
    "mechanical-import": "#2563eb",
    "mechanical-syntax": "#0891b2",
    "mechanical-jsx": "#0d9488",
    "mechanical-shadcn": "#16a34a",
    "mechanical-r3f": "#65a30d",
    "mechanical-tailwind": "#65a30d",
    "mechanical-meta": "#9333ea",
    "mechanical-next-config": "#a16207",
    "mechanical-misc": "#525252",
    "validator-syntax": "#9a3412",
    "validator-jsx": "#9a3412",
    "validator-dep": "#9a3412",
    "llm-syntax": "#dc2626",
    "llm-verifier": "#dc2626",
    "llm-partial-file": "#dc2626",
    "llm-server-repair": "#dc2626",
    "verifier-pass": "#7c3aed",
}


def _badge(label: str, color: str) -> str:
    return (
        f'<span style="display:inline-block;padding:2px 6px;border-radius:4px;'
        f'background:{color};color:white;font-size:0.75rem;margin-right:4px;">{label}</span>'
    )


def render(ctx: BackofficeContext) -> None:
    st.header("Fixer Registry")
    st.caption(
        "Single source of truth: `src/lib/gen/autofix/fixer-registry.ts`. "
        "Den här vyn läser snapshot:en `data/observability/fixer-registry.snapshot.json` "
        "som regenereras vid `npm run dev|build|start`. Manuell uppdatering: "
        "`node scripts/observability/dump-fixer-registry.mjs`."
    )
    snap = _load_snapshot(ctx.repo_root)
    if snap is None:
        st.warning(
            "Ingen snapshot hittad. Kör:\n\n"
            "    node scripts/observability/dump-fixer-registry.mjs"
        )
        return

    entries: list[dict[str, Any]] = snap.get("entries", []) or []
    st.metric("Totalt antal fixers", len(entries))
    st.caption(f"Genererad: `{snap.get('generatedAt', '?')}`")

    if not entries:
        st.info("Snapshot är tom.")
        return

    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_phase: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in entries:
        by_category[e.get("category", "?")].append(e)
        by_phase[e.get("ownerPhase", "?")].append(e)

    tab_cat, tab_phase, tab_table = st.tabs(["Per kategori", "Per fas", "Komplett tabell"])

    with tab_cat:
        for category in sorted(by_category):
            color = CATEGORY_COLORS.get(category, "#525252")
            st.markdown(
                f"### {_badge(category, color)} ({len(by_category[category])})",
                unsafe_allow_html=True,
            )
            for entry in by_category[category]:
                with st.expander(f"`{entry['id']}` — {entry['targetFailureMode']}"):
                    st.markdown(
                        f"**Phase:** `{entry.get('ownerPhase', '?')}` &nbsp;&nbsp; "
                        f"**Status:** `{entry.get('status', 'unknown')}` &nbsp;&nbsp; "
                        f"**Source:** `{entry.get('sourcePath', '?')}`"
                    )
                    triggers = entry.get("triggers") or []
                    if triggers:
                        st.markdown("**Triggers:**")
                        for t in triggers:
                            st.markdown(f"- {t}")
                    counter = entry.get("telemetryCounter")
                    if counter:
                        st.markdown(f"**Telemetry:** `{counter}`")
                    notes = entry.get("notes")
                    if notes:
                        st.caption(notes)

    with tab_phase:
        for phase in sorted(by_phase):
            st.markdown(f"### `{phase}` ({len(by_phase[phase])})")
            ids = [f"`{e['id']}`" for e in by_phase[phase]]
            st.markdown(", ".join(ids))

    with tab_table:
        rows = []
        for e in entries:
            rows.append(
                {
                    "id": e.get("id"),
                    "category": e.get("category"),
                    "phase": e.get("ownerPhase"),
                    "status": e.get("status"),
                    "targetFailureMode": e.get("targetFailureMode"),
                    "sourcePath": e.get("sourcePath"),
                    "telemetryCounter": e.get("telemetryCounter"),
                }
            )
        st.dataframe(rows, use_container_width=True, hide_index=True)
