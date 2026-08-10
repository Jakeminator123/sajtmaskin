from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import (
    backup_file,
    backup_tree,
    confirm_by_typing,
    danger_zone,
    field_label,
    render_building_blocks_nav,
    render_save_scope,
    run_repo_command,
    tech_details,
    validate_json_against_schema,
)


def _facade():
    from backoffice.pages import dossiers as page
    return page


from .constants import (
    PAGE_NAME,
    REPO_ROOT,
    DOSSIER_ROOT,
    HARD_ROOT,
    SOFT_ROOT,
    INDEX_ROOT,
    CAPABILITY_MAP_PATH,
    STRICT_SCHEMA_PATH,
    TEMPLATE_REFS_ROOT,
    CAPABILITY_TIERS_PATH,
    REQUIRED_FIELDS,
    VALIDATE_MANIFEST_TS_PATH,
    _KEBAB_RE,
    CLASS_LABELS,
    MOCK_LABELS,
    _MOCKLESS_FALLBACK,
    _COMPLEXITY_FALLBACK,
    _MOCK_FALLBACK,
    _ALLOWED_ENFORCEMENT,
    _NORMALIZE_MODELS,
    _INSTRUCTIONS_STUB,
)

from .labels import (
    class_label,
    mock_label,
    requires_f3,
    is_default_for_capability,
)



def _load_mockless_capability_exceptions() -> frozenset[str]:
    """Capabilities där `mock: none` är legitimt för en Kopplad (hard) dossier.

    Kanonisk källa är ``MOCKLESS_CAPABILITY_EXCEPTIONS`` i
    ``src/lib/gen/dossiers/validate-manifest.ts`` — nycklarna läses därifrån
    (aldrig en egen Python-lista som kan drifta). Kan filen inte läsas/tolkas
    används det dokumenterade paret, så skapa-formuläret aldrig blir mer
    tillåtande än CI-invarianten."""
    try:
        text = _facade().VALIDATE_MANIFEST_TS_PATH.read_text(encoding="utf-8")
    except OSError:
        return _facade()._MOCKLESS_FALLBACK
    match = re.search(
        r"export const MOCKLESS_CAPABILITY_EXCEPTIONS[^=]*=\s*\{(.*?)\}\s*as const",
        text,
        re.DOTALL,
    )
    if not match:
        return _facade()._MOCKLESS_FALLBACK
    keys = re.findall(
        r'^\s*(?:"([^"\n]+)"|([A-Za-z0-9_-]+))\s*:', match.group(1), re.MULTILINE
    )
    found = frozenset(quoted or bare for quoted, bare in keys)
    return found or _facade()._MOCKLESS_FALLBACK




