"""
Backoffice page: Dossiers (capability-driven, v2 layout).

Reads the new minimal layout:
    data/dossiers/hard/<id>/manifest.json
    data/dossiers/soft/<id>/manifest.json
    data/dossiers/_index/capability-map.json

Lets you:
- Browse all dossiers (hard + soft) with the 4-field summary, optionally
  grouped per dossier-grupp (kategori).
- Edit a manifest in-place (text area, validates JSON before save).
- Delete a dossier from the live pool (dossier-rules checklist + explicit
  id confirmation).
- Trigger an AI-curation run from a template-references repo (single dossier
  at a time, not batch), optionally within a chosen kategori/capability.
- Rebuild capability-map.json (incl. the groups view) via the canonical TS
  script.

Source-of-truth for the format: docs/contracts/dossier-system.md
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DOSSIER_ROOT = REPO_ROOT / "data" / "dossiers"
HARD_ROOT = DOSSIER_ROOT / "hard"
SOFT_ROOT = DOSSIER_ROOT / "soft"
INDEX_ROOT = DOSSIER_ROOT / "_index"
CAPABILITY_MAP_PATH = INDEX_ROOT / "capability-map.json"
STRICT_SCHEMA_PATH = REPO_ROOT / "docs" / "schemas" / "strict" / "dossier.schema.json"
TEMPLATE_REFS_ROOT = REPO_ROOT / "data" / "template-references" / "repos"
CAPABILITY_TIERS_PATH = (
    REPO_ROOT / "src" / "lib" / "builder" / "follow-up-capability-detection.ts"
)

REQUIRED_FIELDS = ("id", "label", "capability", "codeFidelity", "complexity", "summary", "lastVerified")


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _list_dossier_dirs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(d for d in root.iterdir() if d.is_dir() and not d.name.startswith("_"))


def _walk_all_dossiers() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for klass, root in (("hard", HARD_ROOT), ("soft", SOFT_ROOT)):
        for d in _list_dossier_dirs(root):
            manifest = _load_json(d / "manifest.json")
            if not manifest:
                continue
            manifest["_class"] = klass
            manifest["_path"] = str(d.relative_to(REPO_ROOT))
            out.append(manifest)
    return out


_ALLOWED_ENFORCEMENT = {"build", "feature-runtime", "warn-only"}


def _validate_manifest(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for f in REQUIRED_FIELDS:
        if f not in data:
            errors.append(f"missing required field: {f}")
    if "codeFidelity" in data and data["codeFidelity"] not in ("verbatim", "rewritable"):
        errors.append("codeFidelity must be 'verbatim' or 'rewritable'")
    if "complexity" in data and data["complexity"] not in ("simple", "medium", "advanced"):
        errors.append("complexity must be 'simple' | 'medium' | 'advanced'")
    if "id" in data and not isinstance(data["id"], str):
        errors.append("id must be a string")
    # P31: per-envVar `enforcement` is optional but, when present, must be one
    # of the three documented values. Defaults to "build" downstream.
    env_vars = data.get("envVars") or []
    if isinstance(env_vars, list):
        for idx, ev in enumerate(env_vars):
            if not isinstance(ev, dict):
                continue
            enforcement = ev.get("enforcement")
            if enforcement is None:
                continue
            if enforcement not in _ALLOWED_ENFORCEMENT:
                errors.append(
                    f"envVars[{idx}].enforcement must be one of "
                    f"{sorted(_ALLOWED_ENFORCEMENT)} (got {enforcement!r})"
                )
    return errors


def _summarize_enforcement(data: dict[str, Any]) -> str:
    """Compact `Bx Fy Wz` (build / feature-runtime / warn-only) tag for the
    listing view so curators can spot suspicious enforcement profiles at a
    glance without opening each manifest."""
    counts = {"build": 0, "feature-runtime": 0, "warn-only": 0}
    env_vars = data.get("envVars") or []
    if not isinstance(env_vars, list):
        return ""
    for ev in env_vars:
        if not isinstance(ev, dict):
            continue
        tag = ev.get("enforcement", "build")
        if tag in counts:
            counts[tag] += 1
        else:
            counts["build"] += 1
    parts = []
    if counts["build"]:
        parts.append(f"B{counts['build']}")
    if counts["feature-runtime"]:
        parts.append(f"F{counts['feature-runtime']}")
    if counts["warn-only"]:
        parts.append(f"W{counts['warn-only']}")
    return " ".join(parts)


def _load_group_view() -> dict[str, Any]:
    """Read the generated dossier-grupp (kategori) view from
    `capability-map.json`'s `groups` field. Never a hand-written Python copy
    of the capability→group mapping — the canonical source is
    `src/lib/builder/dossier-groups.ts` (`DOSSIER_GROUP_ORDER` /
    `resolveDossierGroup`), rendered into this view by
    `scripts/dossiers/regenerate-capability-map.ts`. Returns `{}` when the
    map hasn't been regenerated since this view was added (fallback callers
    should fall back to "Övrigt" and prompt a "Bygg om")."""
    data = _load_json(CAPABILITY_MAP_PATH) or {}
    groups = data.get("groups")
    return groups if isinstance(groups, dict) else {}


def _group_label_for_capability(capability: str | None, groups: dict[str, Any]) -> str:
    """Look up a capability's Swedish dossier-grupp label in the generated
    `groups` view. Falls back to "Övrigt" for a capability that isn't listed
    under any group yet (e.g. a brand-new capability before the next
    'Bygg om'). Case-insensitive + trimmed, mirroring `resolveDossierGroup`."""
    key = (capability or "").strip().lower()
    if key:
        for info in groups.values():
            listed = [str(c).strip().lower() for c in (info.get("capabilities") or [])]
            if key in listed:
                return info.get("label") or "Övrigt"
    return "Övrigt"


def _groups_view_is_stale(groups: dict[str, Any], dossiers: list[dict[str, Any]]) -> bool:
    """True when the generated `groups` view no longer covers the live pool's
    capability set (e.g. a new capability added since the last 'Bygg om').
    Python cannot recompute the TS group mapping, but it CAN detect coverage
    drift — label/bucket drift inside `dossier-groups.ts` is caught by the TS
    check (`regenerate-capability-map.ts` check-mode) instead."""
    if not groups:
        return True
    covered: set[str] = set()
    for info in groups.values():
        for cap in info.get("capabilities") or []:
            covered.add(str(cap).strip().lower())
    live = {str(d.get("capability") or "").strip().lower() for d in dossiers if d.get("capability")}
    return not live.issubset(covered)


def _run_capability_map_write() -> tuple[bool, str]:
    """Regenerate capability-map.json via the canonical TS script
    (`npm run dossiers:capability-map:write` → `regenerate-capability-map.ts`)
    instead of duplicating the capability→group mapping in Python. Keeps the
    `groups` view in lockstep with `src/lib/builder/dossier-groups.ts`."""
    try:
        result = subprocess.run(
            [_npm_binary(), "run", "dossiers:capability-map:write"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
        out = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, out
    except subprocess.TimeoutExpired:
        return False, (
            "Regenereringen tog mer än 120s — kör "
            "`npm run dossiers:capability-map:write` från terminalen istället."
        )
    except FileNotFoundError as exc:
        return False, f"Saknar binär (npm): {exc}"


def _rebuild_capability_map(dossiers: list[dict[str, Any]]) -> dict[str, Any]:
    """DRIFT-PREVIEW ONLY — computes the expected `capabilities` field so the
    Capability map tab can warn when the file is stale. It is NEVER written to
    disk anymore: 'Bygg om' shells out to the canonical TS script
    (`npm run dossiers:capability-map:write`), which also derives the `groups`
    view from `dossier-groups.ts` — something Python deliberately cannot do."""
    by_cap: dict[str, list[str]] = {}
    for d in dossiers:
        cap = d.get("capability") or "uncategorized"
        by_cap.setdefault(cap, []).append(d["id"])
    for cap in by_cap:
        by_cap[cap].sort()
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "capabilities": dict(sorted(by_cap.items())),
    }


def _extract_ts_union_values(path: Path, type_name: str) -> list[str]:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    pattern = rf"type\s+{re.escape(type_name)}\s*=\s*([^;]+);"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return []
    values: list[str] = []
    for token in match.group(1).split("|"):
        value = token.strip().strip('"').strip("'")
        if value:
            values.append(value)
    return values


def _section_overview(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Översikt")
    hard = [d for d in dossiers if d["_class"] == "hard"]
    soft = [d for d in dossiers if d["_class"] == "soft"]
    cols = st.columns(4)
    cols[0].metric("Totalt", len(dossiers))
    cols[1].metric("Hard", len(hard))
    cols[2].metric("Soft", len(soft))
    caps = {d.get("capability", "?") for d in dossiers}
    cols[3].metric("Capabilities", len(caps))


def _section_list(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Alla dossiers")
    if not dossiers:
        st.info("Inga dossiers ännu. Skapa en under `data/dossiers/hard/` eller `soft/`, eller använd AI-kurations-tabben nedan.")
        return
    rows: list[dict[str, Any]] = []
    for d in dossiers:
        rows.append({
            "id": d.get("id"),
            "class": d["_class"],
            "capability": d.get("capability"),
            "codeFidelity": d.get("codeFidelity"),
            "complexity": d.get("complexity"),
            "default": "✓" if d.get("defaultForCapability") else "",
            "envVars": len(d.get("envVars") or []),
            # B = build, F = feature-runtime, W = warn-only enforcement counts.
            "enforcement": _summarize_enforcement(d),
            "deps": len(d.get("dependencies") or []),
            "files": len(d.get("files") or []),
            "lastVerified": d.get("lastVerified"),
        })

    caption = (
        "Enforcement-kolumn: B=build (blockerar F3), F=feature-runtime "
        "(UI-banner / popup vid runtime), W=warn-only (komponent self-disablar). "
        "Saknat tag på en envVar tolkas som B."
    )

    groups = _load_group_view()
    grouped_view = st.checkbox(
        "Visa grupperad per dossier-grupp (kategori)",
        key="dossier_list_grouped",
        help=(
            "Grupperar listan efter dossier-grupp — läst från "
            "capability-map.json:s genererade `groups`-fält (kanonisk källa: "
            "src/lib/builder/dossier-groups.ts). Kör 'Bygg om' i "
            "Capability map-fliken om grupperna saknas/är inaktuella."
        ),
    )
    if grouped_view and not groups:
        st.warning(
            "`capability-map.json` saknar `groups`-fältet ännu — kör 'Bygg om' "
            "i Capability map-fliken (eller `npm run dossiers:capability-map:write`) "
            "för att aktivera gruppvyn."
        )
        grouped_view = False
    elif grouped_view and _groups_view_is_stale(groups, dossiers):
        st.warning(
            "`groups`-vyn täcker inte alla capabilities i live-poolen (inaktuell) "
            "— rader kan hamna under Övrigt. Kör 'Bygg om' i Capability map-fliken."
        )

    if not grouped_view:
        rows.sort(key=lambda r: (r["class"], r["capability"] or "", r["id"]))
        st.dataframe(rows, width="stretch", hide_index=True)
        st.caption(caption)
        return

    rows_by_label: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        label = _group_label_for_capability(row["capability"], groups)
        rows_by_label.setdefault(label, []).append(row)

    ordered_labels = [info.get("label") or "Övrigt" for info in groups.values()]
    for label in ordered_labels:
        group_rows = rows_by_label.pop(label, None)
        if not group_rows:
            continue
        group_rows.sort(key=lambda r: (r["capability"] or "", r["class"], r["id"]))
        st.markdown(f"**{label}** ({len(group_rows)})")
        st.dataframe(group_rows, width="stretch", hide_index=True)
    # Safety net: any label not present in the generated view (should not
    # happen once regenerated, but never silently drop rows).
    for label, group_rows in rows_by_label.items():
        group_rows.sort(key=lambda r: (r["capability"] or "", r["class"], r["id"]))
        st.markdown(f"**{label}** ({len(group_rows)})")
        st.dataframe(group_rows, width="stretch", hide_index=True)

    st.caption(caption)


def _section_edit(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Redigera manifest")
    if not dossiers:
        return
    options = {f"{d['_class']}/{d['id']}": d for d in dossiers}
    pick_key = st.selectbox("Välj dossier", list(options.keys()))
    if not pick_key:
        return
    chosen = options[pick_key]
    manifest_path = REPO_ROOT / chosen["_path"] / "manifest.json"
    raw = manifest_path.read_text(encoding="utf-8")
    edited = st.text_area("manifest.json", value=raw, height=400, key=f"edit_{pick_key}")
    if st.button("Spara", type="primary", key=f"save_{pick_key}"):
        try:
            parsed = json.loads(edited)
        except json.JSONDecodeError as exc:
            st.error(f"Ogiltig JSON: {exc}")
            return
        errors = _validate_manifest(parsed)
        if errors:
            st.error("Validering misslyckades:\n" + "\n".join(f"- {e}" for e in errors))
            return
        manifest_path.write_text(json.dumps(parsed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        st.success(f"Sparat {manifest_path.relative_to(REPO_ROOT)}")
        st.cache_data.clear()


def _delete_dossier_dir(chosen: dict[str, Any]) -> tuple[bool, str]:
    """Guarded deletion of a dossier directory from the live pool. Pure
    (no Streamlit) so the destructive path is unit-testable. Deletes the
    ACTUAL walked directory (`_path` from `_walk_all_dossiers`) — never a
    path reconstructed from `manifest.id`, which could diverge from the
    directory name and hit the wrong sibling. Guards: kebab-case id,
    containment under data/dossiers/<class>/, symlink refusal."""
    target_id = str(chosen.get("id") or "")
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", target_id):
        return False, f"Ogiltigt dossier-id: {target_id!r} — inget raderades."
    rel_path = str(chosen.get("_path") or "")
    if not rel_path:
        return False, "Saknar katalogsökväg för dossiern — inget raderades."
    # Symlink check MUST run on the unresolved path — `resolve()` follows the
    # link, so checking afterwards always says False and rmtree would hit the
    # link TARGET (Bugbot high on #500).
    raw_dir = REPO_ROOT / rel_path
    if raw_dir.is_symlink():
        return False, f"`{rel_path}` är en symlink — raderas manuellt, inte härifrån."
    target_dir = raw_dir.resolve()
    klass_root = (DOSSIER_ROOT / str(chosen.get("_class") or "")).resolve()
    if klass_root not in target_dir.parents:
        return False, f"Sökvägen ligger utanför dossier-poolen: `{rel_path}` — inget raderades."
    if not target_dir.exists():
        return False, f"Katalogen finns inte längre: `{rel_path}`."
    shutil.rmtree(target_dir)
    return True, (
        f"Raderade `{rel_path}`.\n\n"
        "Nästa steg: bygg om capability-map (Capability map-fliken) och kör "
        "`npm run dossiers:validate-all`. Ångra: `git checkout -- <sökvägen>` "
        "funkar bara för dossiers som redan är incheckade — en ny, ocommittad "
        "dossier (t.ex. ett färskt AI-utkast) kan INTE återställas via git."
    )


def _section_delete(dossiers: list[dict[str, Any]]) -> None:
    """Radera en dossier ur live-poolen med checklistan från
    `.cursor/rules/dossier-rules.mdc` (capability, defaultForCapability,
    envVars, dependencies, capability-map) renderad som konkret läges-info
    för just den valda dossiern. Kräver kryssad checklista + exakt
    id-bekräftelse."""
    st.divider()
    st.subheader("Radera dossier")
    if not dossiers:
        return
    options = {f"{d['_class']}/{d['id']}": d for d in dossiers}
    pick_key = st.selectbox("Välj dossier att radera", list(options.keys()), key="delete_pick")
    if not pick_key:
        return
    chosen = options[pick_key]
    capability = chosen.get("capability") or ""
    siblings = [
        d
        for d in dossiers
        if d.get("capability") == capability and d.get("id") != chosen.get("id")
    ]
    env_keys = [
        str(ev.get("key")) for ev in (chosen.get("envVars") or []) if isinstance(ev, dict)
    ]
    deps = [str(dep) for dep in (chosen.get("dependencies") or [])]

    if siblings:
        cap_line = (
            f"{len(siblings)} syskon-dossier(s) kvar under `{capability}`: "
            + ", ".join(sorted(str(d.get("id")) for d in siblings))
            + "."
        )
    else:
        cap_line = (
            f"detta är ENDA dossiern under `{capability}` — capabilityn försvinner "
            "ur poolen; kontrollera referenser (brief-prompt, follow-up-vokabulär, "
            "capability-inference)."
        )
    if chosen.get("defaultForCapability") and siblings:
        default_line = (
            "denna är capabilityns **default** — flagga ett syskon som ny default, "
            "annars stoppar `dossiers:validate-all` (mock-fallback-invarianten "
            "kräver en upplösbar default)."
        )
    elif chosen.get("defaultForCapability"):
        default_line = "denna är default, men hela capabilityn försvinner med den."
    else:
        default_line = "ingen default-flytt behövs (dossiern är inte default)."

    st.markdown(
        "**Checklista före radering** (per `dossier-rules.mdc`):\n"
        f"- **capability**: {cap_line}\n"
        f"- **defaultForCapability**: {default_line}\n"
        f"- **envVars**: {', '.join(env_keys) if env_keys else 'inga'} — städa ev. lagrade projekt-env/placeholder-flöden.\n"
        f"- **dependencies**: {', '.join(deps) if deps else 'inga'}.\n"
        "- **capability-map**: bygg om efter radering (Capability map-fliken) och kör `npm run dossiers:validate-all`."
    )

    ack = st.checkbox("Jag har gått igenom checklistan ovan", key="delete_ack")
    confirm = st.text_input(
        f"Skriv dossierns id (`{chosen.get('id')}`) för att bekräfta",
        key="delete_confirm",
    ).strip()
    if st.button(
        "Radera från live-poolen",
        type="primary",
        key="delete_button",
        disabled=not ack,
    ):
        target_id = str(chosen.get("id") or "")
        if confirm != target_id:
            st.error("Bekräftelsen matchar inte dossierns id — inget raderades.")
            return
        ok, msg = _delete_dossier_dir(chosen)
        (st.success if ok else st.error)(msg)
        if ok:
            # Drop the widget state that points at the now-deleted dossier —
            # otherwise the next rerun's selectbox/text_input restore a value
            # that no longer exists in options (StreamlitAPIException).
            for state_key in ("delete_pick", "delete_ack", "delete_confirm"):
                st.session_state.pop(state_key, None)
            st.cache_data.clear()


def _section_enforcement_overview(dossiers: list[dict[str, Any]]) -> None:
    """Per-envVar enforcement overview so curators can spot dossiers that
    over-use `feature-runtime` (UI must actually render a banner) or
    `warn-only` (component must actually self-disable). The F3 readiness
    gate trusts these tags — getting them wrong either blocks deploy or
    lets a deploy succeed with broken integrations."""
    st.subheader("EnvVar enforcement (P31)")
    st.caption(
        "`build` = real value krävs vid F3-build. "
        "`feature-runtime` = SDK importerad men UI visar konfigurations-banner när nyckel saknas. "
        "`warn-only` = koden self-disablar (`if (!domain) return null`). "
        "Saknad tag tolkas som `build`."
    )
    rows: list[dict[str, Any]] = []
    for d in dossiers:
        env_vars = d.get("envVars") or []
        if not isinstance(env_vars, list) or not env_vars:
            continue
        for ev in env_vars:
            if not isinstance(ev, dict):
                continue
            rows.append({
                "dossier": d.get("id"),
                "class": d["_class"],
                "key": ev.get("key"),
                "required": "✓" if ev.get("required") else "",
                "enforcement": ev.get("enforcement", "build (default)"),
            })
    if not rows:
        st.info("Inga dossiers med envVars hittade.")
        return
    rows.sort(key=lambda r: (r["enforcement"], r["dossier"] or "", r["key"] or ""))
    st.dataframe(rows, width="stretch", hide_index=True)


def _section_capability_tiers() -> None:
    st.subheader("Capability tiers (plan 06)")
    tiers = _extract_ts_union_values(CAPABILITY_TIERS_PATH, "CapabilitySpecificityTier")
    if not tiers:
        st.warning(
            "Kunde inte läsa CapabilitySpecificityTier från "
            "`src/lib/builder/follow-up-capability-detection.ts`."
        )
        return
    st.caption(
        "Tier-signalerna sätts i follow-up-detektionen och lagras i "
        "`requestedCapabilityTiers` i orchestration-signalen."
    )
    st.dataframe(
        [{"tier": tier} for tier in tiers],
        width="stretch",
        hide_index=True,
    )


def _section_capability_map(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Capability map")
    st.caption(
        "Översikt över vilka dossiers som är registrerade per capability, plus "
        "en genererad gruppvy (dossier-grupp/kategori — presentations-lager, "
        "kanonisk källa `src/lib/builder/dossier-groups.ts`). Brief-LLM:n "
        "deklarerar `requestedCapabilities` och varje capability matchar mot "
        "exakt en dossier (eller ingen om kapabiliteten saknas)."
    )
    current = _load_json(CAPABILITY_MAP_PATH) or {}
    fresh = _rebuild_capability_map(dossiers)
    diff = current.get("capabilities") != fresh["capabilities"]
    current_groups = current.get("groups") if isinstance(current.get("groups"), dict) else {}
    groups_stale = _groups_view_is_stale(current_groups, dossiers)
    if diff:
        st.warning("`capability-map.json` är inte i synk med manifests. Klicka för att bygga om.")
    elif groups_stale:
        st.warning(
            "`groups`-vyn saknas eller täcker inte poolens capabilities — bygg om. "
            "(Label-/bucket-drift mot `dossier-groups.ts` fångas av TS-checkens "
            "check-läge, inte här.)"
        )
    if st.button("Bygg om capability-map.json (inkl. grupper)"):
        with st.spinner("Kör `npm run dossiers:capability-map:write`…"):
            ok, output = _run_capability_map_write()
        if ok:
            st.success(f"Skrev {CAPABILITY_MAP_PATH.relative_to(REPO_ROOT)} (capabilities + grupper).")
            st.cache_data.clear()
            current = _load_json(CAPABILITY_MAP_PATH) or {}
        else:
            st.error("Kunde inte köra regenerate-skriptet:\n" + output[-3000:])
    st.caption(
        "Regenereringen körs via TS-skriptet (`npm run dossiers:capability-map:write`, "
        "`scripts/dossiers/regenerate-capability-map.ts`) i stället för en egen "
        "Python-implementation, så `groups`-fältet aldrig kan hamna i otakt med "
        "`dossier-groups.ts`."
    )
    st.json((current.get("capabilities") if current else None) or fresh["capabilities"])

    st.markdown("**Dossier-grupper (kategorier)**")
    groups = current.get("groups") if isinstance(current.get("groups"), dict) else {}
    if not groups:
        st.info(
            "Ingen `groups`-vy hittad ännu i capability-map.json — klicka "
            "'Bygg om' ovan för att generera den."
        )
    else:
        group_rows = [
            {
                "grupp": group_id,
                "label": info.get("label"),
                "capabilities": ", ".join(info.get("capabilities") or []) or "—",
            }
            for group_id, info in groups.items()
        ]
        st.dataframe(group_rows, width="stretch", hide_index=True)


def _run_sdk_version_check() -> dict[str, Any]:
    """Run the read-only dossier SDK-version drift check across ALL dossiers.
    Catches the recurring class where a dossier pins a stale SDK apiVersion
    literal (e.g. Stripe) that no longer typechecks against the installed SDK."""
    script = REPO_ROOT / "scripts" / "dossiers" / "check-sdk-versions.mjs"
    if not script.exists():
        return {"ok": False, "error": "check-sdk-versions.mjs saknas."}
    try:
        result = subprocess.run(
            ["node", str(script), "--json"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )
        # The script emits a JSON envelope on BOTH success (exit 0) and drift
        # (exit 1). A crash before writing JSON leaves empty stdout — do NOT treat
        # that as `{}`/success; gate on parseability + returncode so the operator
        # never sees a green banner when the check never actually ran (Bugbot).
        stdout = (result.stdout or "").strip()
        if not stdout:
            return {
                "ok": False,
                "error": (result.stderr or "").strip()
                or f"SDK-versionskollen gav ingen output (exit {result.returncode}).",
            }
        try:
            return json.loads(stdout)
        except json.JSONDecodeError:
            return {"ok": False, "error": result.stderr or stdout or "Okänt fel."}
    except Exception as exc:  # noqa: BLE001 - surface any failure to the operator
        return {"ok": False, "error": str(exc)}


def _section_health() -> None:
    st.subheader("Hälsokoll: SDK-versioner")
    st.caption(
        "Går igenom ALLA dossiers och jämför pinnade SDK-`apiVersion`-literaler "
        "(t.ex. Stripe) mot den installerade SDK:ns förväntade version. En stale "
        "pin gör att varje generering som injicerar dossiern failar typecheck "
        "(TS2322). Read-only. Kommando: `npm run dossiers:check-sdk`."
    )
    if st.button("Kör SDK-versionskoll"):
        st.session_state["dossier_sdk_check"] = _run_sdk_version_check()
    res = st.session_state.get("dossier_sdk_check")
    if res is not None:
        if res.get("error"):
            st.error(res["error"])
        else:
            drifts = res.get("drifts", [])
            checked = res.get("checked", [])
            unreadable = res.get("unreadable", [])
            skipped = res.get("skipped", [])
            if drifts:
                st.error(f"{len(drifts)} SDK-versionsdrift(er) hittades:")
                st.dataframe(drifts, use_container_width=True, hide_index=True)
            if unreadable:
                st.error(
                    f"{len(unreadable)} pinnad SDK installerad men versionen kunde inte läsas "
                    "(kan ej verifiera — fail-closed):"
                )
                st.dataframe(unreadable, use_container_width=True, hide_index=True)
            if not drifts and not unreadable:
                if checked:
                    st.success(
                        f"Alla {len(checked)} pinnade SDK-apiVersion(er) matchar installerade SDK:er."
                    )
                else:
                    # Nothing verified is NOT the same as healthy — don't show green.
                    st.info(
                        "Inga pinnade SDK-apiVersion(er) kunde kontrolleras "
                        "(inga kända pins, eller SDK:erna är inte installerade i detta repo)."
                    )
            if checked:
                st.caption("Kontrollerade pins:")
                st.dataframe(checked, use_container_width=True, hide_index=True)
            if skipped:
                st.caption("Överhoppade (okänd/ej installerad SDK):")
                st.dataframe(skipped, use_container_width=True, hide_index=True)


def _list_template_refs() -> list[str]:
    if not TEMPLATE_REFS_ROOT.exists():
        return []
    return sorted(d.name for d in TEMPLATE_REFS_ROOT.iterdir() if d.is_dir())


def _run_curate(reference_id: str, target_class: str, target_id: str) -> tuple[bool, str]:
    cmd = [
        "npx",
        "tsx",
        "scripts/dossiers/curate-from-reference.ts",
        f"--reference={reference_id}",
        f"--class={target_class}",
        f"--id={target_id}",
    ]
    try:
        result = subprocess.run(
            cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, check=False, timeout=300,
        )
        out = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, out
    except subprocess.TimeoutExpired:
        return False, "Kurations-skriptet tog mer än 5 minuter — kör från terminal istället."
    except FileNotFoundError as exc:
        return False, f"Saknar binär: {exc}"


def _apply_capability_override(target_class: str, target_id: str, capability: str) -> tuple[bool, str]:
    """Overwrite a freshly-curated draft's `capability` with the dossier-grupp
    capability the curator explicitly picked, so a brand-new dossier lands on
    a decided capability instead of whatever the LLM guessed. Runs AFTER
    `curate-from-reference.ts` has already written + AJV-validated the
    manifest — this does not touch the script or its LLM contract. Fail-closed:
    nothing is saved unless BOTH the light pre-check and the strict schema
    (same gate as `_promote_prospect`) pass on the patched manifest."""
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", capability):
        return False, f"Ogiltig capability (måste vara kebab-case): {capability!r}"
    manifest_path = DOSSIER_ROOT / target_class / target_id / "manifest.json"
    manifest = _load_json(manifest_path)
    if not manifest:
        return False, f"Kunde inte läsa {manifest_path.relative_to(REPO_ROOT)} efter kurationen."
    manifest["capability"] = capability
    # Kuratorn styr capabilityn — men LLM:en kan ha satt defaultForCapability
    # true, och mot en BEFINTLIG capability med redan flaggad default skulle
    # det ge dubbla defaults (stoppas först i validate-all). Tvinga false;
    # default-flytt är ett medvetet kuratorsbeslut i Redigera-tabben.
    if manifest.get("defaultForCapability"):
        manifest["defaultForCapability"] = False
    errors = _validate_manifest(manifest)
    if errors:
        return False, "Manifestet blev ogiltigt efter capability-bytet:\n" + "\n".join(f"- {e}" for e in errors)
    try:
        from backoffice.shared import validate_json_against_schema

        schema_errors = validate_json_against_schema(manifest, STRICT_SCHEMA_PATH)
    except Exception as exc:  # noqa: BLE001 - fail closed, never save unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades efter "
            "capability-bytet — sparar inte:\n" + "\n".join(f"- {e}" for e in schema_errors)
        )
    _save_json(manifest_path, manifest)
    return True, ""


def _section_curate() -> None:
    st.subheader("AI-kuration från template-references")
    st.caption(
        "Pekar på en klonad mapp under `data/template-references/repos/` och låter "
        "GPT producera ett **utkast** till dossier-manifest + `instructions.md`. "
        "Granska och spara via Redigera-tabben innan dossiern går live."
    )
    refs = _list_template_refs()
    if not refs:
        st.info(
            "Inga template-references hittade. Klona ett repo manuellt till "
            f"`{TEMPLATE_REFS_ROOT.relative_to(REPO_ROOT)}/<id>/` eller kör "
            "`git clone <url> data/template-references/repos/<id>` från terminalen."
        )
        return

    st.markdown("**Skapa inom kategori (valfritt)**")
    groups = _load_group_view()
    if not groups:
        st.info(
            "Ingen `groups`-vy hittad i capability-map.json ännu — kör 'Bygg om' "
            "i Capability map-fliken för att välja kategori här. Du kan ändå "
            "skriva en capability fritt nedan."
        )
    group_ids = list(groups.keys())
    group_labels = {gid: (groups[gid].get("label") or gid) for gid in group_ids}
    group_cols = st.columns(2)
    with group_cols[0]:
        chosen_group_id = st.selectbox(
            "Dossier-grupp (kategori)",
            group_ids,
            format_func=lambda gid: group_labels.get(gid, gid),
            key="curate_group_id",
        ) if group_ids else None
    group_capabilities = groups.get(chosen_group_id, {}).get("capabilities") or [] if chosen_group_id else []
    with group_cols[1]:
        capability_choice = st.selectbox(
            "Capability i gruppen",
            ["(ingen — se fritt fält)"] + group_capabilities,
            key="curate_capability_choice",
        )
    free_capability = st.text_input(
        "…eller ny capability (fritt fält, kebab-case, tar över valet ovan)",
        key="curate_capability_free",
    ).strip()
    decided_capability = free_capability or (
        capability_choice if capability_choice != "(ingen — se fritt fält)" else ""
    )
    if decided_capability:
        group_hint = group_labels.get(chosen_group_id, "Övrigt") if chosen_group_id else "Övrigt"
        st.caption(f"Beslutad capability vid skapande: `{decided_capability}` (grupp: {group_hint}).")
    st.caption(
        "Påminnelse: en **hard**-capabilitys default-dossier måste ha `mock` ≠ "
        "`none` — om inte capabilityn står på undantagslistan "
        "(`MOCKLESS_CAPABILITY_EXCEPTIONS` i `src/lib/gen/dossiers/validate-manifest.ts`, "
        "dokumenterad i `docs/contracts/dossier-system.md`). Annars stoppar "
        "`npm run dossiers:validate-all`."
    )

    cols = st.columns(3)
    with cols[0]:
        ref_id = st.selectbox("Referens-repo", refs)
    with cols[1]:
        target_class = st.radio("Klass", ["hard", "soft"], horizontal=True)
    with cols[2]:
        suggested = ref_id.replace("_", "-").replace(" ", "-").lower() if ref_id else ""
        target_id = st.text_input("Ny dossier-id", value=suggested)
    if st.button("🤖 Kurera utkast", type="primary"):
        if not target_id:
            st.error("Ange ett ID för den nya dossiern.")
            return
        # Validate the picked capability BEFORE the expensive LLM run — a typo
        # in the free field must not cost a ~5 min curation first.
        if decided_capability and not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", decided_capability):
            st.error(
                f"Ogiltig capability (måste vara kebab-case, t.ex. `image-generation`): "
                f"`{decided_capability}` — kurationen startades inte."
            )
            return
        with st.spinner("Kör kurations-skriptet…"):
            ok, output = _run_curate(ref_id, target_class, target_id)
        override_failed = False
        if ok and decided_capability:
            override_ok, override_msg = _apply_capability_override(target_class, target_id, decided_capability)
            if override_ok:
                output += f"\n[backoffice] satte capability={decided_capability!r} enligt vald kategori."
            else:
                override_failed = True
                output += f"\n[backoffice] KUNDE INTE sätta vald capability: {override_msg}"
        (st.success if ok else st.error)(output[-3000:])
        if ok and override_failed:
            st.warning(
                "Kurationen lyckades men den valda capabilityn kunde INTE sättas "
                "— utkastet har kvar LLM:ns egen capability. Rätta manuellt i "
                "Redigera-tabben innan dossiern används."
            )
        if ok:
            st.info(
                f"Granska och redigera `data/dossiers/{target_class}/{target_id}/` i Redigera-tabben "
                f"innan dossiern är produktionsklar."
            )


# ── Legacy-import (prospect → v2-utkast) ────────────────────────────────────
# Drives scripts/dossiers/normalize-legacy-prospect.ts from the backoffice so a
# maintainer can run the strict LLM normalizer, read its verdict/concerns, and
# promote an accepted draft into the live pool — without touching the terminal.
# The prospect material lives OUTSIDE the repo (kept out of Cursor's index).

_NORMALIZE_MODELS = ("gpt-5.5", "gpt-5.4-mini")


def _npm_binary() -> str:
    """Resolve the npm launcher cross-platform. On Windows the executable is
    `npm.cmd`; `shutil.which` finds whichever is on PATH."""
    found = shutil.which("npm")
    if found:
        return found
    return "npm.cmd" if os.name == "nt" else "npm"


def _prospect_root() -> Path:
    """Where the legacy prospect material lives. Override with the
    `DOSSIER_PROSPECT_ROOT` env var; defaults to a sibling folder next to the
    repo root (`../dossiers-prospect`). Mirrors the TS script default in
    scripts/dossiers/normalize-legacy-prospect.ts."""
    override = os.environ.get("DOSSIER_PROSPECT_ROOT", "").strip()
    if override:
        return Path(override).expanduser()
    return REPO_ROOT.parent / "dossiers-prospect"


def _load_prospect_plan(root: Path) -> list[dict[str, Any]]:
    data = _load_json(root / "prospects.json")
    if not data or not isinstance(data.get("prospects"), list):
        return []
    return [p for p in data["prospects"] if isinstance(p, dict)]


def _load_prospect_report(root: Path) -> dict[str, Any]:
    data = _load_json(root / "normalization-report.json")
    return data if isinstance(data, dict) else {}


def _read_prospect_verdict_files(root: Path, legacy_id: str) -> tuple[str | None, str]:
    """Return (kind, text) for a prospect's on-disk verdict artifact.
    kind is 'accept' (from _v2-draft/REVIEW.md), 'reject' (from REJECTED.md),
    or None when the prospect has not been processed yet."""
    review = root / legacy_id / "_v2-draft" / "REVIEW.md"
    rejected = root / legacy_id / "REJECTED.md"
    if review.exists():
        return "accept", review.read_text(encoding="utf-8")
    if rejected.exists():
        return "reject", rejected.read_text(encoding="utf-8")
    return None, ""


def _run_normalize(only: str | None, run_all: bool, force: bool, model: str) -> tuple[bool, str]:
    """Invoke `npm run dossiers:normalize-legacy -- ...`. Blocks until done —
    a single prospect is ~1-2 min, `--all` (12 prospects) can be ~10 min, so
    the timeout scales with scope."""
    args = ["run", "dossiers:normalize-legacy", "--"]
    if run_all:
        args.append("--all")
    elif only:
        args.append(f"--only={only}")
    else:
        return False, "Inget att köra (varken --all eller --only angavs)."
    if force:
        args.append("--force")
    if model:
        args.append(f"--model={model}")
    timeout = 1800 if run_all else 400
    try:
        result = subprocess.run(
            [_npm_binary(), *args],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
        return result.returncode == 0, (result.stdout or "") + (result.stderr or "")
    except subprocess.TimeoutExpired:
        return False, (
            f"Normaliseringen tog mer än {timeout}s — kör hellre från terminal:\n"
            "npm run dossiers:normalize-legacy -- --all"
        )
    except FileNotFoundError as exc:
        return False, f"Saknar binär (npm): {exc}"


def _promote_prospect(root: Path, entry: dict[str, Any], force: bool) -> tuple[bool, str]:
    """Copy an accepted `_v2-draft/` into the live pool
    (`data/dossiers/<class>/<id>/`). Validates the draft manifest first and
    refuses to overwrite an existing dossier unless `force`. This writes into
    the live pool but does NOT rebuild the capability map or run the strict AJV
    validator — the UI surfaces those as explicit follow-up actions, mirroring
    the draft/review discipline of the AI-curation tab."""
    legacy_id = str(entry.get("legacyId") or "")
    klass = entry.get("targetClass")
    target_id = entry.get("targetId")
    if klass not in ("hard", "soft") or not target_id:
        return False, "Ogiltig plan-post (saknar targetClass/targetId)."
    # Kebab-case guard: also the containment guard — a valid kebab-case id has
    # no "/", "\\" or "." so it cannot escape data/dossiers/<class>/ via `..`.
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", str(target_id)):
        return False, f"Ogiltigt targetId (måste vara kebab-case): {target_id!r}"
    draft = root / legacy_id / "_v2-draft"
    manifest_path = draft / "manifest.json"
    if not manifest_path.exists():
        return False, f"Inget utkast hittades ({manifest_path}). Kör normaliseringen först."
    manifest = _load_json(manifest_path)
    if not manifest:
        return False, "Utkastets manifest.json kunde inte läsas (ogiltig JSON)."
    if manifest.get("id") != target_id:
        return False, (
            f"Utkastets manifest.id ({manifest.get('id')!r}) matchar inte plan-postens "
            f"targetId ({target_id!r}). Kör om normaliseringen mot aktuell plan."
        )
    errors = _validate_manifest(manifest)
    if errors:
        return False, "Manifest-validering misslyckades:\n" + "\n".join(f"- {e}" for e in errors)
    # Canonical strict-schema gate (additionalProperties:false, kebab/id/label
    # patterns, enum + length constraints) — the lightweight `_validate_manifest`
    # above misses these, so a manually-edited draft could otherwise be promoted
    # into a state the runtime registry (strict AJV) silently excludes.
    try:
        from backoffice.shared import validate_json_against_schema

        schema_errors = validate_json_against_schema(manifest, STRICT_SCHEMA_PATH)
    except Exception as exc:  # noqa: BLE001 - surface any failure, fail closed
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — promotar inte:\n"
            + "\n".join(f"- {e}" for e in schema_errors)
        )
    target_dir = DOSSIER_ROOT / klass / target_id
    if target_dir.exists() and not force:
        rel = target_dir.relative_to(REPO_ROOT)
        return False, f"Dossier finns redan: `{rel}`. Kryssa i 'Skriv över' för att ersätta."
    target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest_path, target_dir / "manifest.json")
    instructions = draft / "instructions.md"
    if instructions.exists():
        shutil.copy2(instructions, target_dir / "instructions.md")
    comp_src = draft / "components"
    comp_dst = target_dir / "components"
    if comp_dst.exists():
        shutil.rmtree(comp_dst)
    if comp_src.exists():
        shutil.copytree(comp_src, comp_dst)
    rel = target_dir.relative_to(REPO_ROOT)
    return True, (
        f"Promoterade utkast till `{rel}`.\n\n"
        "Nästa steg: bygg om capability-map (fliken 'Capability map'), kör "
        "`npm run dossiers:validate-all`, applicera kodfixarna i REVIEW och "
        "koppla ev. ny capability i brief-prompten + follow-up-vokabulären."
    )


def _section_legacy_prospect(dossiers: list[dict[str, Any]]) -> None:
    st.subheader("Legacy-import (prospect → v2-utkast)")
    root = _prospect_root()
    st.caption(
        "Kör den strikta LLM-normaliseraren "
        "(`scripts/dossiers/normalize-legacy-prospect.ts`) som läser gamla "
        "legacy-dossiers och skriver **v2-utkast** (aldrig direkt till live-poolen). "
        f"Materialet ligger utanför repot: `{root}` "
        "(ändras via env `DOSSIER_PROSPECT_ROOT`)."
    )

    if not (root / "prospects.json").exists():
        st.info(
            f"Ingen `prospects.json` i `{root}`.\n\n"
            "Seed-mappen skapas genom att kopiera valda legacy-dossiers dit och "
            "lägga en kurationsplan (`prospects.json`). Se README i "
            "`scripts/dossiers/normalize-legacy-prospect.ts` för formatet."
        )
        return

    plan = _load_prospect_plan(root)
    report = _load_prospect_report(root)
    live_ids = {(d.get("_class"), d.get("id")) for d in dossiers}

    rows: list[dict[str, Any]] = []
    for entry in plan:
        legacy_id = str(entry.get("legacyId") or "")
        row_report = report.get(legacy_id) or {}
        draft_exists = (root / legacy_id / "_v2-draft" / "manifest.json").exists()
        in_live = (entry.get("targetClass"), entry.get("targetId")) in live_ids
        rows.append(
            {
                "legacy": legacy_id,
                "→ id": entry.get("targetId"),
                "class": entry.get("targetClass"),
                "capability": entry.get("targetCapability"),
                "verdict": row_report.get("verdict") or "—",
                "concerns": len(row_report.get("concerns") or []),
                "fixar": len(row_report.get("requiredCodeChanges") or []),
                "utkast": "✓" if draft_exists else "",
                "i live-pool": "✓" if in_live else "",
            }
        )
    if rows:
        st.dataframe(rows, width="stretch", hide_index=True)
        accepts = sum(1 for r in rows if r["verdict"] == "accept")
        rejects = sum(1 for r in rows if r["verdict"] == "reject")
        invalids = sum(1 for r in rows if r["verdict"] == "invalid")
        st.caption(
            f"{len(rows)} prospects · accept: {accepts} · reject: {rejects} · "
            f"invalid: {invalids}. 'fixar' = obligatoriska kodändringar innan promotion."
        )

    model = st.selectbox("Modell för normalisering", _NORMALIZE_MODELS, key="prospect_model")
    st.caption(
        "`gpt-5.5` = bäst omdöme (default). `gpt-5.4-mini` = billigare/snabbare. "
        "Körningen blockerar UI:t tills den är klar."
    )
    batch_cols = st.columns(2)
    with batch_cols[0]:
        if st.button("Normalisera saknade", key="prospect_run_missing"):
            with st.spinner("Kör normaliseraren (hoppar över redan behandlade)…"):
                ok, output = _run_normalize(None, run_all=True, force=False, model=model)
            (st.success if ok else st.error)(output[-3000:])
    with batch_cols[1]:
        if st.button("Kör om alla (force)", key="prospect_run_all_force"):
            with st.spinner("Kör om ALLA prospects…"):
                ok, output = _run_normalize(None, run_all=True, force=True, model=model)
            (st.success if ok else st.error)(output[-3000:])

    st.divider()
    st.markdown("**Enskild prospect**")
    ids = [str(p.get("legacyId") or "") for p in plan if p.get("legacyId")]
    if not ids:
        return
    pick = st.selectbox("Välj prospect", ids, key="prospect_pick")
    entry = next((p for p in plan if p.get("legacyId") == pick), None)
    if not entry:
        return

    st.caption(
        f"Mål: `{entry.get('targetClass')}/{entry.get('targetId')}` · "
        f"capability `{entry.get('targetCapability')}`"
        + (f" · {entry.get('notes')}" if entry.get("notes") else "")
    )

    single_cols = st.columns(2)
    with single_cols[0]:
        if st.button("Normalisera denna", key="prospect_run_one"):
            with st.spinner(f"Normaliserar {pick}…"):
                ok, output = _run_normalize(pick, run_all=False, force=True, model=model)
            (st.success if ok else st.error)(output[-3000:])

    # Promotion trusts the REPORT verdict (canonical outcome of the latest run),
    # not merely the presence of a REVIEW.md — a stale draft from an older run
    # must never enable promote after the latest run went invalid/reject.
    kind, text = _read_prospect_verdict_files(root, pick)
    row_report = report.get(pick) or {}
    report_verdict = row_report.get("verdict")
    draft_exists = (root / pick / "_v2-draft" / "manifest.json").exists()

    if report_verdict == "accept" and draft_exists:
        st.success("Utkast finns (accepterat i senaste körningen).")
        if text:
            with st.expander("REVIEW.md — concerns + obligatoriska kodfixar", expanded=False):
                st.markdown(text)
        # Block promotion while REVIEW lists required code changes — the draft's
        # manifest shape can be valid while the integration code still needs the
        # fixes (lazy SDK-init, real schema, …). Require an explicit ack so a
        # maintainer can't one-click known-unfinished code into the live pool.
        required_changes = row_report.get("requiredCodeChanges") or []
        fixes_ack = True
        if required_changes:
            st.warning(
                f"{len(required_changes)} obligatorisk(a) kodfix(ar) enligt REVIEW "
                "innan denna dossier är säker i live-poolen."
            )
            fixes_ack = st.checkbox(
                "Jag har applicerat kodfixarna (eller tar ansvar för att promota ändå)",
                key="prospect_fixes_ack",
            )
        with single_cols[1]:
            force_overwrite = st.checkbox("Skriv över befintlig", key="prospect_promote_force")
        if st.button(
            "Promota utkast → live-pool",
            type="primary",
            key="prospect_promote",
            disabled=not fixes_ack,
        ):
            ok, msg = _promote_prospect(root, entry, force=force_overwrite)
            (st.success if ok else st.error)(msg)
            if ok:
                st.cache_data.clear()
    elif report_verdict == "invalid":
        st.error(
            "Senaste körningen blev **invalid** — LLM:en accepterade men utkastet "
            "föll på schema-/mekanikvalidering. Inget utkast att promota."
        )
        val_errors = row_report.get("validationErrors") or []
        if val_errors:
            st.markdown("\n".join(f"- {e}" for e in val_errors))
        st.caption("Kör 'Normalisera denna' igen (ev. efter promptjustering).")
    elif report_verdict == "reject" or kind == "reject":
        st.error("Normaliseraren avvisade denna prospect.")
        if text:
            with st.expander("REJECTED.md — motivering", expanded=True):
                st.markdown(text)
        elif row_report.get("reason"):
            st.markdown(f"> {row_report['reason']}")
    elif draft_exists:
        st.warning(
            "Ett utkast finns men senaste verdict är inte 'accept' — kör om "
            "normaliseringen innan du promotar."
        )
    else:
        st.info("Inte behandlad ännu. Klicka 'Normalisera denna' för att skapa ett utkast.")


def render(ctx) -> None:  # ctx kept for backoffice signature parity
    del ctx
    st.title("Dossiers")
    st.caption(
        "Capability-driven, deterministic urval. "
        "[Format-spec](/?nav=docs) · "
        "Disk: `data/dossiers/{hard|soft}/<id>/` · Schema: `docs/schemas/strict/dossier.schema.json`."
    )

    dossiers = _walk_all_dossiers()
    tabs = st.tabs(
        [
            "Översikt",
            "Lista",
            "Enforcement",
            "Capability tiers",
            "Redigera",
            "Capability map",
            "Hälsokoll",
            "AI-kuration",
            "Legacy-import",
        ]
    )
    with tabs[0]:
        _section_overview(dossiers)
    with tabs[1]:
        _section_list(dossiers)
    with tabs[2]:
        _section_enforcement_overview(dossiers)
    with tabs[3]:
        _section_capability_tiers()
    with tabs[4]:
        _section_edit(dossiers)
        _section_delete(dossiers)
    with tabs[5]:
        _section_capability_map(dossiers)
    with tabs[6]:
        _section_health()
    with tabs[7]:
        _section_curate()
    with tabs[8]:
        _section_legacy_prospect(dossiers)
