"""Deterministic, network-free view of Sajtmaskin's template sources.

The curator deliberately projects existing canonical owners instead of adding a
second registry.  In particular, the runtime eligibility rules and extractor
source list are parsed from their TypeScript owners so changes cannot silently
leave this Backoffice view stale.
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
from dataclasses import dataclass, replace
from enum import Enum
from pathlib import Path
from types import MappingProxyType
from typing import Iterable, Mapping, Sequence

_MANIFEST_REL = Path("src/lib/templates/template-blob-manifest.json")
_GALLERY_REL = Path("src/lib/templates/templates.json")
_CATEGORIES_REL = Path("src/lib/templates/template-categories.json")
_TEMPLATE_DATA_REL = Path("src/lib/templates/template-data.ts")
_INSPIRATION_REL = Path("src/lib/gen/scaffold-variants/template-inspiration.ts")
_FINGERPRINT_REL = Path("src/lib/gen/scaffold-variants/extractor-fingerprint.ts")
_VARIANTS_REL = Path("config/scaffold-variants")
_ADDENDA_REL = Path("config/variant-template-addenda.json")

_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
_LANGUAGE_RE = re.compile(r"^[a-z0-9-]{1,24}$")
_REFERENCE_EXTENSION_RE = re.compile(r"\.(?:tsx|jsx|ts|js|css)$", re.IGNORECASE)
_UNSAFE_REFERENCE_PATH_RE = re.compile(r"[`\x00-\x1f\x7f]")
_PROMPT_HEADING_RE = re.compile(r"^##(?=\s)", re.MULTILINE)
_REFERENCE_REASONS = frozenset(
    {"primary-page", "direct-component", "global-styles", "root-layout"}
)
_REVIEW_STATUSES = frozenset({"generated", "reviewed", "disabled"})
_ADDENDA_VERSION = "1.0.0"


class CatalogValidationError(ValueError):
    """A canonical catalog source could not be projected safely."""


class CatalogScope(str, Enum):
    """Selectable template populations, from broadest to most curated."""

    BLOB = "blob"
    PREVIEW_FIT = "preview_fit"
    GALLERY = "gallery"
    SITE_VISIBLE = "site_visible"
    VARIANT_CITED = "variant_cited"


@dataclass(frozen=True, slots=True)
class StructuralReference:
    path: str
    language: str
    reason: str
    excerpt: str


@dataclass(frozen=True, slots=True)
class AddendumRecord:
    template_id: str
    source_archive_sha256: str
    extractor_sha256: str | None
    review_status: str
    review_notes: str | None
    structural_references: tuple[StructuralReference, ...]


@dataclass(frozen=True, slots=True)
class TemplateRecord:
    id: str
    title: str
    slug: str
    category: str
    archive_url: str
    archive_sha256: str | None
    archive_size_bytes: int | None
    still_image_url: str
    preview_fits: bool | None
    in_gallery: bool = False
    site_visible: bool = False
    variant_cited: bool = False
    runtime_full_project_eligible: bool = False
    reviewed_full_project_exception: bool = False
    addendum_status: str = "missing"
    addendum_review_status: str | None = None
    addendum_source_archive_sha256: str | None = None
    addendum_extractor_sha256: str | None = None
    structural_references: tuple[StructuralReference, ...] = ()

    @property
    def gallery_visible(self) -> bool:
        """Compatibility name used by report projection code."""

        return self.in_gallery


@dataclass(frozen=True, slots=True)
class CatalogSnapshot:
    repo_root: Path
    records: tuple[TemplateRecord, ...]
    by_id: Mapping[str, TemplateRecord]
    scope_counts: Mapping[CatalogScope, int]
    categories: tuple[str, ...]
    variant_source_template_ids: tuple[str, ...]
    full_project_categories: tuple[str, ...]
    reviewed_full_projects: Mapping[str, tuple[str, str]]
    extractor_source_relative_paths: tuple[str, ...]
    extractor_sha256: str
    addenda_by_id: Mapping[str, AddendumRecord]
    addenda_valid: bool
    addenda_error: str | None

    @property
    def counts(self) -> Mapping[str, int]:
        """String-keyed scope counts for JSON/report consumers."""

        return MappingProxyType(
            {scope.value: count for scope, count in self.scope_counts.items()}
        )

    @property
    def error(self) -> None:
        """The loader raises catalog errors; addenda validity is reported separately."""

        return None

    @property
    def addenda(self) -> Mapping[str, AddendumRecord]:
        return self.addenda_by_id


def _read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise CatalogValidationError(f"Could not read {path}: {error}") from error


def _require_object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise CatalogValidationError(f"{label} must be a JSON object")
    return value


def _required_trimmed_string(row: Mapping[str, object], key: str, label: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CatalogValidationError(f"{label}.{key} must be a non-empty string")
    return value.strip()


def _optional_trimmed_string(
    row: Mapping[str, object], key: str, label: str
) -> str | None:
    if key not in row:
        return None
    value = row[key]
    if not isinstance(value, str) or not value.strip():
        raise CatalogValidationError(f"{label}.{key} must be a non-empty string when present")
    return value.strip()


def _read_ts_source(repo_root: Path, relative_path: Path) -> str:
    path = repo_root / relative_path
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise CatalogValidationError(f"Could not read {path}: {error}") from error


def _extract_literal_body(
    source: str, symbol: str, opener: str, closer: str
) -> str:
    declaration = re.search(rf"\b(?:export\s+)?const\s+{re.escape(symbol)}\b", source)
    if not declaration:
        raise CatalogValidationError(f"Could not find TypeScript constant {symbol}")
    start = source.find(opener, declaration.end())
    if start < 0:
        raise CatalogValidationError(f"Could not find {opener!r} for {symbol}")

    depth = 0
    state = "code"
    index = start
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if state == "code":
            if char == "/" and next_char == "/":
                state = "line-comment"
                index += 2
                continue
            if char == "/" and next_char == "*":
                state = "block-comment"
                index += 2
                continue
            if char in {'"', "'", "`"}:
                state = char
                index += 1
                continue
            if char == opener:
                depth += 1
            elif char == closer:
                depth -= 1
                if depth == 0:
                    return source[start + 1 : index]
        elif state == "line-comment":
            if char in "\r\n":
                state = "code"
        elif state == "block-comment":
            if char == "*" and next_char == "/":
                state = "code"
                index += 2
                continue
        else:
            if char == "\\":
                index += 2
                continue
            if char == state:
                state = "code"
        index += 1
    raise CatalogValidationError(f"Unterminated TypeScript literal for {symbol}")


def _ts_string_literals(body: str) -> tuple[str, ...]:
    values: list[str] = []
    index = 0
    while index < len(body):
        char = body[index]
        next_char = body[index + 1] if index + 1 < len(body) else ""
        if char == "/" and next_char == "/":
            newline = body.find("\n", index + 2)
            index = len(body) if newline < 0 else newline + 1
            continue
        if char == "/" and next_char == "*":
            end = body.find("*/", index + 2)
            if end < 0:
                raise CatalogValidationError("Unterminated TypeScript block comment")
            index = end + 2
            continue
        if char not in {'"', "'"}:
            index += 1
            continue
        quote = char
        end = index + 1
        while end < len(body):
            if body[end] == "\\":
                end += 2
                continue
            if body[end] == quote:
                break
            end += 1
        if end >= len(body):
            raise CatalogValidationError("Unterminated TypeScript string literal")
        token = body[index : end + 1]
        try:
            value = ast.literal_eval(token)
        except (SyntaxError, ValueError) as error:
            raise CatalogValidationError(f"Unsupported TypeScript string {token!r}") from error
        if not isinstance(value, str):
            raise CatalogValidationError(f"Expected a string literal, got {token!r}")
        values.append(value)
        index = end + 1
    return tuple(values)


def _parse_ts_string_array(source: str, symbol: str) -> tuple[str, ...]:
    body = _extract_literal_body(source, symbol, "[", "]")
    values = _ts_string_literals(body)
    if not values or any(not value for value in values) or len(set(values)) != len(values):
        raise CatalogValidationError(f"{symbol} must contain unique, non-empty strings")
    return values


def _strip_ts_comments(source: str) -> str:
    return re.sub(r"//[^\r\n]*|/\*.*?\*/", "", source, flags=re.DOTALL)


def _parse_reviewed_full_projects(source: str) -> Mapping[str, tuple[str, str]]:
    body = _strip_ts_comments(
        _extract_literal_body(source, "VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS", "{", "}")
    )
    entry_re = re.compile(
        r"(?P<key>[A-Za-z_$][\w$]*|\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*')\s*:\s*"
        r"\{(?P<fields>.*?)\}\s*,?",
        re.DOTALL,
    )
    field_re = re.compile(
        r"\b(?P<name>category|archiveSha256)\s*:\s*"
        r"(?P<value>\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*')\s*,?",
        re.DOTALL,
    )
    result: dict[str, tuple[str, str]] = {}
    cursor = 0
    for match in entry_re.finditer(body):
        if body[cursor : match.start()].strip(" \t\r\n,"):
            raise CatalogValidationError(
                "Could not parse VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS"
            )
        raw_key = match.group("key")
        template_id = (
            ast.literal_eval(raw_key) if raw_key.startswith(('"', "'")) else raw_key
        )
        fields: dict[str, str] = {}
        field_cursor = 0
        for field in field_re.finditer(match.group("fields")):
            if match.group("fields")[field_cursor : field.start()].strip(" \t\r\n,"):
                raise CatalogValidationError(
                    f"Unexpected reviewed-project field for {template_id}"
                )
            name = field.group("name")
            if name in fields:
                raise CatalogValidationError(f"Duplicate {name} for {template_id}")
            fields[name] = ast.literal_eval(field.group("value"))
            field_cursor = field.end()
        if match.group("fields")[field_cursor:].strip(" \t\r\n,"):
            raise CatalogValidationError(
                f"Unexpected reviewed-project field for {template_id}"
            )
        category = fields.get("category", "")
        archive_sha = fields.get("archiveSha256", "")
        if not template_id or not category or not _SHA256_RE.fullmatch(archive_sha):
            raise CatalogValidationError(f"Invalid reviewed-project binding for {template_id}")
        if template_id in result:
            raise CatalogValidationError(f"Duplicate reviewed project {template_id}")
        result[template_id] = (category, archive_sha)
        cursor = match.end()
    if body[cursor:].strip(" \t\r\n,"):
        raise CatalogValidationError(
            "Could not parse VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS"
        )
    return MappingProxyType(result)


def read_extractor_source_relative_paths(repo_root: Path | str) -> tuple[str, ...]:
    """Read the canonical source list without maintaining a Python copy."""

    root = Path(repo_root).resolve()
    source = _read_ts_source(root, _FINGERPRINT_REL)
    paths = _parse_ts_string_array(source, "EXTRACTOR_SOURCE_RELATIVE_PATHS")
    for path in paths:
        candidate = Path(path)
        if candidate.is_absolute() or ".." in candidate.parts or "\\" in path:
            raise CatalogValidationError(f"Unsafe extractor source path: {path!r}")
    return paths


def compute_extractor_sha256(repo_root: Path | str) -> str:
    """Mirror ``computeExtractorSha256`` byte-for-byte in Python."""

    root = Path(repo_root).resolve()
    digest = hashlib.sha256()
    for relative_path in sorted(read_extractor_source_relative_paths(root)):
        path = root.joinpath(*relative_path.split("/"))
        try:
            # ``Path.read_text`` applies universal-newline translation. Node's
            # owner only replaces CRLF, so decode bytes directly to preserve a
            # standalone CR and keep the contract truly byte-equivalent.
            source = path.read_bytes().decode("utf-8")
        except (OSError, UnicodeError) as error:
            raise CatalogValidationError(f"Could not hash {path}: {error}") from error
        source = source.removeprefix("\ufeff").replace("\r\n", "\n")
        digest.update(f"{relative_path}\n".encode())
        digest.update(source.encode())
        digest.update(b"\0")
    return digest.hexdigest()


def _js_length(value: str) -> int:
    """Match JavaScript/Zod string length (UTF-16 code units)."""

    return len(value.encode("utf-16-le")) // 2


def _validate_reference(value: object, label: str) -> StructuralReference:
    row = _require_object(value, label)
    expected = {"path", "language", "reason", "excerpt"}
    if set(row) != expected:
        raise CatalogValidationError(f"{label} has unknown or missing fields")
    path = row["path"]
    language = row["language"]
    reason = row["reason"]
    excerpt = row["excerpt"]
    if not isinstance(path, str):
        raise CatalogValidationError(f"{label}.path must be a string")
    normalized = path.replace("\\", "/")
    if (
        path != normalized
        or not path
        or _js_length(path) > 300
        or path.startswith("/")
        or _UNSAFE_REFERENCE_PATH_RE.search(path)
        or ".." in path.split("/")
        or re.search(r"(^|/)api/", path, re.IGNORECASE)
        or not _REFERENCE_EXTENSION_RE.search(path)
    ):
        raise CatalogValidationError(f"{label}.path is unsafe or non-normalized")
    if not isinstance(language, str) or not _LANGUAGE_RE.fullmatch(language):
        raise CatalogValidationError(f"{label}.language is invalid")
    if not isinstance(reason, str) or reason not in _REFERENCE_REASONS:
        raise CatalogValidationError(f"{label}.reason is invalid")
    if (
        not isinstance(excerpt, str)
        or not excerpt
        or _js_length(excerpt) > 9_000
        or "```" in excerpt
        or _PROMPT_HEADING_RE.search(excerpt)
    ):
        raise CatalogValidationError(f"{label}.excerpt is invalid")
    return StructuralReference(path, language, reason, excerpt)


def parse_addenda_registry(value: object) -> Mapping[str, AddendumRecord]:
    """Validate the registry as one unit using the runtime's strict contract."""

    root = _require_object(value, "variant-template-addenda")
    expected_root = {"$schema", "_comment", "_version", "templates"}
    if set(root) != expected_root:
        raise CatalogValidationError("variant-template-addenda has unknown or missing fields")
    for key in ("$schema", "_comment"):
        if not isinstance(root[key], str) or not root[key]:
            raise CatalogValidationError(f"variant-template-addenda.{key} is invalid")
    if root["_version"] != _ADDENDA_VERSION:
        raise CatalogValidationError("variant-template-addenda._version is unsupported")
    entries = root["templates"]
    if not isinstance(entries, list):
        raise CatalogValidationError("variant-template-addenda.templates must be an array")

    parsed: dict[str, AddendumRecord] = {}
    required = {
        "templateId",
        "sourceArchiveSha256",
        "reviewStatus",
        "structuralReferences",
    }
    optional = {"extractorSha256", "reviewNotes"}
    for index, value in enumerate(entries):
        label = f"variant-template-addenda.templates[{index}]"
        row = _require_object(value, label)
        if not required.issubset(row) or not set(row).issubset(required | optional):
            raise CatalogValidationError(f"{label} has unknown or missing fields")
        template_id = _required_trimmed_string(row, "templateId", label)
        if _js_length(template_id) > 100:
            raise CatalogValidationError(f"{label}.templateId is too long")
        source_sha = row["sourceArchiveSha256"]
        if not isinstance(source_sha, str) or not _SHA256_RE.fullmatch(source_sha):
            raise CatalogValidationError(f"{label}.sourceArchiveSha256 is invalid")
        extractor_sha: str | None = None
        if "extractorSha256" in row:
            raw_extractor_sha = row["extractorSha256"]
            # JSON null must not pass as "omitted". Schema and Zod require the
            # key to be absent on disabled rows; treat null as present-and-invalid.
            if raw_extractor_sha is None:
                raise CatalogValidationError(
                    f"{label}.extractorSha256 must be omitted, not null"
                )
            if not isinstance(raw_extractor_sha, str) or not _SHA256_RE.fullmatch(
                raw_extractor_sha
            ):
                raise CatalogValidationError(f"{label}.extractorSha256 is invalid")
            extractor_sha = raw_extractor_sha
        review_status = row["reviewStatus"]
        if not isinstance(review_status, str) or review_status not in _REVIEW_STATUSES:
            raise CatalogValidationError(f"{label}.reviewStatus is invalid")
        review_notes = _optional_trimmed_string(row, "reviewNotes", label)
        if review_notes is not None and _js_length(review_notes) > 2_000:
            raise CatalogValidationError(f"{label}.reviewNotes is too long")
        references_raw = row["structuralReferences"]
        if not isinstance(references_raw, list) or len(references_raw) > 3:
            raise CatalogValidationError(f"{label}.structuralReferences is invalid")
        references = tuple(
            _validate_reference(reference, f"{label}.structuralReferences[{ref_index}]")
            for ref_index, reference in enumerate(references_raw)
        )
        if review_status == "disabled":
            if extractor_sha is not None:
                raise CatalogValidationError(
                    f"{label}: disabled addenda must not include extractorSha256"
                )
            if references:
                raise CatalogValidationError(f"{label}: disabled addenda must be empty")
        elif extractor_sha is None:
            raise CatalogValidationError(
                f"{label}: generated and reviewed addenda require extractorSha256"
            )
        paths = [reference.path.lower() for reference in references]
        if len(paths) != len(set(paths)):
            raise CatalogValidationError(f"{label}: duplicate structural reference path")
        if sum(_js_length(reference.excerpt) for reference in references) > 9_000:
            raise CatalogValidationError(f"{label}: combined excerpts exceed 9000 chars")
        if template_id in parsed:
            raise CatalogValidationError(
                f"variant-template-addenda has duplicate templateId {template_id}"
            )
        parsed[template_id] = AddendumRecord(
            template_id=template_id,
            source_archive_sha256=source_sha,
            extractor_sha256=extractor_sha,
            review_status=review_status,
            review_notes=review_notes,
            structural_references=references,
        )
    return MappingProxyType(parsed)


