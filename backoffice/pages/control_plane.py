"""Control Plane cockpit — read-only operator overview of the control-plane registries.

Renders `config/control-plane/schema-registry.json` and
`config/control-plane/policy-registry.json` as one combined operator view:
source of truth, validator, CI status, runtime enforcement (wired vs
declared-only), backoffice editability/danger, mobility and notes.

READ-ONLY by design (Backoffice 2.0 phase 1). This page never writes. Editing
happens on each owner surface — the registry `backoffice.writePath` / `surface`
fields point the operator there. Code stays source of truth; this view only
mirrors the registries.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext, read_json, render_where_panel

PAGE_NAME = "Control Plane (cockpit)"

REGISTRY_COLUMNS = [
    "id",
    "type",
    "sourceOfTruth",
    "validator",
    "ciStatus",
    "runtimeEnforced",
    "runtimeStatus",
    "backoffice.surface",
    "backoffice.editable",
    "backoffice.writePath",
    "backoffice.danger",
    "mobility",
    "notes",
]


def _format_runtime_status(value: str | None) -> str:
    raw = (value or "").strip()
    if raw == "declared-only":
        return "⚠️ declared-only — EJ wired till runtime"
    if raw == "wired":
        return "✅ wired"
    if raw in ("", "n/a"):
        return "n/a"
    return raw


def _entry_to_row(entry: dict[str, Any]) -> dict[str, Any]:
    backoffice = entry.get("backoffice") or {}
    return {
        "id": entry.get("id", "—"),
        "type": entry.get("type", "—"),
        "sourceOfTruth": entry.get("sourceOfTruth", "—"),
        "validator": entry.get("validator") or "—",
        "ciStatus": entry.get("ciStatus", "—"),
        "runtimeEnforced": bool(entry.get("runtimeEnforced", False)),
        "runtimeStatus": _format_runtime_status(entry.get("runtimeStatus")),
        "backoffice.surface": backoffice.get("surface") or "—",
        "backoffice.editable": bool(backoffice.get("editable", False)),
        "backoffice.writePath": backoffice.get("writePath") or "—",
        "backoffice.danger": backoffice.get("danger", "—"),
        "mobility": entry.get("mobility", "—"),
        "notes": entry.get("notes", ""),
    }


def _load_registry(path: Path) -> tuple[list[dict[str, Any]], str | None]:
    """Returns ``(entries, error)``. ``error`` is set when the file is missing
    or malformed, so the caller can render a warning instead of crashing."""
    if not path.is_file():
        return [], f"Saknar `{path.as_posix()}`."
    try:
        payload = read_json(path)
    except Exception as exc:  # pragma: no cover - defensive UI guard
        return [], f"Kunde inte läsa `{path.name}`: {exc}"
    entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return [], f"`{path.name}` saknar en `entries`-lista."
    return [e for e in entries if isinstance(e, dict)], None


def _apply_filters(
    entries: list[dict[str, Any]],
    type_pick: str,
    ci_pick: str,
    runtime_pick: str,
) -> list[dict[str, Any]]:
    filtered = entries
    if type_pick != "Alla":
        filtered = [e for e in filtered if str(e.get("type", "")) == type_pick]
    if ci_pick != "Alla":
        filtered = [e for e in filtered if str(e.get("ciStatus", "")) == ci_pick]
    if runtime_pick != "Alla":
        filtered = [e for e in filtered if str(e.get("runtimeStatus", "")) == runtime_pick]
    return filtered


def _count(entries: list[dict[str, Any]], key: str, value: Any) -> int:
    return sum(1 for e in entries if e.get(key) == value)


def _render_registry_table(
    title: str,
    entries: list[dict[str, Any]],
    error: str | None,
    type_pick: str,
    ci_pick: str,
    runtime_pick: str,
) -> None:
    st.subheader(title)
    if error:
        st.warning(error)
        return
    if not entries:
        st.info("Registret innehåller inga poster.")
        return
    filtered = _apply_filters(entries, type_pick, ci_pick, runtime_pick)
    st.caption(f"{len(filtered)} av {len(entries)} poster visas.")
    declared_only = _count(filtered, "runtimeStatus", "declared-only")
    if declared_only:
        st.warning(
            f"{declared_only} post(er) i urvalet är **declared-only** — deklarerade men "
            "EJ wired till runtime. Verifiera innan du litar på dem som körsanning."
        )
    rows = [_entry_to_row(e) for e in filtered]
    st.dataframe(
        rows,
        width="stretch",
        hide_index=True,
        column_order=REGISTRY_COLUMNS,
    )


def render(ctx: BackofficeContext) -> None:
    domain_map = (
        read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    )
    st.header("Control Plane — cockpit (read-only)")
    render_where_panel(PAGE_NAME, domain_map)

    st.caption(
        "Denna vy läser control-plane-registren "
        "(`config/control-plane/schema-registry.json` + `policy-registry.json`) och visar dem "
        "som en samlad operatörsöversikt. Den är **read-only**: ingen redigering sker här. "
        "Ändringar görs på respektive ägaryta — se kolumnerna `backoffice.surface` och "
        "`backoffice.writePath` för var varje post faktiskt redigeras. Kod är source of truth; "
        "panelen speglar bara registren."
    )

    cp_dir = ctx.config_dir / "control-plane"
    schema_entries, schema_err = _load_registry(cp_dir / "schema-registry.json")
    policy_entries, policy_err = _load_registry(cp_dir / "policy-registry.json")

    if schema_err and policy_err:
        st.warning(
            "Inga control-plane-register kunde läsas. Förväntade filer under "
            f"`{cp_dir.as_posix()}`."
        )
        st.caption(f"schema-registry: {schema_err}")
        st.caption(f"policy-registry: {policy_err}")
        return

    combined = schema_entries + policy_entries

    # ── Top metrics ──────────────────────────────────────────────────────
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric("Poster totalt", len(combined))
    with m2:
        st.metric("Schema-poster", len(schema_entries))
    with m3:
        st.metric("Policy-poster", len(policy_entries))
    with m4:
        st.metric(
            "runtimeEnforced",
            f"{_count(combined, 'runtimeEnforced', True)} / {_count(combined, 'runtimeEnforced', False)}",
            help="Antal med runtimeEnforced=true / false.",
        )

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("ciStatus: hard", _count(combined, "ciStatus", "hard"))
    with c2:
        st.metric("ciStatus: warn", _count(combined, "ciStatus", "warn"))
    with c3:
        st.metric("ciStatus: manual", _count(combined, "ciStatus", "manual"))
    with c4:
        st.metric("ciStatus: none", _count(combined, "ciStatus", "none"))

    d1, d2 = st.columns(2)
    with d1:
        editable = sum(
            1 for e in combined if (e.get("backoffice") or {}).get("editable")
        )
        st.metric("Redigerbara (backoffice.editable)", editable)
    with d2:
        st.metric(
            "declared-only (ej wired)",
            _count(combined, "runtimeStatus", "declared-only"),
            help="Poster som är deklarerade men inte wired till runtime.",
        )

    # ── Filters (apply to both tables) ───────────────────────────────────
    st.divider()
    type_values = sorted({str(e.get("type", "")) for e in combined if e.get("type")})
    ci_values = sorted({str(e.get("ciStatus", "")) for e in combined if e.get("ciStatus")})
    runtime_values = sorted(
        {str(e.get("runtimeStatus", "")) for e in combined if e.get("runtimeStatus")}
    )
    f1, f2, f3 = st.columns(3)
    with f1:
        type_pick = st.selectbox("type", ["Alla", *type_values], key="cp_filter_type")
    with f2:
        ci_pick = st.selectbox("ciStatus", ["Alla", *ci_values], key="cp_filter_ci")
    with f3:
        runtime_pick = st.selectbox(
            "runtimeStatus", ["Alla", *runtime_values], key="cp_filter_runtime"
        )

    st.caption(
        "Teckenförklaring: `⚠️ declared-only — EJ wired till runtime` = posten finns i "
        "registret men runtime läser/enforcar den inte ännu. `runtimeEnforced` och "
        "`backoffice.editable` visas som kryssrutor."
    )

    # ── Tables per registry ──────────────────────────────────────────────
    _render_registry_table(
        "Schema-register",
        schema_entries,
        schema_err,
        type_pick,
        ci_pick,
        runtime_pick,
    )
    _render_registry_table(
        "Policy-register",
        policy_entries,
        policy_err,
        type_pick,
        ci_pick,
        runtime_pick,
    )

    st.divider()
    st.caption(
        "Human-läsbar karta: `docs/architecture/schema-policy-map.md`. "
        "Strict-schema för registren själva: "
        "`docs/schemas/strict/control-plane-registry.schema.json`. "
        "CI-kontroll: `npm run control-plane:check`."
    )
