"""
Fixer Registry — visualises the canonical FIXER_REGISTRY snapshot from
`src/lib/gen/autofix/fixer-registry.ts` (dumped to JSON by
`scripts/observability/dump-fixer-registry.mjs`).

Lets the user browse all ~40 fixers grouped by category + owner-phase, see
status badges, source paths, telemetry counters, and triggers — without
greping through 40+ TypeScript files. The view also checks whether the JSON
snapshot is stale compared with the TypeScript source and can regenerate it.
"""

from __future__ import annotations

import json
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext


SNAPSHOT_PATH_PARTS = ("data", "observability", "fixer-registry.snapshot.json")
FIXER_REGISTRY_SOURCE_PARTS = (
    "src",
    "lib",
    "gen",
    "autofix",
    "fixer-registry.ts",
)


def _snapshot_path(repo_root: Path) -> Path:
    return repo_root.joinpath(*SNAPSHOT_PATH_PARTS)


def _source_path(repo_root: Path) -> Path:
    return repo_root.joinpath(*FIXER_REGISTRY_SOURCE_PARTS)


def _format_mtime(path: Path) -> str:
    if not path.exists():
        return "—"
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
    except OSError:
        return "—"


def _is_snapshot_stale(repo_root: Path) -> tuple[bool, str | None]:
    snapshot_path = _snapshot_path(repo_root)
    source_path = _source_path(repo_root)
    if not snapshot_path.exists():
        return True, "snapshot-missing"
    if not source_path.exists():
        return False, "source-missing"

    try:
        if source_path.stat().st_mtime > snapshot_path.stat().st_mtime:
            return True, "source-newer"
    except OSError:
        return False, None

    return False, None


def _cap_output(text: str, limit: int = 400) -> str:
    stripped = text.strip()
    if len(stripped) <= limit:
        return stripped
    return f"{stripped[:limit]}..."


def _render_snapshot_status_panel(ctx: BackofficeContext) -> None:
    source_path = _source_path(ctx.repo_root)
    snapshot_path = _snapshot_path(ctx.repo_root)
    is_stale, reason = _is_snapshot_stale(ctx.repo_root)

    if is_stale and reason == "snapshot-missing":
        st.warning(
            "Ingen snapshot. Klicka **Regenerera snapshot** nedan eller kör "
            "`npm run fixers:dump`."
        )
    elif is_stale and reason == "source-newer":
        st.warning(
            "Snapshoten är äldre än `src/lib/gen/autofix/fixer-registry.ts`. "
            "Antalet fixers stämmer kanske inte med faktiskt körd kod. Klicka "
            "**Regenerera snapshot**."
        )
    elif reason == "source-missing":
        st.info(
            "Källfilen `src/lib/gen/autofix/fixer-registry.ts` hittades inte. "
            "Stale-check hoppades över."
        )

    if st.button(
        "Regenerera snapshot",
        type="primary",
        key="fixer_registry_regenerate",
    ):
        try:
            result = subprocess.run(
                ["node", "scripts/observability/dump-fixer-registry.mjs"],
                cwd=str(ctx.repo_root),
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        except FileNotFoundError:
            st.error(
                "Hittar inte `node` på PATH. Kör `npm run fixers:dump` i "
                "terminalen istället."
            )
        except subprocess.TimeoutExpired:
            st.error(
                "Regenerering tog längre än 120 sekunder. Kör `npm run "
                "fixers:dump` i terminalen och kontrollera output där."
            )
        except Exception as exc:
            st.error(f"Kunde inte regenerera snapshot: {_cap_output(str(exc))}")
        else:
            if result.returncode == 0:
                st.success("Snapshot regenererad. Laddar om vyn …")
                st.rerun()
            else:
                stderr = _cap_output(result.stderr or result.stdout or "Okänt fel.")
                st.error(f"Kunde inte regenerera snapshot:\n\n{stderr}")

    st.caption(
        f"Source: `{source_path}` · Snapshot: `{snapshot_path}` · "
        f"Source mtime: `{_format_mtime(source_path)}` · "
        f"Snapshot mtime: `{_format_mtime(snapshot_path)}`"
    )


def _load_snapshot(repo_root: Path) -> dict[str, Any] | None:
    p = _snapshot_path(repo_root)
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

LANE_COLORS = {
    "mechanical": "#2563eb",
    "static_gate": "#9a3412",
    "llm_repair": "#dc2626",
    "stream_suspense": "#0d9488",
    "post_merge": "#a16207",
    "server_repair": "#7c3aed",
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
        "`node scripts/observability/dump-fixer-registry.mjs`. "
        "Stale-status under: snapshoten flaggas röd om den är äldre än källfilen."
    )
    _render_snapshot_status_panel(ctx)
    snap = _load_snapshot(ctx.repo_root)
    if snap is None:
        # Status-panelen visar redan en `snapshot-missing`-varning + knapp;
        # här bryter vi bara render-flödet utan att duplicera varningen.
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
                    lane = str(entry.get("lane") or "unknown")
                    lane_badge = _badge(lane, LANE_COLORS.get(lane, "#525252"))
                    st.markdown(
                        f"**Phase:** `{entry.get('ownerPhase', '?')}` &nbsp;&nbsp; "
                        f"**Lane:** {lane_badge} &nbsp;&nbsp; "
                        f"**Status:** `{entry.get('status', 'unknown')}` &nbsp;&nbsp; "
                        f"**Source:** `{entry.get('sourcePath', '?')}`",
                        unsafe_allow_html=True,
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
                    "lane": e.get("lane"),
                    "phase": e.get("ownerPhase"),
                    "status": e.get("status"),
                    "targetFailureMode": e.get("targetFailureMode"),
                    "sourcePath": e.get("sourcePath"),
                    "telemetryCounter": e.get("telemetryCounter"),
                }
            )
        st.dataframe(rows, use_container_width=True, hide_index=True)