def _load_manifest(repo_root: Path) -> dict[str, TemplateRecord]:
    root = _require_object(_read_json(repo_root / _MANIFEST_REL), str(_MANIFEST_REL))
    templates = root.get("templates")
    if not isinstance(templates, list):
        raise CatalogValidationError(f"{_MANIFEST_REL}.templates must be an array")
    result: dict[str, TemplateRecord] = {}
    for index, value in enumerate(templates):
        label = f"{_MANIFEST_REL}.templates[{index}]"
        row = _require_object(value, label)
        template_id = _required_trimmed_string(row, "id", label)
        archive_sha: str | None
        raw_sha = row.get("archiveSha256")
        if raw_sha is None:
            archive_sha = None
        elif isinstance(raw_sha, str) and _SHA256_RE.fullmatch(raw_sha.strip().lower()):
            archive_sha = raw_sha.strip().lower()
        else:
            raise CatalogValidationError(f"{label}.archiveSha256 is invalid")
        preview_fits = row.get("previewFits")
        if preview_fits is not None and not isinstance(preview_fits, bool):
            raise CatalogValidationError(f"{label}.previewFits is invalid")
        size = row.get("archiveSizeBytes")
        if size is not None and (not isinstance(size, int) or isinstance(size, bool) or size < 0):
            raise CatalogValidationError(f"{label}.archiveSizeBytes is invalid")
        if template_id in result:
            raise CatalogValidationError(f"Duplicate Blob template id {template_id}")
        result[template_id] = TemplateRecord(
            id=template_id,
            title=_required_trimmed_string(row, "title", label),
            slug=_required_trimmed_string(row, "slug", label),
            category=_required_trimmed_string(row, "category", label),
            archive_url=_required_trimmed_string(row, "archiveUrl", label),
            archive_sha256=archive_sha,
            archive_size_bytes=size,
            still_image_url=_required_trimmed_string(row, "stillImageUrl", label),
            preview_fits=preview_fits,
        )
    return result


