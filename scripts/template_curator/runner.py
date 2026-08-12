"""Safe, read-only execution layer for Template (v0-mall) curation.

Canonical catalog selection belongs to :mod:`scripts.template_curator.catalog`.
This module verifies selected Blob archives, invokes the existing static Node
auditor once for the batch, and projects deterministic curation profiles. It
never extracts or executes template code and never mutates addenda.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlparse

MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_ZIP_ENTRIES = 2_000
MAX_ZIP_FILE_BYTES = 16 * 1024 * 1024
MAX_ZIP_TOTAL_BYTES = 96 * 1024 * 1024
MAX_COMPRESSION_RATIO = 250
DOWNLOAD_TIMEOUT_SECONDS = 30
AUDIT_BASE_TIMEOUT_SECONDS = 90
AUDIT_PER_ARCHIVE_TIMEOUT_SECONDS = 8
AUDIT_MAX_TIMEOUT_SECONDS = 900

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_SHA_RE = re.compile(r"^[a-f0-9]{64}$")
_VERSION_RE = re.compile(r"\d+")
_RECOGNIZED_FRAMEWORKS = {"next", "vite", "remix", "astro", "sveltekit", "static-html"}
_REVIEW_ISSUE_PREFIXES = (
    "no-dev-script",
    "next-major-drift(",
    "react-major-drift(",
    "tailwind-v3-drift",
    "kitchen-sink(",
    "needs-backend(",
    "env-missing-server(",
    "env-missing-public(",
    "env-scan-incomplete(",
    "lockstep-pin-risk(",
)
_REJECT_ISSUE_PREFIXES = (
    "audit-error:",
    "download-error:",
    "zip-rejected:",
    "archive-too-large",
    "missing-recognized-entry",
    "exceeds-host-caps(",
    "package-json-too-large",
    "package-json-unparseable:",
)

_FEATURE_PACKAGES: dict[str, tuple[str, ...]] = {
    "animation": ("framer-motion", "motion", "gsap", "lottie-react"),
    "3d": ("three", "@react-three/fiber", "@react-three/drei", "@react-three/rapier"),
    "charts": ("recharts", "chart.js", "@visx/visx"),
    "carousel": ("embla-carousel-react", "swiper"),
    "forms": ("react-hook-form", "@hookform/resolvers"),
    "maps": ("maplibre-gl", "react-map-gl", "leaflet", "@googlemaps/js-api-loader"),
    "tables": ("@tanstack/react-table",),
    "command-palette": ("cmdk",),
}


class CuratorError(RuntimeError):
    """A bounded, user-displayable curator failure."""


@dataclass(frozen=True)
class DownloadResult:
    """A canonical archive after size and digest verification."""

    template_id: str
    archive_sha256: str
    cache_path: Path
    size_bytes: int
    from_cache: bool


class _RejectRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Prevent urllib from issuing a second request for a redirect target."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ARG002
        _validate_blob_url(newurl, context="Redirect")
        raise CuratorError("Blob redirects are not allowed")


def _mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if dataclasses.is_dataclass(value):
        return {field.name: getattr(value, field.name) for field in dataclasses.fields(value)}
    if hasattr(value, "__dict__"):
        return dict(vars(value))
    raise TypeError(f"unsupported record type: {type(value).__name__}")


def _pick(row: Mapping[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in row:
            return row[name]
    return default


def _validate_blob_url(url: Any, *, context: str) -> str:
    """Accept only credential-free canonical Vercel Blob HTTPS URLs.

    Error messages deliberately exclude the supplied URL so userinfo or query
    material from an injected response can never reach reports or the UI.
    """

    if not isinstance(url, str) or not url:
        raise CuratorError(f"{context} URL is invalid")
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError as exc:
        raise CuratorError(f"{context} URL is invalid") from exc
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or port not in (None, 443)
    ):
        raise CuratorError(f"{context} URL must be credential-free HTTPS")
    if not parsed.hostname.endswith(".blob.vercel-storage.com"):
        raise CuratorError(f"{context} URL is not an approved Vercel Blob host")
    return url


def _canonical_record(record: Any) -> dict[str, Any]:
    row = _mapping(record)
    template_id = str(_pick(row, "id", "template_id", "templateId", default="")).strip()
    archive_url = str(_pick(row, "archive_url", "archiveUrl", default="")).strip()
    archive_sha = str(_pick(row, "archive_sha256", "archiveSha256", default="")).strip().lower()
    raw_size = _pick(row, "archive_size_bytes", "archiveSizeBytes")
    try:
        archive_size = int(raw_size)
    except (TypeError, ValueError) as exc:
        raise CuratorError(f"{template_id or '<unknown>'}: invalid archive size") from exc
    if not _ID_RE.fullmatch(template_id):
        raise CuratorError(f"invalid template id: {template_id!r}")
    if not _SHA_RE.fullmatch(archive_sha):
        raise CuratorError(f"{template_id}: invalid archive SHA-256")
    _validate_blob_url(archive_url, context=f"{template_id}: archive")
    if archive_size < 0 or archive_size > MAX_ARCHIVE_BYTES:
        raise CuratorError(f"{template_id}: declared archive exceeds {MAX_ARCHIVE_BYTES} bytes")
    raw_addendum = _pick(row, "addendum")
    if raw_addendum is None:
        flattened_addendum = {
            "sourceArchiveSha256": _pick(
                row,
                "addendum_source_archive_sha256",
                "addendumSourceArchiveSha256",
                "source_archive_sha256",
            ),
            "extractorSha256": _pick(
                row,
                "addendum_extractor_sha256",
                "addendumExtractorSha256",
                "extractor_sha256",
            ),
            "reviewStatus": _pick(
                row,
                "addendum_review_status",
                "addendumReviewStatus",
                "review_status",
            ),
            "structuralReferences": _pick(row, "structural_references", "structuralReferences"),
        }
        raw_addendum = (
            flattened_addendum
            if any(value is not None for value in flattened_addendum.values())
            else None
        )
    return {
        "id": template_id,
        "title": str(_pick(row, "title", default=template_id)),
        "category": str(_pick(row, "category", default="uncategorized")),
        "archiveUrl": archive_url,
        "archiveSha256": archive_sha,
        "archiveSizeBytes": archive_size,
        "previewFits": _pick(row, "preview_fits", "previewFits"),
        "galleryVisible": _pick(row, "gallery_visible", "galleryVisible", "in_gallery"),
        "siteVisible": _pick(row, "site_visible", "siteVisible"),
        "variantCited": _pick(row, "variant_cited", "variantCited"),
        "runtimeFullProjectEligible": (
            _pick(
                row,
                "runtime_full_project_eligible",
                "runtimeFullProjectEligible",
                default=False,
            )
            is True
        ),
        "addendumStatus": _pick(row, "addendum_status", "addendumStatus"),
        "addendum": raw_addendum,
        "structuralReferences": _pick(row, "structural_references", "structuralReferences", default=()),
    }


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_member_name(name: str) -> bool:
    if not name or "\x00" in name or "\\" in name or name.startswith("/"):
        return False
    if re.match(r"^[A-Za-z]:", name):
        return False
    return all(part not in {"", ".."} for part in PurePosixPath(name).parts)


def inspect_zip_safety(path: Path) -> dict[str, int]:
    """Validate archive metadata without extracting a single member."""

    try:
        archive_bytes = path.stat().st_size
    except OSError as exc:
        raise CuratorError(f"archive unavailable: {exc}") from exc
    if archive_bytes <= 0 or archive_bytes > MAX_ARCHIVE_BYTES:
        raise CuratorError("archive size is outside the allowed bounds")
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            if len(members) > MAX_ZIP_ENTRIES:
                raise CuratorError(f"archive has more than {MAX_ZIP_ENTRIES} entries")
            total = 0
            files = 0
            seen: set[str] = set()
            for member in members:
                if not _safe_member_name(member.filename):
                    raise CuratorError(f"unsafe archive path: {member.filename!r}")
                normalized = str(PurePosixPath(member.filename)).casefold()
                if normalized in seen:
                    raise CuratorError(f"duplicate archive path: {member.filename!r}")
                seen.add(normalized)
                if member.flag_bits & 0x1:
                    raise CuratorError("encrypted ZIP entries are not supported")
                unix_type = (member.external_attr >> 16) & 0o170000
                if unix_type == 0o120000:
                    raise CuratorError("symbolic links are not supported in template ZIPs")
                if member.is_dir():
                    continue
                files += 1
                if member.file_size > MAX_ZIP_FILE_BYTES:
                    raise CuratorError(f"archive member exceeds {MAX_ZIP_FILE_BYTES} bytes")
                total += member.file_size
                if total > MAX_ZIP_TOTAL_BYTES:
                    raise CuratorError(f"expanded archive exceeds {MAX_ZIP_TOTAL_BYTES} bytes")
                ratio = member.file_size / max(1, member.compress_size)
                if member.file_size > 1024 * 1024 and ratio > MAX_COMPRESSION_RATIO:
                    raise CuratorError("archive member has a suspicious compression ratio")
    except (zipfile.BadZipFile, NotImplementedError) as exc:
        raise CuratorError(f"invalid or unsupported ZIP: {exc}") from exc
    return {"archiveBytes": archive_bytes, "entryCount": len(members), "fileCount": files, "expandedBytes": total}


def _open_url(url: str, timeout: int):
    _validate_blob_url(url, context="Archive")
    request = urllib.request.Request(url, headers={"User-Agent": "sajtmaskin-template-curator/1"})
    opener = urllib.request.build_opener(_RejectRedirectHandler())
    return opener.open(request, timeout=timeout)  # noqa: S310 - URL validated above


def download_verified_archive(
    record: Any,
    cache_dir: Path,
    *,
    opener: Callable[[str, int], Any] = _open_url,
    timeout_seconds: int = DOWNLOAD_TIMEOUT_SECONDS,
) -> DownloadResult:
    """Fetch one canonical Blob archive into a digest-addressed cache atomically."""

    canonical = _canonical_record(record)
    cache_dir.mkdir(parents=True, exist_ok=True)
    destination = cache_dir / f"{canonical['archiveSha256']}.zip"
    if destination.is_file() and destination.stat().st_size <= MAX_ARCHIVE_BYTES:
        if _sha256_file(destination) == canonical["archiveSha256"]:
            inspect_zip_safety(destination)
            return DownloadResult(canonical["id"], canonical["archiveSha256"], destination, destination.stat().st_size, True)

    temporary = cache_dir / f".{canonical['archiveSha256']}.{os.getpid()}.tmp"
    try:
        response = opener(canonical["archiveUrl"], timeout_seconds)
        with response:
            final_url = getattr(response, "geturl", lambda: canonical["archiveUrl"])()
            _validate_blob_url(final_url, context="Final archive")
            headers = getattr(response, "headers", {})
            raw_location = headers.get("Location") if hasattr(headers, "get") else None
            if raw_location is not None:
                _validate_blob_url(raw_location, context="Redirect")
                raise CuratorError("Blob redirects are not allowed")
            raw_length = headers.get("Content-Length") if hasattr(headers, "get") else None
            if raw_length is not None:
                try:
                    content_length = int(raw_length)
                except (TypeError, ValueError) as exc:
                    raise CuratorError("invalid Content-Length") from exc
                if content_length > MAX_ARCHIVE_BYTES:
                    raise CuratorError("Content-Length exceeds archive limit")
                if content_length != canonical["archiveSizeBytes"]:
                    raise CuratorError("Content-Length differs from canonical archive size")
            digest = hashlib.sha256()
            total = 0
            with temporary.open("xb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_ARCHIVE_BYTES:
                        raise CuratorError("download exceeded archive limit")
                    digest.update(chunk)
                    handle.write(chunk)
                handle.flush()
                os.fsync(handle.fileno())
        if total != canonical["archiveSizeBytes"]:
            raise CuratorError("download size differs from canonical archive size")
        if digest.hexdigest() != canonical["archiveSha256"]:
            raise CuratorError("download SHA-256 differs from canonical archive digest")
        inspect_zip_safety(temporary)
        temporary.replace(destination)
        return DownloadResult(canonical["id"], canonical["archiveSha256"], destination, total, False)
    except CuratorError:
        temporary.unlink(missing_ok=True)
        raise
    except (OSError, TimeoutError):
        temporary.unlink(missing_ok=True)
        raise CuratorError("download failed") from None


def _failure_audit(template_id: str, message: str) -> dict[str, Any]:
    return {
        "id": template_id,
        "framework": "unknown",
        "projectShape": "unknown",
        "fileCount": 0,
        "totalBytes": 0,
        "maxFileBytes": 0,
        "fitsHostCaps": False,
        "packages": {},
        "integrations": {},
        "entryFiles": [],
        "routeFiles": [],
        "issues": [f"audit-error:{message[:240]}"],
    }


def run_audit(
    records: Iterable[Any],
    *,
    repo_root: Path,
    cache_dir: Path | None = None,
    progress: Callable[[int, int, str], None] | None = None,
    node_command: str = "node",
) -> dict[str, dict[str, Any]]:
    """Verify a selection and invoke the static Node audit once for the batch."""

    canonical_records: list[dict[str, Any]] = []
    for record in records:
        try:
            canonical_records.append(_canonical_record(record))
        except CuratorError:
            # Invalid canonical records are catalog failures and have no trustworthy id.
            raise
    if not canonical_records:
        return {}
    cache = cache_dir or repo_root / "data" / "backoffice" / "template-curator" / "cache"
    results: dict[str, dict[str, Any]] = {}
    verified: list[tuple[dict[str, Any], DownloadResult]] = []
    total = len(canonical_records)
    for index, record in enumerate(canonical_records, start=1):
        if progress:
            progress(index - 1, total, f"Verifierar {record['id']}")
        try:
            verified.append((record, download_verified_archive(record, cache)))
        except (CuratorError, ValueError) as exc:
            results[record["id"]] = _failure_audit(record["id"], str(exc))

    if verified:
        with tempfile.TemporaryDirectory(prefix="sajtmaskin-template-audit-") as raw_stage:
            stage = Path(raw_stage)
            archive_dir = stage / "archives"
            archive_dir.mkdir()
            output_path = stage / "audit.json"
            for record, download in verified:
                shutil.copyfile(download.cache_path, archive_dir / f"{record['id']}.zip")
            script = repo_root / "scripts" / "v0-templates" / "audit-template-repos.mjs"
            timeout = min(
                AUDIT_MAX_TIMEOUT_SECONDS,
                AUDIT_BASE_TIMEOUT_SECONDS + len(verified) * AUDIT_PER_ARCHIVE_TIMEOUT_SECONDS,
            )
            command = [
                node_command,
                str(script),
                "--dir",
                str(archive_dir),
                "--out",
                str(output_path),
                "--concurrency",
                str(min(8, len(verified))),
                "--quiet",
            ]
            try:
                completed = subprocess.run(
                    command,
                    cwd=repo_root,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    check=False,
                )
                if completed.returncode != 0:
                    detail = (completed.stderr or completed.stdout or "Node audit failed").strip()
                    raise CuratorError(detail[:500])
                payload = json.loads(output_path.read_text(encoding="utf-8"))
                if not isinstance(payload, list):
                    raise CuratorError("Node audit returned a non-list payload")
                expected = {record["id"] for record, _ in verified}
                for raw in payload:
                    if not isinstance(raw, dict):
                        continue
                    template_id = raw.get("id")
                    if template_id in expected and template_id not in results:
                        results[template_id] = raw
                for template_id in expected - results.keys():
                    results[template_id] = _failure_audit(template_id, "Node audit omitted this archive")
            except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, CuratorError) as exc:
                message = f"batch audit failed: {exc}"
                for record, _ in verified:
                    results[record["id"]] = _failure_audit(record["id"], message)
    if progress:
        progress(total, total, "Analysen är klar")
    return results


def _major(version: Any) -> int | None:
    if not isinstance(version, str):
        return None
    match = _VERSION_RE.search(version)
    return int(match.group()) if match else None


def _package_compatibility(template_packages: Mapping[str, Any], host_packages: Mapping[str, Any]) -> list[dict[str, Any]]:
    output = []
    for name, raw_version in sorted(template_packages.items()):
        if not isinstance(name, str) or not isinstance(raw_version, str):
            continue
        host_version = host_packages.get(name)
        if not isinstance(host_version, str):
            status = "missing"
        else:
            source_major, host_major = _major(raw_version), _major(host_version)
            status = "compatible" if source_major is None or host_major is None or source_major == host_major else "version-conflict"
        output.append({"name": name, "templateVersion": raw_version, "hostVersion": host_version, "status": status})
    return output


def _feature_candidates(audit: Mapping[str, Any]) -> list[dict[str, Any]]:
    packages = audit.get("packages") if isinstance(audit.get("packages"), dict) else {}
    paths = list(dict.fromkeys([*(audit.get("entryFiles") or []), *(audit.get("routeFiles") or [])]))[:12]
    features = []
    for feature_id, candidates in _FEATURE_PACKAGES.items():
        matched = [name for name in candidates if name in packages]
        if matched:
            features.append({
                "id": feature_id,
                "packages": matched,
                "implementationPaths": paths,
                "implementationRequirement": {
                    "packages": matched,
                    "files": paths,
                },
            })
    for bucket, names in sorted((audit.get("integrations") or {}).items()):
        features.append({
            "id": f"integration:{bucket}",
            "packages": list(names)[:25],
            "implementationPaths": paths,
            "implementationRequirement": {"packages": list(names)[:25], "files": paths, "requiresF3Review": True},
        })
    return features


def _addendum_projection(canonical: Mapping[str, Any], extractor_sha256: str | None) -> dict[str, Any]:
    raw = canonical.get("addendum")
    addendum = _mapping(raw) if raw is not None else {}
    source_sha = str(_pick(addendum, "source_archive_sha256", "sourceArchiveSha256", default="")).lower()
    addendum_extractor = str(_pick(addendum, "extractor_sha256", "extractorSha256", default="")).lower()
    review_status = _pick(addendum, "review_status", "reviewStatus")
    archive_current = source_sha == canonical["archiveSha256"]
    extractor_current = review_status == "reviewed" or bool(extractor_sha256 and addendum_extractor == extractor_sha256)
    canonical_status = canonical.get("addendumStatus")
    if canonical_status in {
        "current",
        "missing",
        "disabled",
        "stale_archive",
        "stale_extractor",
        "invalid_registry",
    }:
        status = canonical_status
    elif not addendum:
        status = "missing"
    elif archive_current and extractor_current:
        status = "current"
    else:
        status = "stale"
    return {
        "status": status,
        "reviewStatus": review_status,
        "sourceArchiveSha256": source_sha or None,
        "extractorSha256": addendum_extractor or None,
        "automaticMutation": False,
        "structuralReferences": [
            _mapping(reference)
            for reference in canonical.get("structuralReferences", ())
        ][:20],
    }


def load_host_packages(repo_root: Path) -> dict[str, str]:
    try:
        package = json.loads((repo_root / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    output: dict[str, str] = {}
    for group in ("dependencies", "devDependencies"):
        raw = package.get(group)
        if isinstance(raw, dict):
            output.update({name: version for name, version in raw.items() if isinstance(name, str) and isinstance(version, str)})
    return output


def profile_template(
    record: Any,
    audit: Mapping[str, Any],
    *,
    host_packages: Mapping[str, str],
    extractor_sha256: str | None,
) -> dict[str, Any]:
    """Bind audit evidence to immutable canonical identity and addendum state."""

    canonical = _canonical_record(record)
    issues = [str(issue) for issue in audit.get("issues", []) if isinstance(issue, str)]
    framework = audit.get("framework") if isinstance(audit.get("framework"), str) else "unknown"
    project_shape = audit.get("projectShape") if isinstance(audit.get("projectShape"), str) else "unknown"
    dependency_metadata_invalid = any(
        re.sub(r"[-_]", "", issue.casefold()).startswith(
            ("dependencies", "devdependencies")
        )
        for issue in issues
    )
    package_json_invalid = (
        audit.get("hasPackageJson") is True and audit.get("packageJsonOk") is False
    )
    rejected = (
        framework not in _RECOGNIZED_FRAMEWORKS
        or project_shape not in {"full-project", "static-site"}
        or any(issue.startswith(_REJECT_ISSUE_PREFIXES) for issue in issues)
        or dependency_metadata_invalid
        or package_json_invalid
    )
    needs_review = any(issue.startswith(_REVIEW_ISSUE_PREFIXES) for issue in issues)
    decision = "rejected" if rejected else "review" if needs_review else "qualified"
    integrations = audit.get("integrations") if isinstance(audit.get("integrations"), dict) else {}
    route_files = audit.get("routeFiles") if isinstance(audit.get("routeFiles"), list) else []
    kind = "app" if integrations or len(route_files) > 1 or audit.get("envUncoveredServer") else "website"
    template_packages = audit.get("packages") if isinstance(audit.get("packages"), dict) else {}
    features = _feature_candidates(audit)
    structural_paths = [
        str(_pick(_mapping(reference), "path", default=""))
        for reference in canonical.get("structuralReferences", ())
    ]
    structural_paths = [path for path in structural_paths if path]
    if structural_paths:
        features.append(
            {
                "id": "addendum-structural-reference",
                "packages": [],
                "implementationPaths": structural_paths[:20],
                "implementationRequirement": {"packages": [], "files": structural_paths[:20]},
            }
        )
    return {
        "templateId": canonical["id"],
        "title": canonical["title"],
        "category": canonical["category"],
        "archiveUrl": canonical["archiveUrl"],
        "archiveSizeBytes": canonical["archiveSizeBytes"],
        "archiveSha256": canonical["archiveSha256"],
        "population": {
            "previewFits": canonical["previewFits"],
            "galleryVisible": canonical["galleryVisible"],
            "siteVisible": canonical["siteVisible"],
            "variantCited": canonical["variantCited"],
            "runtimeFullProjectEligible": canonical["runtimeFullProjectEligible"],
        },
        "decision": decision,
        "kind": kind,
        "framework": framework,
        "projectShape": project_shape,
        "entryFiles": list(audit.get("entryFiles") or [])[:25],
        "routeFiles": route_files[:100],
        "issues": issues,
        "hostCompatibility": {
            "fitsPreviewCaps": bool(audit.get("fitsHostCaps")),
            "packages": _package_compatibility(template_packages, host_packages),
        },
        "features": features,
        "audit": {
            "fileCount": int(audit.get("fileCount") or 0),
            "totalBytes": int(audit.get("totalBytes") or 0),
            "maxFileBytes": int(audit.get("maxFileBytes") or 0),
            "envPlacement": audit.get("envPlacement") or "none",
            "envUncovered": list(audit.get("envUncovered") or [])[:200],
            "integrations": integrations,
        },
        "addendum": _addendum_projection(canonical, extractor_sha256),
    }


def curate_templates(
    records: Iterable[Any],
    *,
    repo_root: Path,
    scope: str,
    extractor_sha256: str | None,
    catalog_counts: Mapping[str, int] | None = None,
    catalog_error: str | None = None,
    addenda_valid: bool | None = None,
    cache_dir: Path | None = None,
    progress: Callable[[int, int, str], None] | None = None,
    node_command: str = "node",
) -> dict[str, Any]:
    selected = list(records)
    audits = run_audit(
        selected,
        repo_root=repo_root,
        cache_dir=cache_dir,
        progress=progress,
        node_command=node_command,
    )
    host_packages = load_host_packages(repo_root)
    profiles = [
        profile_template(
            record,
            audits.get(_canonical_record(record)["id"], _failure_audit(_canonical_record(record)["id"], "missing audit")),
            host_packages=host_packages,
            extractor_sha256=extractor_sha256,
        )
        for record in selected
    ]
    addendum_candidate_ids = [
        profile["templateId"]
        for profile in profiles
        if profile["decision"] != "rejected"
        and profile["population"]["runtimeFullProjectEligible"]
    ]
    addendum_candidate_commands = (
        [
            "npm run templates:addenda -- --write --ids="
            + ",".join(addendum_candidate_ids)
        ]
        if addendum_candidate_ids
        else []
    )
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(UTC).isoformat(),
        "scope": scope,
        "extractorSha256": extractor_sha256,
        "catalog": {
            "counts": dict(catalog_counts or {}),
            "error": catalog_error,
            "addendaValid": addenda_valid,
        },
        "selection": {
            "count": len(profiles),
            "templateIds": [profile["templateId"] for profile in profiles],
            "archiveBindings": [
                {"templateId": profile["templateId"], "archiveSha256": profile["archiveSha256"]}
                for profile in profiles
            ],
        },
        "summary": {
            decision: sum(profile["decision"] == decision for profile in profiles)
            for decision in ("qualified", "review", "rejected")
        },
        "addendumCandidateTemplateIds": addendum_candidate_ids,
        "addendumCandidateCommands": addendum_candidate_commands,
        "addendaCheckCommand": "npm run templates:addenda:check",
        "profiles": profiles,
    }


def write_report(report: Mapping[str, Any], repo_root: Path, *, output_path: Path | None = None) -> Path:
    reports_dir = repo_root / "data" / "backoffice" / "template-curator" / "reports"
    destination_parent = output_path.parent if output_path is not None else reports_dir
    destination_parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"

    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            prefix=".template-curation-",
            suffix=".tmp",
            dir=destination_parent,
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(payload)
            temporary.flush()
            os.fsync(temporary.fileno())

        if output_path is not None:
            # An explicit path retains its previous replace semantics, while
            # the unique staging file prevents concurrent writers from
            # sharing or truncating one another's temporary file.
            os.replace(temporary_path, output_path)
            temporary_path = None
            return output_path

        timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S-%f")
        for _attempt in range(128):
            destination = reports_dir / (
                f"template-curation-{timestamp}-{os.getpid()}-"
                f"{secrets.token_hex(8)}.json"
            )
            try:
                # Hard-link publication is exclusive (never overwrites an
                # existing report) and exposes only the fully fsynced inode.
                os.link(temporary_path, destination)
            except FileExistsError:
                continue
            temporary_path.unlink()
            temporary_path = None
            return destination
        raise CuratorError("could not allocate a unique report path")
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