def _schema_enum(field: str, fallback: tuple[str, ...]) -> tuple[str, ...]:
    """Enum-värdena för ett manifestfält, lästa ur strict-schemat.

    ``docs/schemas/strict/dossier.schema.json`` äger enum:arna. En handskriven
    kopia i UI:t driftar tyst så fort schemat får ett nytt värde — formuläret
    slutar erbjuda det utan att något fäller — så listorna läses därifrån.
    Kan schemat inte läsas används fallbacken, så formulären aldrig blir tomma.
    Pariteten grindas i ``backoffice/test_dossiers_page.py``.
    """
    try:
        schema = json.loads(_facade().STRICT_SCHEMA_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback
    field_schema = (schema.get("properties") or {}).get(field) or {}
    values = tuple(
        str(v) for v in (field_schema.get("enum") or []) if str(v).strip()
    )
    return values or fallback




_COMPLEXITY_OPTIONS = _schema_enum("complexity", _COMPLEXITY_FALLBACK)


_MOCK_OPTIONS = _schema_enum("mock", _MOCK_FALLBACK)




def _existing_default_for_capability(capability: str, *, exclude: Path) -> str | None:
    """``<klass>/<id>`` för det byggblock som redan är Standardval, om något.

    Unikheten är ett **kors-manifest**-krav som bara
    ``npm run dossiers:validate-all`` kontrollerar (`defaultForCapability
    uniqueness`) — varken strict-schemat eller ``_validate_manifest`` ser
    syskonen, eftersom båda validerar ett manifest i taget. Utan denna
    scanning kan en sparning lämna poolen i ett läge där två byggblock gör
    anspråk på samma funktion, och felet syns först i CI eller vid selektion.
    """
    cap = capability.strip().lower()
    if not cap:
        return None
    try:
        exclude_resolved = exclude.resolve()
    except OSError:
        exclude_resolved = exclude
    for class_dir in ("hard", "soft"):
        root = _facade().DOSSIER_ROOT / class_dir
        if not root.is_dir():
            continue
        for manifest_path in sorted(root.glob("*/manifest.json")):
            try:
                if manifest_path.resolve() == exclude_resolved:
                    continue
            except OSError:
                pass
            data = _load_json(manifest_path) or {}
            if not is_default_for_capability(data):
                continue
            if str(data.get("capability") or "").strip().lower() == cap:
                return f"{class_dir}/{manifest_path.parent.name}"
    return None




def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None




def _save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    backup_file(path, _facade().REPO_ROOT)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")




def _list_dossier_dirs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(d for d in root.iterdir() if d.is_dir() and not d.name.startswith("_"))




def _walk_all_dossiers() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for klass, root in (("hard", _facade().HARD_ROOT), ("soft", _facade().SOFT_ROOT)):
        for d in _list_dossier_dirs(root):
            manifest = _load_json(d / "manifest.json")
            if not manifest:
                continue
            manifest["_class"] = klass
            manifest["_path"] = str(d.relative_to(_facade().REPO_ROOT))
            out.append(manifest)
    return out




def _validate_manifest(
    data: dict[str, Any], dossier_class: str | None = None
) -> list[str]:
    errors: list[str] = []
    for f in _facade().REQUIRED_FIELDS:
        if f not in data:
            errors.append(f"missing required field: {f}")
    if "codeFidelity" in data and data["codeFidelity"] not in ("verbatim", "rewritable"):
        errors.append("codeFidelity must be 'verbatim' or 'rewritable'")
    if "complexity" in data and data["complexity"] not in ("simple", "medium", "advanced"):
        errors.append("complexity must be 'simple' | 'medium' | 'advanced'")
    if "id" in data and not isinstance(data["id"], str):
        errors.append("id must be a string")
    providers = data.get("providers")
    if dossier_class == "hard" and (
        not isinstance(providers, list) or not providers
    ):
        errors.append("hard manifests must declare a non-empty providers array")
    elif dossier_class == "soft" and "providers" in data:
        errors.append("soft manifests must not declare providers")
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
            if enforcement not in _facade()._ALLOWED_ENFORCEMENT:
                errors.append(
                    f"envVars[{idx}].enforcement must be one of "
                    f"{sorted(_facade()._ALLOWED_ENFORCEMENT)} (got {enforcement!r})"
                )
    return errors


def _save_raw_manifest(
    manifest_path: Path, manifest: dict[str, Any], *, dossier_class: str
) -> tuple[bool, str]:
    """Fail-closed raw-editor write: class-aware pre-check + strict schema
    before the shared backup/write helper. Raw JSON gives access to every
    schema field, not permission to bypass the runtime contract."""
    errors = _validate_manifest(manifest, dossier_class)
    if errors:
        return False, "Validering misslyckades — sparade inte:\n" + "\n".join(
            f"- {error}" for error in errors
        )
    try:
        schema_errors = validate_json_against_schema(manifest, _facade().STRICT_SCHEMA_PATH)
    except Exception as exc:  # noqa: BLE001 - fail closed, never save unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — sparade inte:\n"
            + "\n".join(f"- {error}" for error in schema_errors)
        )
    _save_json(manifest_path, manifest)
    return True, ""




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
    data = _load_json(_facade().CAPABILITY_MAP_PATH) or {}
    groups = data.get("groups")
    return groups if isinstance(groups, dict) else {}