def _load_gallery_ids(repo_root: Path) -> tuple[set[str], Mapping[str, str]]:
    value = _read_json(repo_root / _GALLERY_REL)
    if not isinstance(value, list):
        raise CatalogValidationError(f"{_GALLERY_REL} must be an array")
    categories: dict[str, str] = {}
    for index, item in enumerate(value):
        label = f"{_GALLERY_REL}[{index}]"
        row = _require_object(item, label)
        template_id = _required_trimmed_string(row, "id", label)
        category = _required_trimmed_string(row, "category", label)
        if template_id in categories:
            raise CatalogValidationError(f"Duplicate gallery template id {template_id}")
        categories[template_id] = category
    return set(categories), MappingProxyType(categories)


def _load_category_mapping(repo_root: Path) -> Mapping[str, str]:
    root = _require_object(_read_json(repo_root / _CATEGORIES_REL), str(_CATEGORIES_REL))
    mapping: dict[str, str] = {}
    for category, raw_ids in root.items():
        if category.startswith("_"):
            continue
        if not isinstance(raw_ids, list):
            raise CatalogValidationError(f"Category {category} must contain an id array")
        for raw_id in raw_ids:
            if not isinstance(raw_id, str) or not raw_id.strip():
                raise CatalogValidationError(f"Category {category} contains an invalid id")
            template_id = raw_id.strip()
            if template_id in mapping:
                raise CatalogValidationError(f"Template {template_id} appears in two categories")
            mapping[template_id] = category
    return MappingProxyType(mapping)


