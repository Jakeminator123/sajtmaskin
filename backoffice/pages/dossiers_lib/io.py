from __future__ import annotations

import json
import hashlib
import os
import re
import shutil
import subprocess
from collections.abc import Callable
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, ParamSpec
from uuid import uuid4

import streamlit as st

from backoffice.shared_lib.repo_lock import RepoMutationLockTimeout, repo_mutation_lock
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


_P = ParamSpec("_P")


def _dossier_mutation_locked(
    operation: Callable[_P, tuple[bool, str]],
) -> Callable[_P, tuple[bool, str]]:
    """Keep every Backoffice dossier writer inside the shared repo lock."""

    @wraps(operation)
    def locked(*args: _P.args, **kwargs: _P.kwargs) -> tuple[bool, str]:
        try:
            with repo_mutation_lock(_facade().REPO_ROOT, "dossiers"):
                return operation(*args, **kwargs)
        except RepoMutationLockTimeout:
            return False, (
                "En annan Backoffice-process ändrar byggblock just nu. "
                "Vänta tills den är klar och försök igen."
            )

    return locked


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


def _load_mockless_capability_exceptions(
    projection: dict[str, Any] | None = None,
) -> frozenset[str]:
    """Capabilities där `mock: none` är legitimt för en Kopplad (hard) dossier.

    Läses ur projektionens ``policy.mocklessCapabilityExceptions`` (genererad
    från ``MOCKLESS_CAPABILITY_EXCEPTIONS`` i validate-manifest.ts). Python
    parsar inte TS-källan.

    Saknas ``policy``-noden försöker vi synka projektionen en gång (äldre map
    utan plan-02-fält). Misslyckas det → tom mängd (fail-closed: strängare än
    CI, aldrig mer tillåtande / aldrig krasch).
    """
    data = projection
    if data is None:
        data = _load_json(_facade().CAPABILITY_MAP_PATH) or {}
    policy = data.get("policy") if isinstance(data, dict) else None
    if not isinstance(policy, dict) and projection is None:
        # Explicit fixture/test projections stay untouched; live disk maps refresh.
        refreshed, _warning = _facade()._ensure_capability_map_current()
        data = refreshed
        policy = data.get("policy") if isinstance(data, dict) else None
    raw = (
        policy.get("mocklessCapabilityExceptions") if isinstance(policy, dict) else None
    )
    if not isinstance(raw, list):
        return frozenset()
    found = frozenset(str(item).strip() for item in raw if str(item).strip())
    return found


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
    values = tuple(str(v) for v in (field_schema.get("enum") or []) if str(v).strip())
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


def _required_file_snapshot(path: Path) -> tuple[bytes | None, str | None]:
    try:
        return path.read_bytes(), None
    except BaseException as exc:
        return None, f"Kunde inte läsa `{path}` för en säker skrivning: {exc}"


def _matches_file_snapshot(path: Path, expected: bytes) -> bool:
    try:
        return path.read_bytes() == expected
    except OSError:
        return False