def _capability_map_source_paths() -> list[Path]:
    """All files that the canonical TypeScript projection fingerprints.

    Keep this path list sourced from ``constants.py`` and mirror only the
    manifest glob here. The generated map records the same relative paths, so
    additions/removals and same-count content edits are detected without
    parsing TypeScript policy in Python.
    """
    paths = [_facade().REPO_ROOT / rel for rel in _facade().CAPABILITY_MAP_FIXED_SOURCES]
    for klass in ("hard", "soft"):
        paths.extend(sorted((_facade().DOSSIER_ROOT / klass).glob("*/manifest.json")))
    return sorted(paths, key=lambda path: path.as_posix())


def _capability_map_source_fingerprints() -> dict[str, str] | None:
    fingerprints: dict[str, str] = {}
    try:
        for path in _capability_map_source_paths():
            relative = path.relative_to(_facade().REPO_ROOT).as_posix()
            fingerprints[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None
    return dict(sorted(fingerprints.items()))


def _capability_map_is_stale(current: dict[str, Any]) -> bool:
    """Compare exact source hashes, not mtimes/counts, with the TS projection."""
    expected = _capability_map_source_fingerprints()
    stored = current.get("sourceFiles")
    return expected is None or not isinstance(stored, dict) or stored != expected


def _ensure_capability_map_current() -> tuple[dict[str, Any], str | None]:
    """Load the validated-registry projection, regenerating it on source drift.

    The subprocess only runs when exact source hashes differ. Failure is soft:
    callers receive the last readable projection plus a warning, so the
    backoffice remains usable when Node/npm is temporarily unavailable.
    """
    current = _load_json(_facade().CAPABILITY_MAP_PATH) or {}
    required_views = (
        isinstance(current.get("dossiers"), list)
        and isinstance(current.get("groups"), dict)
        and isinstance(current.get("f2Policy"), dict)
    )
    if required_views and not _capability_map_is_stale(current):
        return current, None

    ok, output = _run_capability_map_write()
    if ok:
        refreshed = _load_json(_facade().CAPABILITY_MAP_PATH) or {}
        if (
            isinstance(refreshed.get("dossiers"), list)
            and isinstance(refreshed.get("groups"), dict)
            and isinstance(refreshed.get("f2Policy"), dict)
            and not _capability_map_is_stale(refreshed)
        ):
            return refreshed, None
        output = output + "\nGeneratorn avslutades grönt men projektionen är fortfarande ofullständig."
    return current, (
        "Systemkartan kunde inte synkas från runtime-registret. Visar senast "
        "sparade projektion; kör `npm run dossiers:capability-map:write`.\n\n"
        + output[-2000:]
    )


def _render_dossier_flash() -> None:
    flash = st.session_state.pop("_dossier_flash", None)
    if not isinstance(flash, dict):
        return
    renderer = st.success if flash.get("kind") == "success" else st.info
    renderer(str(flash.get("message") or "Klart."))


def _rerun_after_dossier_mutation(message: str) -> None:
    """Make all tabs observe a successful mutation in the same interaction."""
    st.session_state["_dossier_flash"] = {"kind": "success", "message": message}
    st.cache_data.clear()
    st.rerun()




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
            cwd=str(_facade().REPO_ROOT),
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
        # Trim to mirror the TS script (`cap.trim()`), keeping the drift
        # preview byte-identical with what --write would produce.
        cap = str(d.get("capability") or "").strip() or "uncategorized"
        # Key by DIRECTORY name (last segment of _path), not manifest.id — the
        # canonical TS script keys ids by folder name, and a divergent
        # manifest.id would otherwise show "out of sync" forever even right
        # after a successful rebuild (Bugbot medium on #500, round 2).
        dir_name = str(d.get("_path") or "").replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
        by_cap.setdefault(cap, []).append(dir_name or str(d.get("id") or ""))
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




def _apply_manifest_field_edits(
    manifest_path: Path, updates: dict[str, Any], *, dossier_class: str
) -> tuple[bool, str]:
    """Patcha de trygga fälten i ett befintligt manifest (C4). Pure (ingen
    Streamlit) så skrivvägen är enhetstestbar. Samma fail-closed-kedja som
    rå-JSON-editorn: ``_validate_manifest`` → strict-schema → ``_save_json``
    (backup + skriv). ``None`` som värde tar bort ett valfritt fält
    (`summarySv`, `mock`, `defaultForCapability`). Inget skrivs om någon av
    valideringarna faller.

    ``dossier_class`` är obligatorisk och keyword-only därför att den sista
    grinden behöver den: en Kopplad (hard) dossier får inte sparas utan
    demoläge om capabilityn inte står på ``MOCKLESS_CAPABILITY_EXCEPTIONS``.
    Samma regel som :func:`_create_dossier_skeleton` — utan den kunde
    skapa-vägen vägra ett tillstånd som redigera-vägen sedan skrev, och
    resultatet fällde ``npm run dossiers:validate-all`` i stället. Varken
    strict-schemat eller ``_validate_manifest`` fångar det, eftersom ``mock``
    är valfritt för båda. Ett redan trasigt manifest kan alltså inte sparas
    vidare utan att demoläget sätts i samma formulär. Rå-JSON-editorn ger
    fortfarande full kontroll över schemafälten men kör alltid klassregeln och
    strict-schemat före skrivning."""
    manifest = _load_json(manifest_path)
    if not manifest:
        return False, f"Kunde inte läsa `{manifest_path}` (saknad eller ogiltig JSON)."
    for key, value in updates.items():
        if value is None:
            manifest.pop(key, None)
        else:
            manifest[key] = value
    errors = _validate_manifest(manifest, dossier_class)
    if errors:
        return False, "Validering misslyckades — sparade inte:\n" + "\n".join(
            f"- {e}" for e in errors
        )
    try:
        schema_errors = validate_json_against_schema(manifest, _facade().STRICT_SCHEMA_PATH)
    except Exception as exc:  # noqa: BLE001 - fail closed, never save unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — sparade inte:\n"
            + "\n".join(f"- {e}" for e in schema_errors)
        )
    capability = str(manifest.get("capability") or "").strip()
    if dossier_class == "hard":
        mock_value = str(manifest.get("mock") or "").strip() or None
        exceptions = _load_mockless_capability_exceptions()
        if (mock_value is None or mock_value == "none") and capability not in exceptions:
            return False, (
                "En Kopplad (hard) dossier måste ha ett demoläge (`mock` ≠ `none`) "
                f"— funktionen `{capability}` står inte på undantagslistan "
                f"({', '.join(sorted(exceptions))}). Sparade inte."
            )
    if is_default_for_capability(manifest):
        taken = _existing_default_for_capability(capability, exclude=manifest_path)
        if taken:
            return False, (
                f"`{taken}` är redan Standardval för funktionen `{capability}` — "
                "två byggblock kan inte vara det samtidigt (det fälls av "
                "`npm run dossiers:validate-all`). Ta bort Standardval där först. "
                "Sparade inte."
            )
    _save_json(manifest_path, manifest)
    return True, ""