def _load_variant_citations(repo_root: Path) -> tuple[str, ...]:
    variants_root = repo_root / _VARIANTS_REL
    cited: set[str] = set()
    try:
        paths = sorted(
            path
            for path in variants_root.glob("*/*.json")
            if not path.parent.name.startswith("_")
        )
    except OSError as error:
        raise CatalogValidationError(f"Could not list {_VARIANTS_REL}: {error}") from error
    for path in paths:
        row = _require_object(_read_json(path), str(path.relative_to(repo_root)))
        values = row.get("sourceTemplateIds")
        if not isinstance(values, list):
            continue
        # Runtime readStringArray ignores non-strings and blank strings.
        for value in values:
            if isinstance(value, str) and value.strip():
                cited.add(value.strip())
    return tuple(sorted(cited))


def _addendum_status(
    entry: AddendumRecord | None,
    archive_sha: str | None,
    extractor_sha: str,
) -> str:
    if entry is None:
        return "missing"
    if entry.review_status == "disabled":
        return "disabled"
    if archive_sha is None or entry.source_archive_sha256 != archive_sha:
        return "stale_archive"
    if entry.review_status == "generated" and entry.extractor_sha256 != extractor_sha:
        return "stale_extractor"
    return "current"


def load_catalog(repo_root: Path | str | None = None) -> CatalogSnapshot:
    """Load a stable snapshot without downloading or executing template code."""

    root = Path(repo_root or Path.cwd()).resolve()
    manifest = _load_manifest(root)
    gallery_ids, gallery_categories = _load_gallery_ids(root)
    category_mapping = _load_category_mapping(root)
    if gallery_ids != set(category_mapping):
        raise CatalogValidationError(
            "template-categories.json ids must exactly match templates.json ids"
        )
    missing_gallery = gallery_ids - set(manifest)
    if missing_gallery:
        raise CatalogValidationError(
            f"Gallery ids missing from Blob manifest: {sorted(missing_gallery)!r}"
        )
    mismatched_categories = sorted(
        template_id
        for template_id in gallery_ids
        if manifest[template_id].category != gallery_categories[template_id]
        or gallery_categories[template_id] != category_mapping[template_id]
    )
    if mismatched_categories:
        raise CatalogValidationError(
            f"Template category sources disagree: {mismatched_categories!r}"
        )

    template_data = _read_ts_source(root, _TEMPLATE_DATA_REL)
    excluded_ids = frozenset(_parse_ts_string_array(template_data, "EXCLUDED_TEMPLATE_IDS"))
    if not excluded_ids.issubset(gallery_ids):
        raise CatalogValidationError(
            f"Excluded ids are not in the gallery: {sorted(excluded_ids - gallery_ids)!r}"
        )
    site_visible_ids = gallery_ids - excluded_ids

    inspiration = _read_ts_source(root, _INSPIRATION_REL)
    full_project_categories = _parse_ts_string_array(
        inspiration, "VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES"
    )
    reviewed = _parse_reviewed_full_projects(inspiration)
    for template_id, (category, archive_sha) in reviewed.items():
        row = manifest.get(template_id)
        if row is None or row.category != category or row.archive_sha256 != archive_sha:
            raise CatalogValidationError(
                f"Reviewed full-project binding does not match manifest: {template_id}"
            )

    cited_ids = _load_variant_citations(root)
    missing_citations = set(cited_ids) - set(manifest)
    if missing_citations:
        raise CatalogValidationError(
            f"Variant-cited ids missing from Blob manifest: {sorted(missing_citations)!r}"
        )

    extractor_paths = read_extractor_source_relative_paths(root)
    extractor_sha = compute_extractor_sha256(root)
    addenda_valid = True
    addenda_error: str | None = None
    try:
        addenda = parse_addenda_registry(_read_json(root / _ADDENDA_REL))
    except CatalogValidationError as error:
        addenda_valid = False
        addenda_error = str(error)
        addenda = MappingProxyType({})

    category_set = frozenset(full_project_categories)
    cited_set = frozenset(cited_ids)
    projected: list[TemplateRecord] = []
    for template_id in sorted(manifest):
        row = manifest[template_id]
        reviewed_binding = reviewed.get(template_id)
        reviewed_match = reviewed_binding == (row.category, row.archive_sha256)
        entry = addenda.get(template_id) if addenda_valid else None
        status = (
            _addendum_status(entry, row.archive_sha256, extractor_sha)
            if addenda_valid
            else "invalid_registry"
        )
        references = entry.structural_references if entry and status == "current" else ()
        projected.append(
            replace(
                row,
                in_gallery=template_id in gallery_ids,
                site_visible=template_id in site_visible_ids,
                variant_cited=template_id in cited_set,
                runtime_full_project_eligible=(
                    row.category in category_set or reviewed_match
                ),
                reviewed_full_project_exception=reviewed_match,
                addendum_status=status,
                addendum_review_status=entry.review_status if entry else None,
                addendum_source_archive_sha256=(
                    entry.source_archive_sha256 if entry else None
                ),
                addendum_extractor_sha256=entry.extractor_sha256 if entry else None,
                structural_references=references,
            )
        )

    records = tuple(projected)
    by_id = MappingProxyType({record.id: record for record in records})
    scope_counts = MappingProxyType(
        {scope: len(scope_records_from(records, scope)) for scope in CatalogScope}
    )
    return CatalogSnapshot(
        repo_root=root,
        records=records,
        by_id=by_id,
        scope_counts=scope_counts,
        categories=tuple(sorted({record.category for record in records})),
        variant_source_template_ids=cited_ids,
        full_project_categories=full_project_categories,
        reviewed_full_projects=reviewed,
        extractor_source_relative_paths=extractor_paths,
        extractor_sha256=extractor_sha,
        addenda_by_id=addenda,
        addenda_valid=addenda_valid,
        addenda_error=addenda_error,
    )


