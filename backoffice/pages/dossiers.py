"""
Backoffice page: Dossiers (capability-driven, v2 layout).

Reads the new minimal layout:
    data/dossiers/hard/<id>/manifest.json
    data/dossiers/soft/<id>/manifest.json
    data/dossiers/_index/capability-map.json

Lets you:
- Browse all dossiers (hard + soft) with the 4-field summary.
- Edit a manifest in-place (text area, validates JSON before save).
- Trigger an AI-curation run from a template-references repo (single dossier
  at a time, not batch).
- Rebuild capability-map.json from the manifests.

Source-of-truth for the format: docs/architecture/dossier-system.md
"""
from __future__ import annotations

import json
import re
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


def _rebuild_capability_map(dossiers: list[dict[str, Any]]) -> dict[str, Any]:
    by_cap: dict[str, list[str]] = {}
    for d in dossiers:
        cap = d.get("capability") or "uncategorized"
        by_cap.setdefault(cap, []).append(d["id"])
    for cap in by_cap:
        by_cap[cap].sort()
    return {
        "$comment": (
            "View of capability → dossier ids. Can be regenerated from either "
            "backoffice/pages/dossiers.py (Capability map tab → 'Bygg om') "
            "or `npm run dossiers:capability-map:write` "
            "(scripts/dossiers/regenerate-capability-map.ts). "
            "Runtime walks data/dossiers/{hard,soft}/ directly; this file is "
            "for tooling + sanity check during curation."
        ),
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
    rows.sort(key=lambda r: (r["class"], r["capability"] or "", r["id"]))
    st.dataframe(rows, width="stretch", hide_index=True)
    st.caption(
        "Enforcement-kolumn: B=build (blockerar F3), F=feature-runtime "
        "(UI-banner / popup vid runtime), W=warn-only (komponent self-disablar). "
        "Saknat tag på en envVar tolkas som B."
    )


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
        "Översikt över vilka dossiers som är registrerade per capability. "
        "Brief-LLM:n deklarerar `requestedCapabilities` och varje capability "
        "matchar mot exakt en dossier (eller ingen om kapabiliteten saknas)."
    )
    current = _load_json(CAPABILITY_MAP_PATH)
    fresh = _rebuild_capability_map(dossiers)
    diff = (current or {}).get("capabilities") != fresh["capabilities"]
    if diff:
        st.warning("`capability-map.json` är inte i synk med manifests. Klicka för att bygga om.")
    if st.button("Bygg om capability-map.json"):
        _save_json(CAPABILITY_MAP_PATH, fresh)
        st.success(f"Skrev {CAPABILITY_MAP_PATH.relative_to(REPO_ROOT)}")
    st.json(fresh["capabilities"])


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
        try:
            return json.loads(result.stdout or "{}")
        except json.JSONDecodeError:
            return {"ok": False, "error": result.stderr or result.stdout or "Okänt fel."}
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
            if drifts:
                st.error(f"{len(drifts)} SDK-versionsdrift(er) hittades:")
                st.dataframe(drifts, use_container_width=True, hide_index=True)
            else:
                st.success(
                    f"Alla {len(checked)} pinnade SDK-apiVersion(er) matchar installerade SDK:er."
                )
            if checked:
                st.caption("Kontrollerade pins:")
                st.dataframe(checked, use_container_width=True, hide_index=True)
            if res.get("skipped"):
                st.caption("Överhoppade (okänd/ej installerad SDK):")
                st.dataframe(res["skipped"], use_container_width=True, hide_index=True)


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
        with st.spinner("Kör kurations-skriptet…"):
            ok, output = _run_curate(ref_id, target_class, target_id)
        (st.success if ok else st.error)(output[-3000:])
        if ok:
            st.info(
                f"Granska och redigera `data/dossiers/{target_class}/{target_id}/` i Redigera-tabben "
                f"innan dossiern är produktionsklar."
            )


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
    with tabs[5]:
        _section_capability_map(dossiers)
    with tabs[6]:
        _section_health()
    with tabs[7]:
        _section_curate()
