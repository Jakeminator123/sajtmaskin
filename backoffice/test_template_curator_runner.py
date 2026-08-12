from __future__ import annotations

import hashlib
import io
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.template_curator.runner import (
    MAX_ARCHIVE_BYTES,
    CuratorError,
    download_verified_archive,
    inspect_zip_safety,
    profile_template,
    run_audit,
)

REPO_ROOT = Path(__file__).resolve().parents[1]


def _zip_bytes(files: dict[str, str | bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def _record(template_id: str, payload: bytes, **extra: object) -> dict[str, object]:
    return {
        "id": template_id,
        "title": template_id,
        "category": "test",
        "archiveUrl": f"https://unit.public.blob.vercel-storage.com/{template_id}.zip",
        "archiveSizeBytes": len(payload),
        "archiveSha256": hashlib.sha256(payload).hexdigest(),
        **extra,
    }


class _Response(io.BytesIO):
    def __init__(self, payload: bytes, *, content_length: int | None = None) -> None:
        super().__init__(payload)
        self.headers = {"Content-Length": str(content_length if content_length is not None else len(payload))}

    def geturl(self) -> str:
        return "https://unit.public.blob.vercel-storage.com/archive.zip"


class TemplateCuratorDownloadTests(unittest.TestCase):
    def test_download_is_sha_verified_and_reuses_digest_cache(self) -> None:
        payload = _zip_bytes({"INDEX.HTM": "<h1>Hello</h1>"})
        record = _record("static", payload)
        calls = 0

        def opener(_url: str, _timeout: int) -> _Response:
            nonlocal calls
            calls += 1
            return _Response(payload)

        with tempfile.TemporaryDirectory() as raw:
            first = download_verified_archive(record, Path(raw), opener=opener)
            second = download_verified_archive(record, Path(raw), opener=opener)
        self.assertFalse(first.from_cache)
        self.assertTrue(second.from_cache)
        self.assertEqual(calls, 1)
        self.assertEqual(first.archive_sha256, record["archiveSha256"])

    def test_download_rejects_content_length_before_streaming(self) -> None:
        payload = _zip_bytes({"index.html": "ok"})
        record = _record("oversize", payload)
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(CuratorError, "Content-Length"):
                download_verified_archive(
                    record,
                    Path(raw),
                    opener=lambda _url, _timeout: _Response(payload, content_length=MAX_ARCHIVE_BYTES + 1),
                )

    def test_download_rejects_sha_mismatch_and_removes_temporary_file(self) -> None:
        payload = _zip_bytes({"index.html": "ok"})
        record = _record("bad-sha", payload)
        record["archiveSha256"] = "a" * 64
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(CuratorError, "SHA-256"):
                download_verified_archive(record, Path(raw), opener=lambda _url, _timeout: _Response(payload))
            self.assertEqual(list(Path(raw).iterdir()), [])


class TemplateCuratorZipGuardTests(unittest.TestCase):
    def test_path_traversal_is_rejected(self) -> None:
        payload = _zip_bytes({"../escape.txt": "bad"})
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "bad.zip"
            path.write_bytes(payload)
            with self.assertRaisesRegex(CuratorError, "unsafe archive path"):
                inspect_zip_safety(path)

    def test_high_compression_ratio_is_rejected(self) -> None:
        payload = _zip_bytes({"huge.txt": b"0" * (2 * 1024 * 1024)})
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "bomb.zip"
            path.write_bytes(payload)
            with self.assertRaisesRegex(CuratorError, "compression ratio"):
                inspect_zip_safety(path)


class TemplateCuratorAuditTests(unittest.TestCase):
    def _run_node_audit(self, archives: dict[str, bytes]) -> list[dict[str, object]]:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            for name, payload in archives.items():
                (root / f"{name}.zip").write_bytes(payload)
            output = root / "report.json"
            completed = subprocess.run(
                [
                    "node",
                    str(REPO_ROOT / "scripts/v0-templates/audit-template-repos.mjs"),
                    "--dir",
                    str(root),
                    "--out",
                    str(output),
                    "--quiet",
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            return json.loads(output.read_text(encoding="utf-8"))

    def test_frameworks_and_one_file_static_are_recognized_end_to_end(self) -> None:
        vite = _zip_bytes(
            {
                "package.json": json.dumps({"scripts": {"dev": "vite"}, "dependencies": {"vite": "^7.0.0"}}),
                "index.html": "<div id='root'></div>",
                "src/main.tsx": "export default function App() { return null }",
            }
        )
        astro = _zip_bytes(
            {
                "package.json": json.dumps({"scripts": {"dev": "astro dev"}, "dependencies": {"astro": "^5.0.0"}}),
                "astro.config.mjs": "export default {}",
                "src/pages/index.astro": "<h1>Astro</h1>",
            }
        )
        remix = _zip_bytes(
            {
                "package.json": json.dumps({"scripts": {"dev": "remix vite:dev"}, "dependencies": {"@remix-run/react": "^2.0.0"}}),
                "app/root.tsx": "export default function Root() { return null }",
                "app/routes/_index.tsx": "export default function Index() { return null }",
            }
        )
        svelte = _zip_bytes(
            {
                "package.json": json.dumps({"scripts": {"dev": "vite dev"}, "dependencies": {"@sveltejs/kit": "^2.0.0"}}),
                "svelte.config.js": "export default {}",
                "src/routes/+page.svelte": "<h1>Svelte</h1>",
            }
        )
        static = _zip_bytes({"INDEX.HTM": "<h1>One file</h1>"})
        result = {row["id"]: row for row in self._run_node_audit({"vite": vite, "astro": astro, "remix": remix, "svelte": svelte, "static": static})}
        self.assertEqual(result["vite"]["framework"], "vite")
        self.assertEqual(result["astro"]["framework"], "astro")
        self.assertEqual(result["remix"]["framework"], "remix")
        self.assertEqual(result["svelte"]["framework"], "sveltekit")
        self.assertEqual(result["static"]["framework"], "static-html")
        self.assertEqual(result["static"]["projectShape"], "static-site")
        self.assertFalse(any(issue == "missing-recognized-entry" for issue in result["static"]["issues"]))

    def test_hostile_package_shape_and_env_evidence_are_bounded(self) -> None:
        env_source = "\n".join(f"const k{i} = process.env.SECRET_{i}" for i in range(500))
        hostile = _zip_bytes(
            {
                "package.json": json.dumps({"scripts": {"dev": "vite"}, "dependencies": ["not", "an", "object"]}),
                "index.html": "<div></div>",
                "src/main.tsx": env_source,
            }
        )
        result = self._run_node_audit({"hostile": hostile})[0]
        self.assertIn("dependencies-invalid-shape", result["issues"])
        self.assertLessEqual(len(result["envPlacementDetail"]), 40)
        self.assertLessEqual(result["envRefCount"], 40)

    def test_failure_isolation_preserves_valid_archive(self) -> None:
        valid = _zip_bytes({"index.html": "<h1>valid</h1>"})
        invalid = b"not-a-zip"
        records = [_record("valid", valid), _record("invalid", invalid)]
        with tempfile.TemporaryDirectory() as raw:
            cache = Path(raw)
            for record, payload in zip(records, (valid, invalid), strict=True):
                (cache / f"{record['archiveSha256']}.zip").write_bytes(payload)
            output = run_audit(records, repo_root=REPO_ROOT, cache_dir=cache)
        self.assertEqual(output["valid"]["framework"], "static-html")
        self.assertTrue(output["invalid"]["issues"][0].startswith("audit-error:"))


class TemplateCuratorProfileTests(unittest.TestCase):
    def test_profile_binds_archive_extractor_addendum_and_feature_paths(self) -> None:
        payload = _zip_bytes({"index.html": "ok"})
        extractor = "b" * 64
        record = _record(
            "bound",
            payload,
            addendum_source_archive_sha256=hashlib.sha256(payload).hexdigest(),
            addendum_extractor_sha256=extractor,
            addendum_review_status="generated",
        )
        audit = {
            "framework": "vite",
            "projectShape": "full-project",
            "fitsHostCaps": True,
            "fileCount": 3,
            "totalBytes": 200,
            "maxFileBytes": 100,
            "entryFiles": ["src/main.tsx"],
            "routeFiles": [],
            "issues": [],
            "packages": {"framer-motion": "^12.0.0"},
            "integrations": {},
        }
        profile = profile_template(record, audit, host_packages={"framer-motion": "^12.1.0"}, extractor_sha256=extractor)
        self.assertEqual(profile["decision"], "qualified")
        self.assertEqual(profile["kind"], "website")
        self.assertEqual(profile["addendum"]["status"], "current")
        self.assertEqual(profile["archiveSha256"], hashlib.sha256(payload).hexdigest())
        self.assertEqual(profile["features"][0]["implementationPaths"], ["src/main.tsx"])
        self.assertFalse(profile["addendum"]["automaticMutation"])


if __name__ == "__main__":
    unittest.main()