def _coerce_scope(scope: CatalogScope | str) -> CatalogScope:
    if isinstance(scope, CatalogScope):
        return scope
    try:
        return CatalogScope(scope)
    except ValueError as error:
        choices = ", ".join(item.value for item in CatalogScope)
        raise ValueError(f"Unknown catalog scope {scope!r}; expected one of {choices}") from error


def scope_records_from(
    records: Sequence[TemplateRecord], scope: CatalogScope | str
) -> tuple[TemplateRecord, ...]:
    """Scope a record sequence; kept separate to build snapshots without recursion."""

    selected_scope = _coerce_scope(scope)
    if selected_scope is CatalogScope.BLOB:
        return tuple(records)
    if selected_scope is CatalogScope.PREVIEW_FIT:
        return tuple(record for record in records if record.preview_fits is True)
    if selected_scope is CatalogScope.GALLERY:
        return tuple(record for record in records if record.in_gallery)
    if selected_scope is CatalogScope.SITE_VISIBLE:
        return tuple(record for record in records if record.site_visible)
    return tuple(record for record in records if record.variant_cited)


def scope_records(
    snapshot: CatalogSnapshot, scope: CatalogScope | str
) -> tuple[TemplateRecord, ...]:
    return scope_records_from(snapshot.records, scope)


