from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .context import find_repo_root
from .io import read_json

def _manifest_uri_format_is_valid(value: object) -> bool:
    """FormatChecker for JSON Schema ``format: "uri"`` on manifest URL fields.

    python-jsonschema does not assert string ``format`` keywords unless a
    ``FormatChecker`` is supplied, and its built-in ``uri`` checker additionally
    needs an optional dependency (``rfc3987`` / ``rfc3986-validator``) that is
    not in ``requirements.backoffice.txt``. This self-contained check mirrors the
    runtime ``z.string().url()`` guard in ``src/lib/ai-models/load-manifest.ts``
    closely enough to reject values like ``not-a-url`` before they are written:
    it requires an absolute URL with both a scheme and a host.

    Returns ``True`` for non-string instances so the ``type`` keyword (not the
    format checker) reports the proper error for those.
    """
    if not isinstance(value, str):
        return True
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return bool(parsed.scheme and parsed.netloc)


def validate_json_against_schema(data: Any, schema_path: Path) -> list[str]:
    """Validate ``data`` against the JSON Schema file at ``schema_path``.

    Shared validate-on-save core for the backoffice editors. Validates with
    JSON Schema Draft 2020-12 and deterministic string ``format`` enforcement:
    a fresh ``FormatChecker`` whose ``uri`` check mirrors the runtime
    ``z.string().url()`` guard without depending on the optional
    ``rfc3987``/``rfc3986`` extras. Returns a list of human-readable
    ``location: message`` strings; an empty list means ``data`` is schema-valid
    and safe to write.

    Fails closed: if the validator infrastructure is unavailable (missing
    ``jsonschema`` package or a missing/unreadable schema file) the returned
    list is non-empty, so callers skip the write rather than persist
    unvalidated data.
    """
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError:
        return [
            "Schemavalidering kunde inte köras: Python-paketet `jsonschema` saknas. "
            "Installera det (se requirements.backoffice.txt). Sparar inte för att "
            "undvika att skada filen."
        ]

    schema_path = Path(schema_path)
    if not schema_path.is_file():
        return [
            f"Schemavalidering kunde inte köras: saknar {schema_path.as_posix()}."
        ]

    try:
        schema = read_json(schema_path)
    except (OSError, ValueError) as exc:
        return [f"Schemavalidering kunde inte köras: kunde inte läsa schema ({exc})."]

    # Enforce `format: "uri"` deterministically (jsonschema skips formats by
    # default). A fresh FormatChecker with our own `uri` check avoids depending
    # on the optional rfc3987/rfc3986 extras. Harmless for schemas that do not
    # use `format: "uri"` (the check is simply never invoked).
    format_checker = FormatChecker()
    format_checker.checks("uri")(_manifest_uri_format_is_valid)

    validator = Draft202012Validator(schema, format_checker=format_checker)
    messages: list[str] = []
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        location = "/".join(str(part) for part in err.path) or "(root)"
        messages.append(f"{location}: {err.message}")
    return messages


def validate_manifest_or_error(manifest: dict[str, Any]) -> list[str]:
    """Validate a proposed ai_models manifest against its JSON Schema.

    Thin wrapper over :func:`validate_json_against_schema` that resolves
    ``config/ai_models/manifest.schema.json`` (JSON Schema Draft 2020-12, with
    string ``format`` enforcement so malformed ``docLinks[].url`` values are
    rejected). Returns a list of human-readable error strings; an empty list
    means the manifest is schema-valid and safe to write. The backoffice
    manifest editors (``ai_models.py`` / ``autofix.py``) call this before every
    ``write_json`` so a schema-breaking edit is blocked with ``st.error``
    instead of silently corrupting the manifest.

    Fails closed: if the validator infrastructure is unavailable (missing
    ``jsonschema`` package or schema file) the returned list is non-empty, so
    callers skip the write rather than persist unvalidated data.
    """
    try:
        schema_path = find_repo_root() / "config" / "ai_models" / "manifest.schema.json"
    except FileNotFoundError as exc:
        return [f"Schemavalidering kunde inte köras: {exc}"]

    return validate_json_against_schema(manifest, schema_path)