def _atomic_replace_bytes(path: Path, content: bytes) -> None:
    """Stage complete bytes beside ``path`` and atomically replace the live file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    staged = path.with_name(f".{path.name}.backoffice-stage-{uuid4().hex}")
    try:
        with staged.open("xb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(staged, path)
    finally:
        staged.unlink(missing_ok=True)


def _restore_file_bytes(path: Path, content: bytes) -> str | None:
    try:
        _atomic_replace_bytes(path, content)
    except BaseException as exc:
        return str(exc)
    return None


def _commit_single_manifest(
    manifest_path: Path,
    manifest: dict[str, Any],
    original: bytes,
    *,
    operation: str,
) -> tuple[bool, str]:
    """CAS, backup and atomically replace one manifest with byte rollback."""
    if not _matches_file_snapshot(manifest_path, original):
        return False, (
            f"Manifestet ändrades medan {operation} förbereddes. "
            "Ladda om och försök igen; inget skrevs."
        )
    if backup_file(manifest_path, _facade().REPO_ROOT) is None:
        return (
            False,
            f"Kunde inte säkerhetskopiera manifestet före {operation}; inget skrevs.",
        )
    try:
        _save_json(manifest_path, manifest)
    except BaseException as exc:
        rollback_error = None
        if not _matches_file_snapshot(manifest_path, original):
            rollback_error = _restore_file_bytes(manifest_path, original)
        if not isinstance(exc, OSError):
            if rollback_error and hasattr(exc, "add_note"):
                exc.add_note(f"Byte-rollbacken misslyckades: {rollback_error}")
            raise
        if rollback_error:
            return False, (
                f"{operation.capitalize()} misslyckades ({exc}) och byte-rollbacken "
                f"misslyckades ({rollback_error}). Återställ från backup."
            )
        return False, (
            f"{operation.capitalize()} misslyckades ({exc}); manifestet "
            "återställdes byte-exakt."
        )
    return True, ""


def _manifest_identity_error(
    manifest_path: Path,
    manifest: dict[str, Any],
    *,
    dossier_class: str,
) -> str | None:
    """Validate class/folder/id identity at the final live write boundary."""
    if dossier_class not in ("hard", "soft"):
        return f"Ogiltig dossier-klass: {dossier_class!r}. Inget ändrades."
    dossier_id = str(manifest.get("id") or "")
    expected_target, target_error = _verified_live_target(dossier_class, dossier_id)
    if target_error or expected_target is None:
        return (target_error or "Kunde inte verifiera manifestets live-target.") + (
            " Inget ändrades."
        )
    expected_manifest = expected_target / "manifest.json"
    try:
        resolved = manifest_path.resolve(strict=True)
        expected_resolved = expected_manifest.resolve(strict=True)
    except OSError as exc:
        return f"Kunde inte verifiera manifestets sökväg ({exc}). Inget ändrades."
    if (
        manifest_path.name != "manifest.json"
        or resolved.name != "manifest.json"
        or resolved != expected_resolved
        or manifest_path.absolute() != expected_manifest.absolute()
        or dossier_id != manifest_path.parent.name
        or dossier_id != resolved.parent.name
    ):
        return (
            "Manifestets id, katalog och klass matchar inte varandra vid "
            "skrivgränsen. Inget ändrades."
        )
    return None


def _default_invariant_errors_after_changes(
    changes: list[tuple[Path, dict[str, Any] | None, str]],
) -> list[str]:
    """Cross-manifest default errors after one or more projected changes.

    ``dossiers:validate-all`` owns two related invariants that neither the
    strict schema nor ``_validate_manifest`` can see:

    - at most one dossier (hard or soft) may be default for a capability;
    - a hard capability with multiple dossiers must have a hard default.

    Only old/new capability families touched by the changed manifests are
    checked, so an unrelated pre-existing pool error cannot block a local edit.
    A ``None`` replacement projects a deletion; otherwise the corresponding
    on-disk manifest is replaced without writing anything. Multiple changes are
    projected together so a default handoff can be validated atomically.

    Every readable sibling manifest participates, even when it would fail the
    strict schema and therefore be excluded from CI's cross-manifest pass. This
    is deliberately fail-closed: Backoffice must not make the default ownership
    of an already damaged *affected* family more ambiguous. The invalid sibling
    must first be repaired or removed; unrelated invalid families remain
    non-blocking because of the affected-capability filter above.
    """

    def normalized_capability(manifest: dict[str, Any]) -> str:
        return str(manifest.get("capability") or "").strip().lower()

    affected: set[str] = set()
    changed_paths: set[Path] = set()
    for manifest_path, replacement, _dossier_class in changes:
        for manifest in (_load_json(manifest_path) or {}, replacement or {}):
            capability = normalized_capability(manifest)
            if capability:
                affected.add(capability)
        try:
            changed_paths.add(manifest_path.resolve())
        except OSError:
            changed_paths.add(manifest_path)
    if not affected:
        return []

    rows: list[tuple[str, str, dict[str, Any]]] = []
    for class_dir in ("hard", "soft"):
        root = _facade().DOSSIER_ROOT / class_dir
        if not root.is_dir():
            continue
        for sibling_path in sorted(root.glob("*/manifest.json")):
            try:
                if sibling_path.resolve() in changed_paths:
                    continue
            except OSError:
                if sibling_path in changed_paths:
                    continue
            sibling = _load_json(sibling_path)
            if not sibling or normalized_capability(sibling) not in affected:
                continue
            dossier_id = str(sibling.get("id") or sibling_path.parent.name)
            rows.append((class_dir, dossier_id, sibling))

    for manifest_path, replacement, dossier_class in changes:
        if replacement is not None:
            capability = normalized_capability(replacement)
            if capability in affected:
                dossier_id = str(replacement.get("id") or manifest_path.parent.name)
                rows.append((dossier_class, dossier_id, replacement))

    errors: list[str] = []
    for capability in sorted(affected):
        capability_rows = [
            row for row in rows if normalized_capability(row[2]) == capability
        ]
        defaults = [
            f"{class_dir}/{dossier_id}"
            for class_dir, dossier_id, manifest in capability_rows
            if is_default_for_capability(manifest)
        ]
        if len(defaults) > 1:
            errors.append(
                f'capability "{capability}" has {len(defaults)} dossiers with '
                "defaultForCapability=true: "
                + ", ".join(defaults)
                + " (must be exactly one per capability)"
            )

        hard_rows = [row for row in capability_rows if row[0] == "hard"]
        hard_defaults = [row for row in hard_rows if is_default_for_capability(row[2])]
        if len(hard_rows) > 1 and not hard_defaults:
            candidates = ", ".join(
                dossier_id for _class, dossier_id, _manifest in hard_rows
            )
            errors.append(
                f'hard capability "{capability}" has {len(hard_rows)} dossiers but none '
                "with defaultForCapability=true — no resolvable default demo "
                f"(candidates: {candidates})"
            )
    return errors


def _default_invariant_errors_after_change(
    manifest_path: Path,
    replacement: dict[str, Any] | None,
    *,
    dossier_class: str,
) -> list[str]:
    return _default_invariant_errors_after_changes(
        [(manifest_path, replacement, dossier_class)]
    )


def _save_json(path: Path, data: dict[str, Any]) -> None:
    # Stage complete LF bytes before replacing live state. Backups and CAS are
    # owned by the surrounding transaction, never by this low-level primitive.
    _atomic_replace_bytes(
        path,
        (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
    )


def _list_dossier_dirs(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        d for d in root.iterdir() if d.is_dir() and not d.name.startswith("_")
    )


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
    if "codeFidelity" in data and data["codeFidelity"] not in (
        "verbatim",
        "rewritable",
    ):
        errors.append("codeFidelity must be 'verbatim' or 'rewritable'")
    if "complexity" in data and data["complexity"] not in (
        "simple",
        "medium",
        "advanced",
    ):
        errors.append("complexity must be 'simple' | 'medium' | 'advanced'")
    if "id" in data and not isinstance(data["id"], str):
        errors.append("id must be a string")
    providers = data.get("providers")
    if dossier_class == "hard" and (not isinstance(providers, list) or not providers):
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


def _default_handoff_candidates(
    manifest_path: Path, *, dossier_class: str
) -> list[tuple[str, Path]]:
    """Strict-valid hard siblings that can receive default ownership."""
    if dossier_class != "hard":
        return []
    current = _load_json(manifest_path) or {}
    capability = str(current.get("capability") or "").strip().lower()
    if not capability:
        return []
    try:
        current_path = manifest_path.resolve()
    except OSError:
        current_path = manifest_path
    candidates: list[tuple[str, Path]] = []
    hard_root = _facade().DOSSIER_ROOT / "hard"
    for sibling_path in sorted(hard_root.glob("*/manifest.json")):
        try:
            if sibling_path.resolve() == current_path:
                continue
        except OSError:
            pass
        sibling = _load_json(sibling_path)
        if not sibling or is_default_for_capability(sibling):
            continue
        if str(sibling.get("id") or "") != sibling_path.parent.name:
            continue
        if str(sibling.get("capability") or "").strip().lower() != capability:
            continue
        if _validate_manifest(sibling, "hard"):
            continue
        try:
            if validate_json_against_schema(sibling, _facade().STRICT_SCHEMA_PATH):
                continue
        except Exception:  # noqa: BLE001 - an unvalidated successor is never offered
            continue
        candidates.append(
            (str(sibling.get("id") or sibling_path.parent.name), sibling_path)
        )
    return candidates


def _prepare_default_handoff(
    primary_path: Path,
    primary_replacement: dict[str, Any] | None,
    *,
    primary_class: str,
    successor_path: Path,
) -> tuple[dict[str, Any] | None, str | None]:
    """Validate both sides of a projected default transfer without writing."""
    current = _load_json(primary_path)
    successor = _load_json(successor_path)
    if not current or not successor:
        return (
            None,
            "Kunde inte läsa båda manifesten för Standardvals-flytten. Inget ändrades.",
        )
    if primary_class != "hard":
        return (
            None,
            "Standardval kan bara flyttas atomiskt mellan Kopplade (hard) syskon.",
        )
    primary_identity_error = _manifest_identity_error(
        primary_path, current, dossier_class=primary_class
    )
    if primary_identity_error:
        return None, primary_identity_error
    successor_identity_error = _manifest_identity_error(
        successor_path, successor, dossier_class="hard"
    )
    if successor_identity_error:
        return None, (
            "Det nya Standardvalets manifest.id matchar inte katalognamnet eller "
            "hard-poolen — inget ändrades."
        )
    try:
        successor_resolved = successor_path.resolve(strict=True)
        primary_resolved = primary_path.resolve(strict=True)
    except OSError:
        return (
            None,
            "Kunde inte verifiera sökvägen till det nya Standardvalet. Inget ändrades.",
        )
    if successor_resolved == primary_resolved:
        return (
            None,
            "Det valda Standardvalet ligger inte i rätt hard-dossierfamilj. Inget ändrades.",
        )
    old_capability = str(current.get("capability") or "").strip().lower()
    successor_capability = str(successor.get("capability") or "").strip().lower()
    if not old_capability or successor_capability != old_capability:
        return (
            None,
            "Det nya Standardvalet måste vara ett hard-syskon i den gamla funktionen.",
        )

    successor = {**successor, "defaultForCapability": True}
    errors = _validate_manifest(successor, "hard")
    if errors:
        return (
            None,
            "Det nya Standardvalet är ogiltigt — inget ändrades:\n"
            + "\n".join(f"- {error}" for error in errors),
        )
    try:
        schema_errors = validate_json_against_schema(
            successor, _facade().STRICT_SCHEMA_PATH
        )
    except Exception as exc:  # noqa: BLE001 - fail closed before either write
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return (
            None,
            "Det nya Standardvalet faller strict-schema — inget ändrades:\n"
            + "\n".join(f"- {error}" for error in schema_errors),
        )
    default_errors = _default_invariant_errors_after_changes(
        [
            (primary_path, primary_replacement, primary_class),
            (successor_path, successor, "hard"),
        ]
    )
    if default_errors:
        return None, (
            "Standardvals-flytten ger inget giltigt slutläge — inget ändrades:\n"
            + "\n".join(f"- {error}" for error in default_errors)
        )
    return successor, None


def _save_manifest_with_default_handoff(
    primary_path: Path,
    primary_manifest: dict[str, Any],
    *,
    primary_class: str,
    successor_path: Path,
    primary_original: bytes,
) -> tuple[bool, str]:
    """Back up and write a two-manifest handoff, rolling both back on failure."""
    if not _matches_file_snapshot(primary_path, primary_original):
        return False, (
            "Det nuvarande Standardvalet ändrades efter att formuläret lästes. "
            "Ladda om och försök igen; inget skrevs."
        )
    successor_original, snapshot_error = _required_file_snapshot(successor_path)
    if snapshot_error or successor_original is None:
        return False, snapshot_error or "Kunde inte läsa det nya Standardvalet."
    successor, error = _prepare_default_handoff(
        primary_path,
        primary_manifest,
        primary_class=primary_class,
        successor_path=successor_path,
    )
    if error or successor is None:
        return False, error or "Standardvals-flytten kunde inte förberedas."
    if not _matches_file_snapshot(
        primary_path, primary_original
    ) or not _matches_file_snapshot(successor_path, successor_original):
        return False, (
            "Ett av manifesten ändrades medan Standardvals-flytten förbereddes. "
            "Ladda om och försök igen; inget skrevs."
        )
    originals = {
        primary_path: primary_original,
        successor_path: successor_original,
    }
    backups = [backup_file(path, _facade().REPO_ROOT) for path in originals]
    if any(path is None for path in backups):
        return False, "Kunde inte säkerhetskopiera båda manifesten — inget ändrades."
    try:
        # Successorn skrivs först: om processen avbryts mellan filerna finns
        # åtminstone ett explicit default kvar. Ett fåtal millisekunders dubbel
        # default är säkrare än ett permanent ägarlöst live-läge.
        _save_json(successor_path, successor)
        _save_json(primary_path, primary_manifest)
    except BaseException as exc:
        rollback_errors: list[str] = []
        for path, content in originals.items():
            try:
                rollback_error = _restore_file_bytes(path, content)
                if rollback_error:
                    rollback_errors.append(f"{path}: {rollback_error}")
            except OSError as rollback_exc:
                rollback_errors.append(f"{path}: {rollback_exc}")
        if not isinstance(exc, OSError):
            if rollback_errors and hasattr(exc, "add_note"):
                exc.add_note(
                    "Rollbacken blev ofullständig: " + "; ".join(rollback_errors)
                )
            raise
        if rollback_errors:
            return False, (
                f"Standardvals-flytten misslyckades ({exc}) och rollbacken blev ofullständig:\n"
                + "\n".join(f"- {item}" for item in rollback_errors)
            )
        return (
            False,
            f"Standardvals-flytten misslyckades ({exc}) — båda manifesten rullades tillbaka.",
        )
    return True, ""


@_dossier_mutation_locked
def _save_raw_manifest(
    manifest_path: Path, manifest: dict[str, Any], *, dossier_class: str
) -> tuple[bool, str]:
    """Fail-closed raw-editor write: class-aware pre-check + strict schema
    before the shared backup/write helper. Raw JSON gives access to every
    schema field, not permission to bypass the runtime contract."""
    original, snapshot_error = _required_file_snapshot(manifest_path)
    if snapshot_error or original is None:
        return False, snapshot_error or "Kunde inte läsa manifestet — sparade inte."
    identity_error = _manifest_identity_error(
        manifest_path, manifest, dossier_class=dossier_class
    )
    if identity_error:
        return False, identity_error
    errors = _validate_manifest(manifest, dossier_class)
    if errors:
        return False, "Validering misslyckades — sparade inte:\n" + "\n".join(
            f"- {error}" for error in errors
        )
    try:
        schema_errors = validate_json_against_schema(
            manifest, _facade().STRICT_SCHEMA_PATH
        )
    except Exception as exc:  # noqa: BLE001 - fail closed, never save unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — sparade inte:\n"
            + "\n".join(f"- {error}" for error in schema_errors)
        )
    default_errors = _default_invariant_errors_after_change(
        manifest_path, manifest, dossier_class=dossier_class
    )
    if default_errors:
        guidance = (
            "\nVälj ett nytt Standardval i formuläret; båda manifesten sparas då tillsammans."
            if any("no resolvable default demo" in error for error in default_errors)
            else ""
        )
        return False, (
            "Standardvalsregeln (samma regel som dossiers:validate-all) "
            "misslyckades — sparade inte:\n"
            + "\n".join(f"- {error}" for error in default_errors)
            + guidance
        )
    return _commit_single_manifest(
        manifest_path, manifest, original, operation="råredigeringen"
    )


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


_MANIFEST_SOURCE_RE = re.compile(r"^data/dossiers/(?:hard|soft)/[^/]+/manifest\.json$")


def _is_repo_relative_key(key: str) -> bool:
    """Reject absolute or parent-escaping keys from a corrupt/hand-edited map.

    Keys are joined onto ``REPO_ROOT`` and read, so anything that could escape
    the repo — or that pathlib would treat as an absolute path and silently
    substitute for the base — must not become a path at all.
    """
    if (
        not key
        or key.startswith("/")
        or key.startswith("\\")
        or "\\" in key
        or ":" in key
    ):
        return False
    return ".." not in key.split("/")


def _capability_map_source_paths(
    current: dict[str, Any],
) -> list[tuple[str, Path]] | None:
    """The files the TS projection itself says it depends on, plus manifests.

    Returns ``(repo-relative key, absolute path)`` pairs. The non-manifest paths
    are read out of the projection's own ``sourceFiles`` keys rather than a
    Python copy of ``FIXED_SOURCE_PATHS`` — one owner, no second list to drift.
    Manifests are globbed here instead, because an added/removed dossier
    directory is by definition absent from the stored keys; globbing is what
    makes pool changes detectable at all.

    Known limit (accepted, see plan 01 step 6): if TypeScript *adds* a fixed
    source path and nobody regenerates, Python cannot know about it. The CI
    staleness gate (`npm run dossiers:capability-map:check`) is what keeps
    master's projection fresh, so the stored key set is current in any clean
    checkout.
    """
    stored = current.get("sourceFiles")
    if not isinstance(stored, dict):
        return None
    fixed = sorted(
        key
        for key in stored
        if isinstance(key, str)
        and not _MANIFEST_SOURCE_RE.match(key)
        and _is_repo_relative_key(key)
    )
    if not fixed:
        return None
    repo_root = _facade().REPO_ROOT
    entries = [(key, repo_root / key) for key in fixed]
    for klass in ("hard", "soft"):
        for path in sorted((_facade().DOSSIER_ROOT / klass).glob("*/manifest.json")):
            entries.append((path.relative_to(repo_root).as_posix(), path))
    return sorted(entries, key=lambda entry: entry[0])


def _capability_map_source_fingerprints(
    current: dict[str, Any],
) -> dict[str, str] | None:
    entries = _capability_map_source_paths(current)
    if entries is None:
        return None
    fingerprints: dict[str, str] = {}
    try:
        for relative, path in entries:
            # Match TS `sha256File`: hash LF-normalized bytes so Windows CRLF
            # writes cannot drift the capability-map sourceFiles gate vs CI.
            fingerprints[relative] = hashlib.sha256(
                path.read_bytes().replace(b"\r\n", b"\n")
            ).hexdigest()
    except OSError:
        return None
    return dict(sorted(fingerprints.items()))


def _capability_map_is_stale(current: dict[str, Any]) -> bool:
    """Compare exact source hashes, not mtimes/counts, with the TS projection."""
    expected = _capability_map_source_fingerprints(current)
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
        and isinstance(current.get("labelsSv"), dict)
        and isinstance(current.get("policy"), dict)
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
            and isinstance(refreshed.get("labelsSv"), dict)
            and isinstance(refreshed.get("policy"), dict)
            and not _capability_map_is_stale(refreshed)
        ):
            return refreshed, None
        output = (
            output
            + "\nGeneratorn avslutades grönt men projektionen är fortfarande ofullständig."
        )
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


def _groups_view_is_stale(
    groups: dict[str, Any], dossiers: list[dict[str, Any]]
) -> bool:
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
    live = {
        str(d.get("capability") or "").strip().lower()
        for d in dossiers
        if d.get("capability")
    }
    return not live.issubset(covered)


@_dossier_mutation_locked
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
        dir_name = (
            str(d.get("_path") or "").replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
        )
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


@_dossier_mutation_locked
def _apply_manifest_field_edits(
    manifest_path: Path,
    updates: dict[str, Any],
    *,
    dossier_class: str,
    replacement_default_path: Path | None = None,
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
    original, snapshot_error = _required_file_snapshot(manifest_path)
    if snapshot_error or original is None:
        return False, f"Kunde inte läsa `{manifest_path}` (saknad eller ogiltig JSON)."
    try:
        manifest = json.loads(original.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False, f"Kunde inte läsa `{manifest_path}` (saknad eller ogiltig JSON)."
    identity_error = _manifest_identity_error(
        manifest_path, manifest, dossier_class=dossier_class
    )
    if identity_error:
        return False, identity_error
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
        schema_errors = validate_json_against_schema(
            manifest, _facade().STRICT_SCHEMA_PATH
        )
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
        if (
            mock_value is None or mock_value == "none"
        ) and capability not in exceptions:
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
                "`npm run dossiers:validate-all`). Öppna det nuvarande Standardvalet, "
                f"avmarkera kryssrutan och välj `{manifest.get('id')}` som nytt "
                "Standardval i samma formulär; flytten sparas då atomiskt. "
                "Sparade inte."
            )
    if replacement_default_path is not None:
        return _save_manifest_with_default_handoff(
            manifest_path,
            manifest,
            primary_class=dossier_class,
            successor_path=replacement_default_path,
            primary_original=original,
        )
    default_errors = _default_invariant_errors_after_change(
        manifest_path, manifest, dossier_class=dossier_class
    )
    if default_errors:
        guidance = (
            "\nVälj ett nytt Standardval i formuläret; båda manifesten sparas då tillsammans."
            if any("no resolvable default demo" in error for error in default_errors)
            else ""
        )
        return False, (
            "Standardvalsregeln (samma regel som dossiers:validate-all) "
            "misslyckades — sparade inte:\n"
            + "\n".join(f"- {error}" for error in default_errors)
            + guidance
        )
    return _commit_single_manifest(
        manifest_path, manifest, original, operation="redigeringen"
    )


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


def _tree_byte_snapshot(
    root: Path,
) -> tuple[dict[str, bytes | None] | None, str | None]:
    """Capture directory names and file bytes for a later draft CAS check."""
    snapshot: dict[str, bytes | None] = {}
    try:
        for path in sorted(root.rglob("*")):
            if _is_link_like(path):
                return None, f"Länkar tillåts inte i transaktionskällan: {path}"
            key = path.relative_to(root).as_posix()
            snapshot[key] = None if path.is_dir() else path.read_bytes()
    except OSError as exc:
        return None, f"Kunde inte läsa transaktionskällan: {exc}"
    return snapshot, None


def _matches_tree_snapshot(root: Path, expected: dict[str, bytes | None]) -> bool:
    current, error = _tree_byte_snapshot(root)
    return error is None and current == expected


def _cleanup_tree(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        shutil.rmtree(path)
    except BaseException as exc:
        return str(exc)
    return None


def _transaction_root() -> tuple[Path | None, str | None]:
    """Return the ignored, same-volume workspace outside the live dossier pool."""
    repo_root = _facade().REPO_ROOT.resolve()
    try:
        current = repo_root
        for segment in ("data", "backoffice", "staging", "dossiers"):
            candidate = current / segment
            if candidate.exists() or _is_link_like(candidate):
                if _is_link_like(candidate):
                    return None, (
                        f"Transaktionsytan innehåller en länk/junction: {candidate}"
                    )
            else:
                candidate.mkdir()
            resolved_candidate = candidate.resolve(strict=True)
            if (
                repo_root != resolved_candidate
                and repo_root not in resolved_candidate.parents
            ):
                return None, "Transaktionsytan lämnar repots verifierade rot."
            current = candidate
        resolved = current.resolve(strict=True)
    except OSError as exc:
        return None, f"Kunde inte verifiera transaktionsytan: {exc}"
    if repo_root not in resolved.parents:
        return None, "Transaktionsytan ligger utanför repot."
    return resolved, None


def _verified_transaction_stage(path: Path) -> tuple[Path | None, str | None]:
    root, error = _transaction_root()
    if error or root is None:
        return None, error or "Transaktionsytan saknas."
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        return None, f"Stage saknas eller är oläsbar: {exc}"
    if resolved.parent != root or _is_link_like(path):
        return None, "Stage ligger inte direkt under den verifierade transaktionsytan."
    return resolved, None


def _cleanup_verified_transaction_stage(path: Path) -> str | None:
    resolved, error = _verified_transaction_stage(path)
    if error or resolved is None:
        return error or "Osäker stage sökväg; cleanup vägrades."
    return _cleanup_tree(resolved)


def _allocate_curated_dossier_stage(target_id: str) -> tuple[bool, str]:
    if not _facade()._KEBAB_RE.match(target_id):
        return False, "Ogiltigt dossier-id för stage-allokering."
    root, error = _transaction_root()
    if error or root is None:
        return False, error or "Transaktionsytan kunde inte verifieras."
    staged_dir = root / f"_{target_id}.curate-stage-{uuid4().hex}"
    try:
        staged_dir.mkdir(exist_ok=False)
    except OSError as exc:
        return False, f"Kunde inte skapa kurations-stage: {exc}"
    return True, str(staged_dir)


def _cleanup_curated_dossier_stage(staged_dir: Path) -> tuple[bool, str]:
    root, root_error = _transaction_root()
    if root_error or root is None:
        return False, root_error or "Transaktionsytan kunde inte verifieras."
    try:
        parent = staged_dir.parent.resolve(strict=True)
    except OSError as exc:
        return False, f"Stage-föräldern kunde inte verifieras: {exc}"
    if parent != root or ".curate-stage-" not in staged_dir.name:
        return False, "Cleanup vägrades för en osäker stage-sökväg."
    if not staged_dir.exists() and not _is_link_like(staged_dir):
        return True, "Kurations-stage var redan bortstädad."
    cleanup_error = _cleanup_verified_transaction_stage(staged_dir)
    if cleanup_error:
        return False, cleanup_error
    return True, "Kurations-stage städades bort."


def _verified_live_target(
    dossier_class: str, dossier_id: str
) -> tuple[Path | None, str | None]:
    """Verify/create the configured live root without following reparse parents."""
    if dossier_class not in ("hard", "soft") or not _facade()._KEBAB_RE.match(
        dossier_id
    ):
        return None, "Ogiltig live target-klass eller id."
    repo_root = _facade().REPO_ROOT.resolve()
    raw_pool = _facade().DOSSIER_ROOT
    try:
        relative_pool = raw_pool.relative_to(repo_root)
    except ValueError:
        return None, "Dossier-poolen ligger utanför repot."
    current = repo_root
    try:
        for segment in (*relative_pool.parts, dossier_class):
            candidate = current / segment
            if candidate.exists() or _is_link_like(candidate):
                if _is_link_like(candidate):
                    return (
                        None,
                        f"Live-sökvägen innehåller en länk/junction: {candidate}",
                    )
                if not candidate.is_dir():
                    return None, f"Live-sökvägen är inte en katalog: {candidate}"
            else:
                candidate.mkdir()
            resolved = candidate.resolve(strict=True)
            if repo_root not in resolved.parents:
                return None, "Live-sökvägen lämnar repots verifierade rot."
            current = candidate
    except OSError as exc:
        return None, f"Kunde inte verifiera live-sökvägen: {exc}"
    target = current / dossier_id
    if _is_link_like(target):
        return None, "Måldossiern är en länk/junction."
    if target.exists():
        try:
            if not target.is_dir():
                return None, "Måldossiern finns men är inte en katalog."
            if target.resolve(strict=True).parent != current.resolve(strict=True):
                return None, "Måldossiern lämnar den verifierade klassroten."
        except OSError as exc:
            return None, f"Kunde inte verifiera måldossiern: {exc}"
    return target, None


def _dossier_pool_manifest_snapshot() -> tuple[dict[str, bytes] | None, str | None]:
    snapshot: dict[str, bytes] = {}
    for dossier_class in ("hard", "soft"):
        class_target, error = _verified_live_target(dossier_class, "snapshot-probe")
        if error or class_target is None:
            return None, error or "Kunde inte verifiera dossier-poolen."
        class_root = class_target.parent
        try:
            for dossier_dir in sorted(class_root.iterdir()):
                if _is_link_like(dossier_dir):
                    return (
                        None,
                        f"Dossier-poolen innehåller en länk/junction: {dossier_dir}",
                    )
                manifest_path = dossier_dir / "manifest.json"
                if manifest_path.is_file():
                    if _is_link_like(manifest_path):
                        return None, f"Manifestet är en länk/junction: {manifest_path}"
                    snapshot[f"{dossier_class}/{dossier_dir.name}"] = (
                        manifest_path.read_bytes()
                    )
        except OSError as exc:
            return None, f"Kunde inte snapshotta dossier-poolen: {exc}"
    return snapshot, None


def _matches_dossier_pool_snapshot(expected: dict[str, bytes]) -> bool:
    current, error = _dossier_pool_manifest_snapshot()
    return error is None and current == expected


def _swap_staged_directory(
    target_dir: Path,
    staged_dir: Path,
    *,
    operation: str,
) -> tuple[bool, str]:
    """Atomically expose a staged tree and restore the old tree on failure."""
    transaction_root, root_error = _transaction_root()
    if root_error or transaction_root is None:
        return False, root_error or "Transaktionsytan saknas."
    verified_stage, stage_error = _verified_transaction_stage(staged_dir)
    if stage_error or verified_stage is None:
        return False, stage_error or "Stage kunde inte verifieras."
    staged_dir = verified_stage
    old_dir = transaction_root / f"_{target_dir.name}.replaced-{uuid4().hex}"
    had_old = target_dir.exists()
    try:
        if had_old:
            target_dir.rename(old_dir)
        staged_dir.rename(target_dir)
    except BaseException as exc:
        rollback_errors: list[str] = []
        if target_dir.exists() and not staged_dir.exists():
            try:
                target_dir.rename(staged_dir)
            except BaseException as rollback_exc:
                rollback_errors.append(f"nytt träd: {rollback_exc}")
        if old_dir.exists() and not target_dir.exists():
            try:
                old_dir.rename(target_dir)
            except BaseException as rollback_exc:
                rollback_errors.append(f"gammalt träd: {rollback_exc}")
        cleanup_error = _cleanup_tree(staged_dir)
        if cleanup_error:
            rollback_errors.append(f"stage: {cleanup_error}")
        if not isinstance(exc, OSError):
            if rollback_errors and hasattr(exc, "add_note"):
                exc.add_note(
                    "Rollbacken blev ofullständig: " + "; ".join(rollback_errors)
                )
            raise
        if rollback_errors:
            return False, (
                f"{operation} misslyckades ({exc}) och rollbacken blev ofullständig: "
                + "; ".join(rollback_errors)
            )
        return False, f"{operation} misslyckades ({exc}); live-trädet återställdes."

    cleanup_warning = _cleanup_tree(old_dir)
    if cleanup_warning:
        return True, (
            f"{operation} slutfördes, men en ignorerad ersättningskatalog kunde "
            f"inte städas bort ({cleanup_warning})."
        )
    return True, ""


@_dossier_mutation_locked
def _delete_dossier_dir(
    chosen: dict[str, Any], *, replacement_default_path: Path | None = None
) -> tuple[bool, str]:
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
        return (
            False,
            f"`{rel_path}` är en symlink/junction — raderas manuellt, inte härifrån.",
        )
    target_dir = raw_dir.resolve()
    klass_root = (_facade().DOSSIER_ROOT / str(chosen.get("_class") or "")).resolve()
    if klass_root not in target_dir.parents:
        return (
            False,
            f"Sökvägen ligger utanför dossier-poolen: `{rel_path}` — inget raderades.",
        )
    if not target_dir.exists():
        return False, f"Katalogen finns inte längre: `{rel_path}`."
    manifest_path = target_dir / "manifest.json"
    dossier_class = str(chosen.get("_class") or "")
    primary_original, snapshot_error = _required_file_snapshot(manifest_path)
    if snapshot_error or primary_original is None:
        return False, snapshot_error or "Kunde inte läsa dossiern före radering."
    try:
        primary_manifest = json.loads(primary_original.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False, "Dossierns manifest är oläsbart — inget raderades."
    identity_error = _manifest_identity_error(
        manifest_path, primary_manifest, dossier_class=dossier_class
    )
    if identity_error or target_id != target_dir.name:
        return False, (
            identity_error
            or "Valt id, manifest.id och katalognamn matchar inte — inget raderades."
        )
    successor: dict[str, Any] | None = None
    successor_original: bytes | None = None
    if replacement_default_path is not None:
        successor_original, snapshot_error = _required_file_snapshot(
            replacement_default_path
        )
        if snapshot_error or successor_original is None:
            return False, snapshot_error or "Kunde inte läsa det nya Standardvalet."
        successor, handoff_error = _prepare_default_handoff(
            manifest_path,
            None,
            primary_class=dossier_class,
            successor_path=replacement_default_path,
        )
        if handoff_error or successor is None:
            return False, handoff_error or "Standardvals-flytten kunde inte förberedas."
    else:
        default_errors = _default_invariant_errors_after_change(
            manifest_path, None, dossier_class=dossier_class
        )
        if default_errors:
            return False, (
                "Standardvalsregeln (samma regel som dossiers:validate-all) "
                "skulle brytas — inget raderades:\n"
                + "\n".join(f"- {error}" for error in default_errors)
                + "\nVälj ett nytt Standardval i raderingsformuläret och försök igen."
            )
    if not _matches_file_snapshot(manifest_path, primary_original):
        return False, (
            "Dossiern ändrades medan raderingen förbereddes. "
            "Ladda om och försök igen; inget raderades."
        )
    if (
        replacement_default_path is not None
        and successor_original is not None
        and not _matches_file_snapshot(replacement_default_path, successor_original)
    ):
        return False, (
            "Det nya Standardvalet ändrades medan raderingen förbereddes. "
            "Ladda om och försök igen; inget raderades."
        )
    transaction_root, transaction_error = _transaction_root()
    if transaction_error or transaction_root is None:
        return False, transaction_error or "Transaktionsytan kunde inte verifieras."
    # Fail-closed: radera inte om zip-snapshoten (Återställning) inte kunde tas.
    tree_snapshot = backup_tree(target_dir, _facade().REPO_ROOT)
    if tree_snapshot is None:
        return False, (
            f"Kunde inte ta zip-snapshot av `{rel_path}` — "
            "avbröt raderingen, inget raderades."
        )
    if successor is not None and replacement_default_path is not None:
        if backup_file(replacement_default_path, _facade().REPO_ROOT) is None:
            return (
                False,
                "Kunde inte säkerhetskopiera det nya Standardvalet — inget raderades.",
            )

    quarantine_dir = transaction_root / (
        f"_{target_dir.name}.backoffice-delete-{uuid4().hex}"
    )

    def restore_successor() -> str | None:
        if successor_original is None or replacement_default_path is None:
            return None
        try:
            _atomic_replace_bytes(replacement_default_path, successor_original)
        except BaseException as rollback_exc:
            return str(rollback_exc)
        return None

    def restore_primary_from_snapshot() -> str | None:
        if target_dir.exists():
            return None
        try:
            shutil.unpack_archive(str(tree_snapshot), str(target_dir))
        except BaseException as rollback_exc:
            return str(rollback_exc)
        return None

    if successor is not None and replacement_default_path is not None:
        try:
            _save_json(replacement_default_path, successor)
        except BaseException as exc:
            successor_rollback_error = restore_successor()
            if not isinstance(exc, OSError):
                if successor_rollback_error and hasattr(exc, "add_note"):
                    exc.add_note(
                        f"Successor-rollbacken misslyckades: {successor_rollback_error}"
                    )
                raise
            if successor_rollback_error:
                return False, (
                    f"Kunde inte skriva det nya Standardvalet ({exc}) och rollbacken "
                    f"blev ofullständig (successor={successor_rollback_error}). "
                    "Återställ från backup."
                )
            return False, (
                f"Kunde inte skriva det nya Standardvalet ({exc}) — successor "
                "rullades tillbaka och live-katalogen rördes inte."
            )
    if not _matches_file_snapshot(manifest_path, primary_original):
        successor_rollback_error = restore_successor()
        return False, (
            "Dossiern ändrades före quarantine-flytten; successor återställdes"
            + (
                f" inte ({successor_rollback_error})"
                if successor_rollback_error
                else ""
            )
            + ". Ladda om och försök igen."
        )
    try:
        target_dir.rename(quarantine_dir)
    except BaseException as exc:
        primary_rollback_error: str | None = None
        if not target_dir.exists():
            try:
                quarantine_dir.rename(target_dir)
            except BaseException:
                primary_rollback_error = restore_primary_from_snapshot()
        # Restore the old default before clearing the promoted successor. If
        # this rollback is itself interrupted, live state still has at least
        # one default instead of briefly becoming ownerless.
        successor_rollback_error = restore_successor()
        rollback_errors = [
            error
            for error in (successor_rollback_error, primary_rollback_error)
            if error
        ]
        if not isinstance(exc, OSError):
            if rollback_errors and hasattr(exc, "add_note"):
                exc.add_note(
                    "Rollbacken blev ofullständig: " + "; ".join(rollback_errors)
                )
            raise
        if rollback_errors:
            return False, (
                f"Quarantine-flytten misslyckades ({exc}) och rollbacken blev "
                f"ofullständig ({'; '.join(rollback_errors)}). Återställ från backup."
            )
        return False, (
            f"Kunde inte flytta `{rel_path}` till säker quarantine ({exc}) — "
            "live-katalogen och successor återställdes."
        )
    try:
        shutil.rmtree(quarantine_dir)
    except BaseException as exc:
        # Primary first preserves the at-least-one-default invariant even if
        # rollback is interrupted by a second process-level exception.
        primary_rollback_error = restore_primary_from_snapshot()
        successor_rollback_error = restore_successor()
        rollback_errors = [
            error
            for error in (successor_rollback_error, primary_rollback_error)
            if error
        ]
        if not isinstance(exc, OSError):
            if rollback_errors and hasattr(exc, "add_note"):
                exc.add_note(
                    "Rollbacken blev ofullständig: " + "; ".join(rollback_errors)
                )
            raise
        if successor_rollback_error or primary_rollback_error:
            return False, (
                f"Quarantine-raderingen misslyckades ({exc}) och rollbacken blev "
                f"ofullständig (successor={successor_rollback_error}, "
                f"primär={primary_rollback_error}). Återställ från backup."
            )
        return False, (
            f"Quarantine-raderingen misslyckades ({exc}) — live-trädet och "
            "Standardvalet återställdes byte-exakt från snapshot. En ignorerad "
            f"quarantine-rest kan ligga kvar i `{quarantine_dir.name}`."
        )
    return True, (
        f"Raderade `{rel_path}`.\n\n"
        + (
            "Standardvalet flyttades atomiskt till det valda syskonet.\n\n"
            if successor
            else ""
        )
        + "Nästa steg: bygg om capability-map (Kontroller-tabben) och kör "
        "`npm run dossiers:validate-all`. Ångra: en zip-snapshot av katalogen "
        "togs precis före raderingen — återställ den via sidan **Återställning** "
        "(git funkar också för redan incheckade byggblock)."
    )


def _list_template_refs() -> list[str]:
    if not _facade().TEMPLATE_REFS_ROOT.exists():
        return []
    return sorted(d.name for d in _facade().TEMPLATE_REFS_ROOT.iterdir() if d.is_dir())


def _run_curate(
    reference_id: str,
    target_class: str,
    target_id: str,
    model: str = "",
    capability: str = "",
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
    if capability.strip():
        cmd.append(f"--capability={capability.strip()}")
    try:
        result = subprocess.run(
            cmd,
            cwd=str(_facade().REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
        out = (result.stdout or "") + (result.stderr or "")
        return result.returncode == 0, out
    except subprocess.TimeoutExpired:
        return (
            False,
            "Kurations-skriptet tog mer än 5 minuter — kör från terminal istället.",
        )
    except FileNotFoundError as exc:
        return False, f"Saknar binär: {exc}"


@_dossier_mutation_locked
def _commit_curated_dossier_stage(
    staged_dir: Path, target_class: str, target_id: str, *, force: bool
) -> tuple[bool, str]:
    """Validate and atomically publish a TS-generated sibling stage."""
    if target_class not in ("hard", "soft") or not _facade()._KEBAB_RE.match(target_id):
        return False, "Ogiltig klass eller dossier-id för kurations-commit."
    resolved_stage, stage_error = _verified_transaction_stage(staged_dir)
    if stage_error or resolved_stage is None:
        return False, stage_error or "Kurations-stage kunde inte verifieras."
    staged_dir = resolved_stage
    if not staged_dir.name.startswith(f"_{target_id}.curate-stage-"):
        _cleanup_tree(staged_dir)
        return False, "Kurations-stage har inte rätt transaktionsnamn."
    staged_snapshot, snapshot_error = _tree_byte_snapshot(staged_dir)
    if snapshot_error or staged_snapshot is None:
        _cleanup_tree(staged_dir)
        return False, snapshot_error or "Kunde inte läsa kurations-stage."
    if set(staged_snapshot) != {"manifest.json", "instructions.md"}:
        _cleanup_tree(staged_dir)
        return False, "Kurations-stage innehåller oväntade filer eller kataloger."
    manifest_bytes = staged_snapshot["manifest.json"]
    instructions_bytes = staged_snapshot["instructions.md"]
    try:
        if not isinstance(manifest_bytes, bytes) or not isinstance(
            instructions_bytes, bytes
        ):
            raise ValueError("manifest/instructions är inte filer")
        manifest = json.loads(manifest_bytes.decode("utf-8"))
        instructions_bytes.decode("utf-8")
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        _cleanup_tree(staged_dir)
        return False, f"Kurations-stage är ofullständig eller ogiltig: {exc}"
    if manifest.get("id") != target_id:
        _cleanup_tree(staged_dir)
        return False, "Kurations-stage manifest.id matchar inte målkatalogen."
    errors = _validate_manifest(manifest, target_class)
    try:
        schema_errors = validate_json_against_schema(
            manifest, _facade().STRICT_SCHEMA_PATH
        )
    except Exception as exc:  # noqa: BLE001 - fail closed at the live boundary
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if errors or schema_errors:
        _cleanup_tree(staged_dir)
        return False, "Kurations-stage är ogiltig:\n" + "\n".join(
            f"- {error}" for error in [*errors, *schema_errors]
        )
    target_dir, target_error = _verified_live_target(target_class, target_id)
    if target_error or target_dir is None:
        _cleanup_tree(staged_dir)
        return False, target_error or "Måldossiern kunde inte verifieras."
    if target_dir.exists() and not force:
        _cleanup_tree(staged_dir)
        return (
            False,
            f"Dossier finns redan: `{target_dir}`. Använd --force för att ersätta.",
        )
    target_snapshot = None
    if target_dir.exists():
        target_snapshot, snapshot_error = _tree_byte_snapshot(target_dir)
        if snapshot_error or target_snapshot is None:
            _cleanup_tree(staged_dir)
            return False, snapshot_error or "Kunde inte läsa befintlig dossier."
        merged_stage = dict(target_snapshot)
        merged_stage["manifest.json"] = manifest_bytes
        merged_stage["instructions.md"] = instructions_bytes
        try:
            for relative, content in target_snapshot.items():
                if relative in {"manifest.json", "instructions.md"}:
                    continue
                destination = staged_dir / Path(relative)
                if content is None:
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(content)
        except BaseException as exc:
            cleanup_error = _cleanup_tree(staged_dir)
            if not isinstance(exc, OSError):
                if cleanup_error and hasattr(exc, "add_note"):
                    exc.add_note(f"Stage-cleanup misslyckades: {cleanup_error}")
                raise
            return (
                False,
                f"Kunde inte bevara befintligt dossierinnehåll ({exc}); "
                "live-poolen ändrades inte."
                + (
                    f" Stage-cleanup misslyckades: {cleanup_error}"
                    if cleanup_error
                    else ""
                ),
            )
        if not _matches_tree_snapshot(staged_dir, merged_stage):
            _cleanup_tree(staged_dir)
            return False, "Kunde inte byte-exakt stagea befintligt dossierinnehåll."
        staged_snapshot = merged_stage
    pool_snapshot, snapshot_error = _dossier_pool_manifest_snapshot()
    if snapshot_error or pool_snapshot is None:
        _cleanup_tree(staged_dir)
        return False, snapshot_error or "Kunde inte snapshotta dossier-poolen."
    default_errors = _default_invariant_errors_after_change(
        target_dir / "manifest.json", manifest, dossier_class=target_class
    )
    if default_errors:
        _cleanup_tree(staged_dir)
        return False, (
            "Standardvalsregeln misslyckades — kurations-stage publicerades inte:\n"
            + "\n".join(f"- {error}" for error in default_errors)
        )
    if not _matches_tree_snapshot(staged_dir, staged_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Kurations-stage ändrades under valideringen; inget publicerades."
    if target_snapshot is None:
        if target_dir.exists():
            _cleanup_tree(staged_dir)
            return False, (
                "Måldossiern skapades av en annan session före commit; "
                "inget publicerades."
            )
    else:
        if not _matches_tree_snapshot(target_dir, target_snapshot):
            _cleanup_tree(staged_dir)
            return False, "Måldossiern ändrades under valideringen; inget publicerades."
        try:
            target_backup = backup_tree(target_dir, _facade().REPO_ROOT)
        except BaseException:
            _cleanup_verified_transaction_stage(staged_dir)
            raise
        if target_backup is None:
            _cleanup_tree(staged_dir)
            return False, "Kunde inte säkerhetskopiera måldossiern; inget publicerades."
        if not _matches_tree_snapshot(target_dir, target_snapshot):
            _cleanup_tree(staged_dir)
            return False, "Måldossiern ändrades före commit; inget publicerades."
    if not _matches_dossier_pool_snapshot(pool_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Dossier-poolen ändrades efter projektionen; inget publicerades."
    if not _matches_tree_snapshot(staged_dir, staged_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Kurations-stage ändrades före commit; inget publicerades."
    ok, warning = _swap_staged_directory(
        target_dir, staged_dir, operation="Kurations-commit"
    )
    if not ok:
        return False, warning
    rel = target_dir.relative_to(_facade().REPO_ROOT)
    return True, f"Publicerade kurations-stage till `{rel}`." + (
        f"\n{warning}" if warning else ""
    )


@_dossier_mutation_locked
def _apply_capability_override(
    manifest_path: Path,
    target_class: str,
    capability: str,
    *,
    replacement_default_path: Path | None = None,
) -> tuple[bool, str]:
    """Overwrite a freshly-curated draft's `capability` with the dossier-grupp
    capability the curator explicitly picked, so a brand-new dossier lands on
    a decided capability instead of whatever the LLM guessed. Runs AFTER
    `curate-from-reference.ts` has already written + AJV-validated the
    manifest — this does not touch the script or its LLM contract. Fail-closed:
    nothing is saved unless BOTH the light pre-check and the strict schema
    (same gate as `_promote_prospect`) pass on the patched manifest."""
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", capability):
        return False, f"Ogiltig capability (måste vara kebab-case): {capability!r}"
    original, snapshot_error = _required_file_snapshot(manifest_path)
    if snapshot_error or original is None:
        return (
            False,
            f"Kunde inte läsa {manifest_path.relative_to(_facade().REPO_ROOT)} efter kurationen.",
        )
    try:
        manifest = json.loads(original.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return (
            False,
            f"Kunde inte läsa {manifest_path.relative_to(_facade().REPO_ROOT)} efter kurationen.",
        )
    identity_error = _manifest_identity_error(
        manifest_path, manifest, dossier_class=target_class
    )
    if identity_error:
        return False, identity_error
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
        return False, "Manifestet blev ogiltigt efter capability-bytet:\n" + "\n".join(
            f"- {e}" for e in errors
        )
    try:
        from backoffice.shared import validate_json_against_schema

        schema_errors = validate_json_against_schema(
            manifest, _facade().STRICT_SCHEMA_PATH
        )
    except Exception as exc:  # noqa: BLE001 - fail closed, never save unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades efter "
            "capability-bytet — sparar inte:\n"
            + "\n".join(f"- {e}" for e in schema_errors)
        )
    if replacement_default_path is not None:
        return _save_manifest_with_default_handoff(
            manifest_path,
            manifest,
            primary_class=target_class,
            successor_path=replacement_default_path,
            primary_original=original,
        )
    default_errors = _default_invariant_errors_after_change(
        manifest_path, manifest, dossier_class=target_class
    )
    if default_errors:
        guidance = (
            "\nVälj ett nytt Standardval i den gamla funktionen; manifesten sparas då tillsammans."
            if any("no resolvable default demo" in error for error in default_errors)
            else ""
        )
        return False, (
            "Standardvalsregeln (samma regel som dossiers:validate-all) "
            "misslyckades — sparar inte capability-bytet:\n"
            + "\n".join(f"- {error}" for error in default_errors)
            + guidance
        )
    return _commit_single_manifest(
        manifest_path, manifest, original, operation="capability-bytet"
    )


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
        groups.get(chosen_group_id, {}).get("capabilities") or []
        if chosen_group_id
        else []
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


def _run_normalize(
    only: str | None, run_all: bool, force: bool, model: str
) -> tuple[bool, str]:
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


@_dossier_mutation_locked
def _promote_prospect(
    root: Path, entry: dict[str, Any], force: bool
) -> tuple[bool, str]:
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
    if (
        not legacy_id
        or legacy_id in (".", "..")
        or Path(legacy_id).name != legacy_id
        or "/" in legacy_id
        or "\\" in legacy_id
    ):
        return False, "Ogiltigt legacyId (måste vara ett enda katalognamn)."
    # Kebab-case guard: also the containment guard — a valid kebab-case id has
    # no "/", "\\" or "." so it cannot escape data/dossiers/<class>/ via `..`.
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", str(target_id)):
        return False, f"Ogiltigt targetId (måste vara kebab-case): {target_id!r}"
    draft = root / legacy_id / "_v2-draft"
    manifest_path = draft / "manifest.json"
    if not manifest_path.exists():
        return (
            False,
            f"Inget utkast hittades ({manifest_path}). Kör normaliseringen först.",
        )
    try:
        root_resolved = root.resolve(strict=True)
        draft_resolved = draft.resolve(strict=True)
    except OSError as exc:
        return False, f"Kunde inte verifiera utkastets sökväg: {exc}"
    if draft_resolved.parent.parent != root_resolved:
        return False, "Utkastets sökväg ligger utanför prospect-roten — promotar inte."
    if _is_link_like(draft):
        return False, "Utkastskatalogen är en länk/junction — promotar inte."
    draft_snapshot, snapshot_error = _tree_byte_snapshot(draft)
    if snapshot_error or draft_snapshot is None:
        return False, snapshot_error or "Utkastet kunde inte läsas säkert."
    manifest_bytes = draft_snapshot.get("manifest.json")
    if not isinstance(manifest_bytes, bytes):
        return False, "Utkastets manifest.json kunde inte läsas (ogiltig JSON)."
    if not isinstance(draft_snapshot.get("instructions.md"), bytes):
        return False, "Utkastet saknar instructions.md — promotar inte."
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
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
        return False, "Manifest-validering misslyckades:\n" + "\n".join(
            f"- {e}" for e in errors
        )
    # Canonical strict-schema gate (additionalProperties:false, kebab/id/label
    # patterns, enum + length constraints) — the lightweight `_validate_manifest`
    # above misses these, so a manually-edited draft could otherwise be promoted
    # into a state the runtime registry (strict AJV) silently excludes.
    try:
        from backoffice.shared import validate_json_against_schema

        schema_errors = validate_json_against_schema(
            manifest, _facade().STRICT_SCHEMA_PATH
        )
    except Exception as exc:  # noqa: BLE001 - surface any failure, fail closed
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — promotar inte:\n"
            + "\n".join(f"- {e}" for e in schema_errors)
        )
    target_dir, target_error = _verified_live_target(klass, str(target_id))
    if target_error or target_dir is None:
        return False, target_error or "Måldossiern kunde inte verifieras."
    if target_dir.exists() and not force:
        rel = target_dir.relative_to(_facade().REPO_ROOT)
        return (
            False,
            f"Dossier finns redan: `{rel}`. Kryssa i 'Skriv över' för att ersätta.",
        )
    target_snapshot = None
    if target_dir.exists():
        target_snapshot, snapshot_error = _tree_byte_snapshot(target_dir)
        if snapshot_error or target_snapshot is None:
            return False, snapshot_error or "Befintlig dossier kunde inte läsas säkert."
    pool_snapshot, snapshot_error = _dossier_pool_manifest_snapshot()
    if snapshot_error or pool_snapshot is None:
        return False, snapshot_error or "Kunde inte snapshotta dossier-poolen."
    transaction_root, transaction_error = _transaction_root()
    if transaction_error or transaction_root is None:
        return False, transaction_error or "Transaktionsytan kunde inte verifieras."
    staged_dir = transaction_root / f"_{target_dir.name}.promote-stage-{uuid4().hex}"
    expected_stage: dict[str, bytes | None] = {
        "manifest.json": manifest_bytes,
        "instructions.md": draft_snapshot["instructions.md"],
    }
    expected_stage.update(
        {
            relative: content
            for relative, content in draft_snapshot.items()
            if relative == "components" or relative.startswith("components/")
        }
    )
    try:
        staged_dir.mkdir(parents=True, exist_ok=False)
        (staged_dir / "manifest.json").write_bytes(manifest_bytes)
        instructions_bytes = draft_snapshot["instructions.md"]
        assert isinstance(instructions_bytes, bytes)
        (staged_dir / "instructions.md").write_bytes(instructions_bytes)
        for relative, content in draft_snapshot.items():
            if relative != "components" and not relative.startswith("components/"):
                continue
            destination = staged_dir / Path(relative)
            if content is None:
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(content)
    except BaseException as exc:
        cleanup_error = _cleanup_tree(staged_dir)
        if not isinstance(exc, OSError):
            if cleanup_error and hasattr(exc, "add_note"):
                exc.add_note(f"Stage-cleanup misslyckades: {cleanup_error}")
            raise
        return (
            False,
            f"Kunde inte stagea promotionen ({exc}); live-poolen ändrades inte."
            + (
                f" Stage-cleanup misslyckades: {cleanup_error}" if cleanup_error else ""
            ),
        )
    staged_snapshot, snapshot_error = _tree_byte_snapshot(staged_dir)
    if snapshot_error or staged_snapshot is None:
        _cleanup_tree(staged_dir)
        return False, snapshot_error or "Kunde inte läsa promotion-stage."
    if staged_snapshot != expected_stage:
        _cleanup_tree(staged_dir)
        return False, "Promotion-stage matchar inte det validerade utkastets bytes."
    try:
        staged_manifest = json.loads(
            (staged_snapshot["manifest.json"] or b"").decode("utf-8")
        )
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError):
        _cleanup_tree(staged_dir)
        return False, "Promotion-stage innehåller ett ogiltigt manifest."
    errors = _validate_manifest(staged_manifest, klass)
    try:
        schema_errors = validate_json_against_schema(
            staged_manifest, _facade().STRICT_SCHEMA_PATH
        )
    except Exception as exc:  # noqa: BLE001 - fail closed at the live boundary
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if errors or schema_errors:
        _cleanup_tree(staged_dir)
        return False, "Promotion-stage är ogiltig:\n" + "\n".join(
            f"- {error}" for error in [*errors, *schema_errors]
        )
    default_errors = _default_invariant_errors_after_change(
        target_dir / "manifest.json", staged_manifest, dossier_class=klass
    )
    if default_errors:
        _cleanup_tree(staged_dir)
        return False, (
            "Standardvalsregeln (samma regel som dossiers:validate-all) "
            "misslyckades — promotar inte:\n"
            + "\n".join(f"- {error}" for error in default_errors)
        )
    if not _matches_tree_snapshot(draft, draft_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Utkastet ändrades under valideringen; live-poolen ändrades inte."
    if not _matches_tree_snapshot(staged_dir, staged_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Promotion-stage ändrades under valideringen; inget skrevs."
    if target_snapshot is None:
        if target_dir.exists():
            _cleanup_tree(staged_dir)
            return False, "Måldossiern skapades av en annan session; inget skrevs."
    else:
        if not _matches_tree_snapshot(target_dir, target_snapshot):
            _cleanup_tree(staged_dir)
            return False, "Måldossiern ändrades under valideringen; inget skrevs."
        try:
            target_backup = backup_tree(target_dir, _facade().REPO_ROOT)
        except BaseException:
            _cleanup_verified_transaction_stage(staged_dir)
            raise
        if target_backup is None:
            _cleanup_tree(staged_dir)
            return False, "Kunde inte säkerhetskopiera måldossiern; inget skrevs."
        if not _matches_tree_snapshot(target_dir, target_snapshot):
            _cleanup_tree(staged_dir)
            return False, "Måldossiern ändrades före commit; inget skrevs."
    if not _matches_dossier_pool_snapshot(pool_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Dossier-poolen ändrades efter projektionen; inget skrevs."
    if not _matches_tree_snapshot(draft, draft_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Utkastet ändrades före commit; inget skrevs."
    if not _matches_tree_snapshot(staged_dir, staged_snapshot):
        _cleanup_tree(staged_dir)
        return False, "Promotion-stage ändrades före commit; inget skrevs."
    ok, swap_message = _swap_staged_directory(
        target_dir, staged_dir, operation="Promotionen"
    )
    if not ok:
        return False, swap_message
    rel = target_dir.relative_to(_facade().REPO_ROOT)
    return True, (
        f"Promoterade utkast till `{rel}`.\n\n"
        + (f"{swap_message}\n\n" if swap_message else "")
        + "Nästa steg: bygg om capability-map (Kontroller-tabben), kör "
        "`npm run dossiers:validate-all`, applicera kodfixarna i REVIEW och "
        "koppla ev. ny capability i brief-prompten + follow-up-vokabulären."
    )


@_dossier_mutation_locked
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
        return (
            False,
            "Fristående (soft) dossiers får inte deklarera providers — inget skapades.",
        )
    for provider in provider_values:
        if not _facade()._KEBAB_RE.match(provider):
            return False, (
                "Ogiltigt provider-id (kebab-case, t.ex. `vercel-analytics`): "
                f"{provider!r} — inget skapades."
            )
    mock_value = (mock or "").strip() or None
    if target_class == "hard":
        exceptions = _load_mockless_capability_exceptions()
        if (
            mock_value is None or mock_value == "none"
        ) and capability not in exceptions:
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
        schema_errors = validate_json_against_schema(
            manifest, _facade().STRICT_SCHEMA_PATH
        )
    except Exception as exc:  # noqa: BLE001 - fail closed, never write unvalidated
        schema_errors = [f"Strict-schemavalidering kunde inte köras: {exc}"]
    if schema_errors:
        return False, (
            "Strict-schema (samma regler som runtime/CI) misslyckades — inget skapades:\n"
            + "\n".join(f"- {e}" for e in schema_errors)
        )

    target_dir, target_error = _verified_live_target(target_class, target_id)
    if target_error or target_dir is None:
        return False, target_error or "Kunde inte verifiera målkatalogen."
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
    default_errors = _default_invariant_errors_after_change(
        target_dir / "manifest.json", manifest, dossier_class=target_class
    )
    if default_errors:
        return False, (
            "Standardvalsregeln (samma regel som dossiers:validate-all) "
            "misslyckades — inget skapades:\n"
            + "\n".join(f"- {error}" for error in default_errors)
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
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        (target_dir / "instructions.md").write_text(
            _facade()._INSTRUCTIONS_STUB,
            encoding="utf-8",
            newline="\n",
        )
    except BaseException as exc:
        # Rulla tillbaka katalogen vi själva just skapade. Utan detta lämnar ett
        # avbrott mellan de två skrivningarna ett halvskrivet byggblock kvar, och
        # eftersom en befintlig katalog aldrig skrivs över blockeras id:t för
        # gott. Bara våra egna två filer tas bort, och `rmdir` vägrar en icke-tom
        # katalog — rollbacken kan alltså inte radera något annat.
        rollback_errors: list[str] = []
        for name in ("manifest.json", "instructions.md"):
            try:
                (target_dir / name).unlink(missing_ok=True)
            except BaseException as rollback_exc:
                rollback_errors.append(f"{name}: {rollback_exc}")
        try:
            target_dir.rmdir()
        except BaseException as rollback_exc:
            rollback_errors.append(f"katalog: {rollback_exc}")
        if not isinstance(exc, OSError):
            if rollback_errors and hasattr(exc, "add_note"):
                exc.add_note(
                    "Rollbacken blev ofullständig: " + "; ".join(rollback_errors)
                )
            raise
        if rollback_errors:
            return False, (
                f"Skrivningen misslyckades ({exc}) och `{rel}` kunde inte städas "
                f"bort automatiskt ({'; '.join(rollback_errors)}). "
                "Ta bort katalogen manuellt innan du försöker "
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