def filter_records(
    records: Iterable[TemplateRecord],
    *,
    ids: Iterable[str] | None = None,
    categories: Iterable[str] | None = None,
    search: str = "",
    limit: int | None = None,
) -> tuple[TemplateRecord, ...]:
    """Apply deterministic intersection filters while preserving catalog order."""

    if limit is not None and (
        not isinstance(limit, int) or isinstance(limit, bool) or limit < 0
    ):
        raise ValueError("limit must be a non-negative integer or None")
    if limit == 0:
        return ()
    id_filter = frozenset(value.strip() for value in ids or () if value.strip())
    category_filter = frozenset(
        value.strip() for value in categories or () if value.strip()
    )
    needle = search.strip().casefold()
    selected: list[TemplateRecord] = []
    for record in records:
        if id_filter and record.id not in id_filter:
            continue
        if category_filter and record.category not in category_filter:
            continue
        if needle and needle not in "\n".join(
            (record.id, record.title, record.slug, record.category)
        ).casefold():
            continue
        selected.append(record)
        if limit is not None and len(selected) >= limit:
            break
    return tuple(selected)


def select_catalog(
    snapshot: CatalogSnapshot,
    scope: CatalogScope | str = CatalogScope.SITE_VISIBLE,
    *,
    ids: Iterable[str] | None = None,
    categories: Iterable[str] | None = None,
    search: str = "",
    limit: int | None = None,
) -> tuple[TemplateRecord, ...]:
    """Convenience API used by both the Streamlit UI and batch runner."""

    return filter_records(
        scope_records(snapshot, scope),
        ids=ids,
        categories=categories,
        search=search,
        limit=limit,
    )
