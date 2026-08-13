"""
Fixer Registry — visualises the canonical FIXER_REGISTRY snapshot from
`src/lib/gen/autofix/fixer-registry.ts` (dumped to JSON by
`scripts/observability/dump-fixer-registry.mjs`).

Lets the user browse all ~40 fixers grouped by category + owner-phase, see
status badges, source paths, telemetry counters, and triggers — without
greping through 40+ TypeScript files. The view also checks whether the JSON
snapshot is stale compared with the TypeScript source and can regenerate it.

Usage stats (read-only) come from `scripts/observability/fault-matrix.mjs
--by-fixer --json` against `error_log_events`, joined onto the catalog by
fixer id. Catalog entries without events show 0; unknown fixer ids are drift.
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
from backoffice.subprocess_runners import resolve_node_command


SNAPSHOT_PATH_PARTS = ("data", "observability", "fixer-registry.snapshot.json")
FIXER_REGISTRY_SOURCE_PARTS = (
    "src",
    "lib",
    "gen",
    "autofix",
    "fixer-registry.ts",
)
FAULT_MATRIX_SCRIPT_PARTS = ("scripts", "observability", "fault-matrix.mjs")
MISSING_FIXER_LABEL = "(ingen fixer)"
_USAGE_TIMEOUT_S = 60
_USAGE_LIMIT = "200"
_USAGE_STATE_KEY = "fixer_registry_usage"


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


def _format_top_faults(raw: Any) -> str:
    if not isinstance(raw, list) or not raw:
        return "—"
    parts: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        fault = item.get("fault") or "?"
        parts.append(f"{fault}:{item.get('count', 0)}")
    return ", ".join(parts) if parts else "—"


def _format_seen(value: Any) -> str:
    if value is None or value == "":
        return "—"
    return str(value)


def _run_fixer_usage(repo_root: Path, *, use_prod: bool) -> dict[str, Any]:
    """Read-only `--by-fixer` aggregate via fault-matrix.mjs (SELECT only)."""
    script = repo_root.joinpath(*FAULT_MATRIX_SCRIPT_PARTS)
    if not script.exists():
        return {"ok": False, "error": "fault-matrix.mjs saknas."}
    node = resolve_node_command()
    if node is None:
        return {"ok": False, "error": "`node` saknas på PATH."}
    args = [*node, str(script), "--by-fixer", "--json", "--limit", _USAGE_LIMIT]
    if use_prod:
        args.append("--prod")
    try:
        result = subprocess.run(
            args,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_USAGE_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": f"Skriptet tog längre än {_USAGE_TIMEOUT_S} sekunder.",
        }
    except FileNotFoundError:
        return {"ok": False, "error": "`node` saknas på PATH."}
    except Exception as exc:
        return {"ok": False, "error": _cap_output(str(exc))}

    stdout = (result.stdout or "").strip()
    if not stdout:
        return {
            "ok": False,
            "error": _cap_output(result.stderr or "Tomt svar från skriptet."),
        }
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"Kunde inte tolka JSON: {exc}"}
    if not isinstance(data, dict):
        return {"ok": False, "error": "Oväntat svarsformat (förväntade objekt)."}
    if not data.get("ok"):
        return {
            "ok": False,
            "error": str(data.get("error") or result.stderr or "Okänt fel."),
        }
    return data


def _join_catalog_usage(
    entries: list[dict[str, Any]],
    usage_rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any] | None, list[dict[str, Any]]]:
    """Join catalog entries with `--by-fixer` rows.

    Returns (catalog_rows_with_counts, none_fixer_row, drift_rows).
    Catalog ids without events get 0. Unknown event fixer-ids are drift.
    """
    by_id: dict[str, dict[str, Any]] = {}
    for row in usage_rows:
        fid = str(row.get("fixer") or "")
        if fid:
            by_id[fid] = row
    catalog_ids = {str(e.get("id") or "") for e in entries if e.get("id")}

    joined: list[dict[str, Any]] = []
    for entry in entries:
        fid = str(entry.get("id") or "")
        usage = by_id.get(fid) or {}
        joined.append(
            {
                "id": fid,
                "kategori": entry.get("category"),
                "risk": entry.get("risk"),
                "status": entry.get("status"),
                "användningar": int(usage.get("total") or 0),
                "lyckades": int(usage.get("fixed") or 0),
                "misslyckades": int(usage.get("failed") or 0),
                "övriga": int(usage.get("other") or 0),
                "unika_chattar": int(usage.get("chats") or 0),
                "toppfel": _format_top_faults(usage.get("top_faults")),
                "först_sedd": _format_seen(usage.get("first_seen")),
                "senast_sedd": _format_seen(usage.get("last_seen")),
            }
        )
    joined.sort(key=lambda r: (-int(r["användningar"]), str(r["id"])))

    none_row = by_id.get(MISSING_FIXER_LABEL)
    drift = [
        row
        for fid, row in by_id.items()
        if fid not in catalog_ids and fid != MISSING_FIXER_LABEL
    ]
    drift.sort(key=lambda r: -int(r.get("total") or 0))
    return joined, none_row, drift


def _render_usage_section(ctx: BackofficeContext, entries: list[dict[str, Any]]) -> None:
    st.divider()
    st.subheader("Användning (error_log_events)")
    st.caption(
        "Read-only SELECT via `node scripts/observability/fault-matrix.mjs "
        "--by-fixer --json`. Katalogposter utan events visas som 0. "
        "Fixer-id i loggen som saknas i katalogen flaggas som drift. "
        "Hämta med knappen — sidan slår inte mot databasen av sig själv."
    )

    env_label = st.radio(
        "Databas",
        ("Dev (.env.local)", "Prod (.env.vercel.production.pulled)"),
        horizontal=True,
        key="fixer_registry_usage_env",
    )
    use_prod = env_label.startswith("Prod")

    if st.button("Hämta användningsstatistik", key="fixer_registry_usage_fetch"):
        st.session_state[_USAGE_STATE_KEY] = {
            "use_prod": use_prod,
            "env_label": env_label,
            "payload": _run_fixer_usage(ctx.repo_root, use_prod=use_prod),
        }

    state = st.session_state.get(_USAGE_STATE_KEY)
    if not isinstance(state, dict) or "payload" not in state:
        st.info("Ingen statistik hämtad ännu.")
        return

    payload = state.get("payload") or {}
    fetched_env = state.get("env_label") or ("Prod" if state.get("use_prod") else "Dev")
    # Bugbot på diffen: väljaren kan peka på en annan databas än den tabellen
    # hämtades från. Källan står redan i rubriken, men säg det rakt ut så
    # ingen läser prod-siffror som dev eller tvärtom.
    if state.get("use_prod") != use_prod:
        st.warning(
            f"Väljaren pekar på **{env_label}** men tabellen nedan visar "
            f"**{fetched_env}** — klicka «Hämta användningsstatistik» igen."
        )
    if not payload.get("ok"):
        st.error(payload.get("error") or "Kunde inte läsa användningsstatistik.")
        return
    if payload.get("tableMissing"):
        st.info("Tabellen `error_log_events` saknas i den valda databasen ännu.")
        return

    usage_rows = list(payload.get("fixers") or [])
    # Bugbot på diffen: joinen behandlar saknade nycklar som 0 användningar.
    # Om skript-limiten någonsin trunkerar (fler distinkta fixers än limit)
    # ska vyn säga det i stället för att visa falska nollor.
    distinct_in_log = int(payload.get("distinctFixers") or 0)
    if distinct_in_log > len(usage_rows):
        st.warning(
            f"Visar {len(usage_rows)} av {distinct_in_log} fixer-nycklar "
            f"(limit {_USAGE_LIMIT}) — 0-rader och drift-flaggor kan vara "
            "ofullständiga för resten."
        )
    joined, none_row, drift = _join_catalog_usage(entries, usage_rows)
    unused = sum(1 for row in joined if int(row["användningar"]) == 0)

    st.caption(
        f"Hämtat från **{fetched_env}** · {payload.get('totalRows', 0)} rader · "
        f"{payload.get('distinctFixers', 0)} distinkta fixer-nycklar i loggen · "
        f"{unused} katalog-fixers utan events."
    )

    metrics = st.columns(4)
    metrics[0].metric("Events", payload.get("totalRows", 0))
    metrics[1].metric("Fixers i loggen", payload.get("distinctFixers", 0))
    metrics[2].metric("Katalog utan events", unused)
    metrics[3].metric("Drift (okänt id)", len(drift))

    st.dataframe(joined, use_container_width=True, hide_index=True)

    if none_row:
        st.warning(
            f"{MISSING_FIXER_LABEL}: {int(none_row.get('total') or 0)} events "
            f"utan fixer-id "
            f"(lyckades={int(none_row.get('fixed') or 0)}, "
            f"misslyckades={int(none_row.get('failed') or 0)}, "
            f"övriga={int(none_row.get('other') or 0)}, "
            f"chattar={int(none_row.get('chats') or 0)}). "
            f"Toppfel: {_format_top_faults(none_row.get('top_faults'))}."
        )

    if drift:
        st.error(
            f"{len(drift)} fixer-id i `error_log_events` saknas i katalogen "
            "(drift — runtime emitterar ett id som inte finns i "
            "`FIXER_REGISTRY`)."
        )
        st.dataframe(
            [
                {
                    "fixer": row.get("fixer"),
                    "användningar": int(row.get("total") or 0),
                    "lyckades": int(row.get("fixed") or 0),
                    "misslyckades": int(row.get("failed") or 0),
                    "övriga": int(row.get("other") or 0),
                    "unika_chattar": int(row.get("chats") or 0),
                    "toppfel": _format_top_faults(row.get("top_faults")),
                    "först_sedd": _format_seen(row.get("first_seen")),
                    "senast_sedd": _format_seen(row.get("last_seen")),
                }
                for row in drift
            ],
            use_container_width=True,
            hide_index=True,
        )


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
        "Stale-status under: snapshoten flaggas röd om den är äldre än källfilen. "
        "Användningsstatistik (hur ofta, utfall) hämtas separat mot "
        "`error_log_events` via `--by-fixer`."
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
        _render_usage_section(ctx, entries)
        return

    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_phase: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_risk: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in entries:
        by_category[e.get("category", "?")].append(e)
        by_phase[e.get("ownerPhase", "?")].append(e)
        by_risk[e.get("risk", "?")].append(e)

    risk_cols = st.columns(2)
    risk_cols[0].metric("Safe fixers", len(by_risk.get("safe", [])))
    risk_cols[1].metric("Risky fixers", len(by_risk.get("risky", [])))

    tab_cat, tab_phase, tab_risk, tab_table = st.tabs(
        ["Per kategori", "Per fas", "Per risk", "Komplett tabell"]
    )

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
                        f"**Risk:** `{entry.get('risk', 'unknown')}` &nbsp;&nbsp; "
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

    with tab_risk:
        for risk in ["risky", "safe"]:
            st.markdown(f"### `{risk}` ({len(by_risk.get(risk, []))})")
            ids = [f"`{e['id']}`" for e in by_risk.get(risk, [])]
            st.markdown(", ".join(ids) if ids else "—")

    with tab_table:
        rows = []
        for e in entries:
            rows.append(
                {
                    "id": e.get("id"),
                    "category": e.get("category"),
                    "risk": e.get("risk"),
                    "lane": e.get("lane"),
                    "phase": e.get("ownerPhase"),
                    "status": e.get("status"),
                    "targetFailureMode": e.get("targetFailureMode"),
                    "sourcePath": e.get("sourcePath"),
                    "telemetryCounter": e.get("telemetryCounter"),
                }
            )
        st.dataframe(rows, use_container_width=True, hide_index=True)

    _render_usage_section(ctx, entries)