def _is_link_like(path: Path) -> bool:
    """True for symlinks AND Windows directory junctions. `Path.is_symlink()`
    misses junctions (they are reparse points, not symlinks), so on Windows we
    read the lstat file attribute directly."""
    if path.is_symlink():
        return True
    if os.name == "nt":
        try:
            attrs = os.lstat(path).st_file_attributes
        except (OSError, AttributeError):
            return False
        # FILE_ATTRIBUTE_REPARSE_POINT = 0x400 — covers junctions + symlinks.
        return bool(attrs & 0x400)
    return False




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
    # Link check MUST run on the unresolved path — `resolve()` follows the
    # link, so checking afterwards always says False and rmtree would hit the
    # link TARGET (Bugbot high on #500). `_is_link_like` also catches Windows
    # directory junctions, which `is_symlink()` does NOT flag (Bugbot high,
    # round 2): junctions are reparse points, so inspect the lstat attribute.
    raw_dir = _facade().REPO_ROOT / rel_path
    if _is_link_like(raw_dir):
        return False, f"`{rel_path}` är en symlink/junction — raderas manuellt, inte härifrån."
    target_dir = raw_dir.resolve()
    klass_root = (_facade().DOSSIER_ROOT / str(chosen.get("_class") or "")).resolve()
    if klass_root not in target_dir.parents:
        return False, f"Sökvägen ligger utanför dossier-poolen: `{rel_path}` — inget raderades."
    if not target_dir.exists():
        return False, f"Katalogen finns inte längre: `{rel_path}`."
    # Fail-closed: radera inte om zip-snapshoten (Återställning) inte kunde tas.
    if backup_tree(target_dir, _facade().REPO_ROOT) is None:
        return False, (
            f"Kunde inte ta zip-snapshot av `{rel_path}` — "
            "avbröt raderingen, inget raderades."
        )
    shutil.rmtree(target_dir)
    return True, (
        f"Raderade `{rel_path}`.\n\n"
        "Nästa steg: bygg om capability-map (Kontroller-tabben) och kör "
        "`npm run dossiers:validate-all`. Ångra: en zip-snapshot av katalogen "
        "togs precis före raderingen — återställ den via sidan **Återställning** "
        "(git funkar också för redan incheckade byggblock)."
    )




def _list_template_refs() -> list[str]:
    if not _facade().TEMPLATE_REFS_ROOT.exists():
        return []
    return sorted(d.name for d in _facade().TEMPLATE_REFS_ROOT.iterdir() if d.is_dir())




def _run_curate(
    reference_id: str, target_class: str, target_id: str, model: str = ""
) -> tuple[bool, str]:
    """Kör kurations-skriptet. ``model`` skickas bara vidare när operatören valt
    ett id; utan flagga använder skriptet manifestets `defaultModel` för
    workloaden `backoffice_dossier_curation` (Fas D). Ett id skriptet inte
    känner igen fälls där, före LLM-anropet."""
    cmd = [
        "npx",
        "tsx",
        "scripts/dossiers/curate-from-reference.ts",
        f"--reference={reference_id}",
        f"--class={target_class}",
        f"--id={target_id}",
    ]
    if model.strip():
        cmd.append(f"--model={model.strip()}")
    try:
        result = subprocess.run(
            cmd, cwd=str(_facade().REPO_ROOT), capture_output=True, text=True, check=False, timeout=300,
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
    manifest_path = _facade().DOSSIER_ROOT / target_class / target_id / "manifest.json"
    manifest = _load_json(manifest_path)
    if not manifest:
        return False, f"Kunde inte läsa {manifest_path.relative_to(_facade().REPO_ROOT)} efter kurationen."
    manifest["capability"] = capability
    # Kuratorn styr capabilityn — men LLM:en kan ha satt defaultForCapability
    # true, och mot en BEFINTLIG capability med redan flaggad default skulle
    # det ge dubbla defaults (stoppas först i validate-all). Tvinga false;
    # default-flytt är ett medvetet kuratorsbeslut i Redigera-tabben.
    # Medvetet rå truthiness-koll och inte is_default_for_capability: här ska
    # varje icke-boolean värde normaliseras till False, inte läsas som "är
    # standardval".
    if manifest.get("defaultForCapability"):
        manifest["defaultForCapability"] = False
    errors = _validate_manifest(manifest, target_class)
    if errors:
        return False, "Manifestet blev ogiltigt efter capability-bytet:\n" + "\n".join(f"- {e}" for e in errors)
    try:
        from backoffice.shared import validate_json_against_schema

        schema_errors = validate_json_against_schema(manifest, _facade().STRICT_SCHEMA_PATH)
    except Exception as exc:  # noqa: BLE001 - fail closed, never save unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades efter "
            "capability-bytet — sparar inte:\n" + "\n".join(f"- {e}" for e in schema_errors)
        )
    _save_json(manifest_path, manifest)
    return True, ""




def _describe_capability_group_hint(
    decided_capability: str, chosen_group_id: str | None, groups: dict[str, Any]
) -> str:
    """Honest group hint for the AI-curation category picker (coach review on
    #500). The group is ALWAYS derived from `dossier-groups.ts` at regenerate
    time — the picker never moves a capability. Three cases:

    1. Capability belongs to the CHOSEN group → show the chosen group.
    2. Capability already exists in ANOTHER group (e.g. group "AI" picked but
       `payments` typed in the free field) → show its REAL group and say the
       group choice does not move it. Previously this case was misreported
       as "ny capability → Övrigt".
    3. Capability is unknown everywhere → genuinely new → lands under
       "Övrigt" until `CAPABILITY_TO_GROUP_ID` is updated + map regenerated.
    """
    chosen_capabilities = (
        groups.get(chosen_group_id, {}).get("capabilities") or [] if chosen_group_id else []
    )
    if decided_capability in chosen_capabilities:
        label = (
            (groups.get(chosen_group_id, {}).get("label") or "Övrigt")
            if chosen_group_id
            else "Övrigt"
        )
        return f"Beslutad capability vid skapande: `{decided_capability}` (grupp: {label})."
    real_label = _group_label_for_capability(decided_capability, groups)
    if real_label != "Övrigt":
        return (
            f"Beslutad capability vid skapande: `{decided_capability}` — **befintlig "
            f"capability i gruppen {real_label}**; den ligger kvar där (gruppvalet "
            "ovan flyttar inget, det styr bara förslagslistan)."
        )
    return (
        f"Beslutad capability vid skapande: `{decided_capability}` — **ny capability**, "
        "hamnar under **Övrigt** tills den mappas i "
        "`src/lib/builder/dossier-groups.ts` (`CAPABILITY_TO_GROUP_ID`) och "
        "capability-map byggs om. Gruppvalet ovan styr bara förslagslistan."
    )




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
    return _facade().REPO_ROOT.parent / "dossiers-prospect"




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
            cwd=str(_facade().REPO_ROOT),
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
    # Capability-match-gate (backlog A#14, #419): planen är selektionens
    # sanning — ett utkast vars manifest.capability driftat från plan-postens
    # targetCapability skulle promota fel dossier in i capability-poolen.
    # Normaliserad jämförelse (trim + lowercase), samma disciplin som
    # resolveDossierGroup. En plan-post UTAN targetCapability släpps igenom
    # (äldre planer) — gaten låser bara uttryckliga mismatchar.
    plan_capability = str(entry.get("targetCapability") or "").strip()
    manifest_capability = str(manifest.get("capability") or "").strip()
    if plan_capability and manifest_capability.lower() != plan_capability.lower():
        return False, (
            f"Utkastets manifest.capability ({manifest_capability!r}) matchar inte "
            f"plan-postens targetCapability ({plan_capability!r}). Kör om "
            "normaliseringen mot aktuell plan (eller uppdatera prospects.json)."
        )
    errors = _validate_manifest(manifest, klass)
    if errors:
        return False, "Manifest-validering misslyckades:\n" + "\n".join(f"- {e}" for e in errors)
    # Canonical strict-schema gate (additionalProperties:false, kebab/id/label
    # patterns, enum + length constraints) — the lightweight `_validate_manifest`
    # above misses these, so a manually-edited draft could otherwise be promoted
    # into a state the runtime registry (strict AJV) silently excludes.
    try:
        from backoffice.shared import validate_json_against_schema

        schema_errors = validate_json_against_schema(manifest, _facade().STRICT_SCHEMA_PATH)
    except Exception as exc:  # noqa: BLE001 - surface any failure, fail closed
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — promotar inte:\n"
            + "\n".join(f"- {e}" for e in schema_errors)
        )
    target_dir = _facade().DOSSIER_ROOT / klass / target_id
    if target_dir.exists() and not force:
        rel = target_dir.relative_to(_facade().REPO_ROOT)
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
    rel = target_dir.relative_to(_facade().REPO_ROOT)
    return True, (
        f"Promoterade utkast till `{rel}`.\n\n"
        "Nästa steg: bygg om capability-map (Kontroller-tabben), kör "
        "`npm run dossiers:validate-all`, applicera kodfixarna i REVIEW och "
        "koppla ev. ny capability i brief-prompten + follow-up-vokabulären."
    )




def _create_dossier_skeleton(
    target_class: str,
    target_id: str,
    *,
    label: str,
    capability: str,
    summary: str,
    providers: list[str] | None = None,
    complexity: str = "medium",
    code_fidelity: str = "rewritable",
    mock: str | None = None,
    summary_sv: str = "",
    default_for_capability: bool = False,
) -> tuple[bool, str]:
    """Skapa ett nytt byggblock: manifest-skelett + instructions.md-stub under
    ``data/dossiers/<klass>/<id>/``. Pure (ingen Streamlit) så skrivvägen är
    enhetstestbar.

    Fail-closed i strikt ordning:
    1. id + capability valideras (kebab-case, 2-60 tecken) INNAN något skrivs;
    2. en Kopplad (hard) dossier måste deklarera minst ett explicit provider-id;
    3. en Kopplad (hard) dossier måste ha `mock` ≠ `none` om inte capabilityn
       står på `MOCKLESS_CAPABILITY_EXCEPTIONS` (läst ur validate-manifest.ts);
    4. manifestet måste passera `_validate_manifest` OCH strict-schemat
       (`docs/schemas/strict/dossier.schema.json`) INNAN skrivning;
    5. en befintlig katalog skrivs ALDRIG över — `mkdir(exist_ok=False)` är
       själva vakten, så inte heller ett race förbi exists-kollen kan skriva
       över något.
    """
    if target_class not in ("hard", "soft"):
        return False, f"Ogiltig klass: {target_class!r} — inget skapades."
    for field_name, value in (("id", target_id), ("capability", capability)):
        if (
            not isinstance(value, str)
            or not _facade()._KEBAB_RE.match(value)
            or not (2 <= len(value) <= 60)
        ):
            return False, (
                f"Ogiltigt {field_name} (kebab-case, 2-60 tecken, t.ex. "
                f"`image-generation`): {value!r} — inget skapades."
            )
    provider_values = [value.strip() for value in (providers or []) if value.strip()]
    if target_class == "hard" and not provider_values:
        return False, (
            "En Kopplad (hard) dossier måste ha minst ett explicit provider-id "
            "i kebab-case (t.ex. `stripe`) — inget skapades."
        )
    if target_class == "soft" and provider_values:
        return False, "Fristående (soft) dossiers får inte deklarera providers — inget skapades."
    for provider in provider_values:
        if not _facade()._KEBAB_RE.match(provider):
            return False, (
                "Ogiltigt provider-id (kebab-case, t.ex. `vercel-analytics`): "
                f"{provider!r} — inget skapades."
            )
    mock_value = (mock or "").strip() or None
    if target_class == "hard":
        exceptions = _load_mockless_capability_exceptions()
        if (mock_value is None or mock_value == "none") and capability not in exceptions:
            return False, (
                "En Kopplad (hard) dossier måste ha ett demoläge (`mock` ≠ `none`) "
                f"— funktionen `{capability}` står inte på undantagslistan "
                f"({', '.join(sorted(exceptions))}). Inget skapades."
            )

    manifest: dict[str, Any] = {
        "$schema": "../../../../docs/schemas/strict/dossier.schema.json",
        "id": target_id,
        "label": label.strip(),
        "capability": capability,
        "codeFidelity": code_fidelity,
        "complexity": complexity,
        "summary": summary.strip(),
        "lastVerified": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "verificationStatus": "unverified",
    }
    if summary_sv.strip():
        manifest["summarySv"] = summary_sv.strip()
    if default_for_capability:
        manifest["defaultForCapability"] = True
    if target_class == "hard":
        manifest["providers"] = provider_values
    if mock_value and mock_value != "none":
        manifest["mock"] = mock_value

    errors = _validate_manifest(manifest, target_class)
    if errors:
        return False, "Validering misslyckades — inget skapades:\n" + "\n".join(
            f"- {e}" for e in errors
        )
    try:
        schema_errors = validate_json_against_schema(manifest, _facade().STRICT_SCHEMA_PATH)
    except Exception as exc:  # noqa: BLE001 - fail closed, never write unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — inget skapades:\n"
            + "\n".join(f"- {e}" for e in schema_errors)
        )

    target_dir = _facade().DOSSIER_ROOT / target_class / target_id
    rel = f"data/dossiers/{target_class}/{target_id}"
    if default_for_capability:
        taken = _existing_default_for_capability(
            capability, exclude=target_dir / "manifest.json"
        )
        if taken:
            return False, (
                f"`{taken}` är redan Standardval för funktionen `{capability}` — "
                "två byggblock kan inte vara det samtidigt (det fälls av "
                "`npm run dossiers:validate-all`). Skapa byggblocket utan "
                "Standardval, eller ta bort det där först. Inget skapades."
            )
    if target_dir.exists():
        return False, (
            f"Katalogen finns redan: `{rel}` — ett befintligt byggblock skrivs "
            "aldrig över härifrån. Redigera det i Redigera-tabben eller radera "
            "det först."
        )
    try:
        target_dir.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        return False, (
            f"Katalogen finns redan: `{rel}` — ett befintligt byggblock skrivs "
            "aldrig över härifrån."
        )
    try:
        (target_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        (target_dir / "instructions.md").write_text(_facade()._INSTRUCTIONS_STUB, encoding="utf-8")
    except OSError as exc:
        # Rulla tillbaka katalogen vi själva just skapade. Utan detta lämnar ett
        # avbrott mellan de två skrivningarna ett halvskrivet byggblock kvar, och
        # eftersom en befintlig katalog aldrig skrivs över blockeras id:t för
        # gott. Bara våra egna två filer tas bort, och `rmdir` vägrar en icke-tom
        # katalog — rollbacken kan alltså inte radera något annat.
        for name in ("manifest.json", "instructions.md"):
            try:
                (target_dir / name).unlink(missing_ok=True)
            except OSError:
                pass
        try:
            target_dir.rmdir()
        except OSError:
            return False, (
                f"Skrivningen misslyckades ({exc}) och `{rel}` kunde inte städas "
                "bort automatiskt. Ta bort katalogen manuellt innan du försöker "
                "igen — annars rapporteras id:t som upptaget."
            )
        return False, (
            f"Skrivningen misslyckades ({exc}) — `{rel}` rullades tillbaka och "
            "ingenting ligger kvar på disk."
        )
    return True, (
        f"Skapade `{rel}/manifest.json` + `instructions.md`-stub.\n\n"
        "Nästa steg: fyll i instructions.md (rubrikerna är obligatoriska), lägg "
        "ev. `envVars`/`files`/komponenter via Redigera-tabben, kör "
        "`npm run dossiers:validate-all` (knappen nedan) och bygg om "
        "capability-map i Kontroller-tabben."
    )




def _run_sdk_version_check() -> dict[str, Any]:
    """Run the read-only dossier SDK-version drift check across ALL dossiers.
    Catches the recurring class where a dossier pins a stale SDK apiVersion
    literal (e.g. Stripe) that no longer typechecks against the installed SDK."""
    script = _facade().REPO_ROOT / "scripts" / "dossiers" / "check-sdk-versions.mjs"
    if not script.exists():
        return {"ok": False, "error": "check-sdk-versions.mjs saknas."}
    try:
        result = subprocess.run(
            ["node", str(script), "--json"],
            cwd=str(_facade().REPO_ROOT),
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
