"""Security and publication guards for the Template (v0-mall) curator."""

from __future__ import annotations

import hashlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from backoffice.pages import template_curator as page
from scripts.template_curator import runner
from scripts.template_curator.runner import CuratorError


REPO_ROOT = Path(__file__).resolve().parents[1]


def _zip_bytes(files: dict[str, str] | None = None) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(
        output, "w", compression=zipfile.ZIP_DEFLATED
    ) as archive:
        for name, content in (files or {"index.html": "<h1>Safe</h1>"}).items():
            archive.writestr(name, content)
    return output.getvalue()


def _record(
    template_id: str,
    *,
    runtime_eligible: bool = True,
    payload: bytes | None = None,
) -> dict[str, object]:
    archive = payload or _zip_bytes()
    return {
        "id": template_id,
        "title": template_id,
        "category": "test",
        "archiveUrl": (
            "https://unit.public.blob.vercel-storage.com/"
            f"{template_id}.zip"
        ),
        "archiveSizeBytes": len(archive),
        "archiveSha256": hashlib.sha256(archive).hexdigest(),
        "runtimeFullProjectEligible": runtime_eligible,
    }


class _Response(io.BytesIO):
    def __init__(
        self,
        payload: bytes,
        *,
        final_url: str,
        location: str | None = None,
    ) -> None:
        super().__init__(payload)
        self._final_url = final_url
        self.headers = {"Content-Length": str(len(payload))}
        if location is not None:
            self.headers["Location"] = location

    def geturl(self) -> str:
        return self._final_url


class VerifiedDownloaderHostGuardsTests(unittest.TestCase):
    def _assert_final_url_rejected(self, final_url: str, secret: str) -> None:
        payload = _zip_bytes()
        record = _record("hostile-final", payload=payload)
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaises(CuratorError) as raised:
                runner.download_verified_archive(
                    record,
                    Path(raw),
                    opener=lambda _url, _timeout: _Response(
                        payload, final_url=final_url
                    ),
                )
            self.assertNotIn(secret, str(raised.exception))
            self.assertEqual(list(Path(raw).iterdir()), [])

    def test_injected_response_rejects_final_url_on_non_blob_host(self) -> None:
        self._assert_final_url_rejected(
            "https://attacker.example/archive.zip?secret=do-not-leak",
            "do-not-leak",
        )

    def test_injected_response_rejects_credentials_in_final_url(self) -> None:
        self._assert_final_url_rejected(
            (
                "https://operator:do-not-leak@"
                "unit.public.blob.vercel-storage.com/archive.zip"
            ),
            "do-not-leak",
        )

    def test_injected_response_validates_and_rejects_location_header(self) -> None:
        payload = _zip_bytes()
        record = _record("hostile-location", payload=payload)
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaises(CuratorError) as raised:
                runner.download_verified_archive(
                    record,
                    Path(raw),
                    opener=lambda _url, _timeout: _Response(
                        payload,
                        final_url=record["archiveUrl"],
                        location=(
                            "https://operator:location-secret@"
                            "unit.public.blob.vercel-storage.com/redirect.zip"
                        ),
                    ),
                )
            self.assertNotIn("location-secret", str(raised.exception))
            self.assertEqual(list(Path(raw).iterdir()), [])


def _audit(
    *,
    issues: list[str] | None = None,
    has_package_json: bool = False,
    package_json_ok: bool = False,
) -> dict[str, object]:
    return {
        "framework": "vite",
        "projectShape": "full-project",
        "fitsHostCaps": True,
        "fileCount": 3,
        "totalBytes": 100,
        "maxFileBytes": 50,
        "entryFiles": ["src/main.tsx"],
        "routeFiles": [],
        "issues": issues or [],
        "packages": {},
        "integrations": {},
        "hasPackageJson": has_package_json,
        "packageJsonOk": package_json_ok,
    }


class AddendumCandidatePublicationTests(unittest.TestCase):
    def test_node_dependency_finding_ends_as_rejected_profile(self) -> None:
        payload = _zip_bytes(
            {
                "package.json": (
                    '{"scripts":{"dev":"vite"},"dependencies":{"vite":"^7"},'
                    '"devDependencies":["invalid"]}'
                ),
                "index.html": "<div id='root'></div>",
                "src/main.tsx": "export default function App() { return null }",
            }
        )
        record = _record("malformed-dev-dependencies", payload=payload)
        with tempfile.TemporaryDirectory() as raw:
            cache = Path(raw)
            (cache / f"{record['archiveSha256']}.zip").write_bytes(payload)
            audit = runner.run_audit(
                [record],
                repo_root=REPO_ROOT,
                cache_dir=cache,
            )[record["id"]]
        profile = runner.profile_template(
            record,
            audit,
            host_packages={},
            extractor_sha256=None,
        )
        self.assertIn("dependencies-invalid-shape", audit["issues"])
        self.assertFalse(audit["packageJsonOk"])
        self.assertEqual(profile["decision"], "rejected")

    def test_report_only_offers_non_rejected_runtime_eligible_ids(self) -> None:
        records = [
            _record("qualified"),
            _record("review"),
            _record("dependency-rejected"),
            _record("package-json-rejected"),
            _record("runtime-ineligible", runtime_eligible=False),
        ]
        audits = {
            "qualified": _audit(),
            "review": _audit(issues=["env-scan-incomplete(files=201)"]),
            "dependency-rejected": _audit(
                issues=["devDependencies-invalid-entry"],
                has_package_json=True,
                package_json_ok=False,
            ),
            "package-json-rejected": _audit(
                has_package_json=True,
                package_json_ok=False,
            ),
            "runtime-ineligible": _audit(),
        }
        with (
            mock.patch.object(runner, "run_audit", return_value=audits),
            mock.patch.object(runner, "load_host_packages", return_value={}),
        ):
            report = runner.curate_templates(
                records,
                repo_root=REPO_ROOT,
                scope="blob",
                extractor_sha256="e" * 64,
            )

        decisions = {
            profile["templateId"]: profile["decision"]
            for profile in report["profiles"]
        }
        self.assertEqual(decisions["qualified"], "qualified")
        self.assertEqual(decisions["review"], "review")
        self.assertEqual(decisions["dependency-rejected"], "rejected")
        self.assertEqual(decisions["package-json-rejected"], "rejected")
        self.assertEqual(decisions["runtime-ineligible"], "qualified")
        self.assertEqual(
            report["addendumCandidateTemplateIds"],
            ["qualified", "review"],
        )
        self.assertEqual(
            report["addendumCandidateCommands"],
            [
                "npm run templates:addenda -- --write "
                "--ids=qualified,review"
            ],
        )
        self.assertTrue(
            all(
                "candidateCommands" not in profile["addendum"]
                for profile in report["profiles"]
            )
        )

    def test_empty_candidate_set_has_no_write_command(self) -> None:
        record = _record("runtime-ineligible", runtime_eligible=False)
        with (
            mock.patch.object(
                runner,
                "run_audit",
                return_value={"runtime-ineligible": _audit()},
            ),
            mock.patch.object(runner, "load_host_packages", return_value={}),
        ):
            report = runner.curate_templates(
                [record],
                repo_root=REPO_ROOT,
                scope="blob",
                extractor_sha256=None,
            )
        self.assertEqual(report["addendumCandidateTemplateIds"], [])
        self.assertEqual(report["addendumCandidateCommands"], [])
        self.assertEqual(
            report["addendaCheckCommand"],
            "npm run templates:addenda:check",
        )

    def test_ui_consumes_runner_commands_without_rebuilding_selected_ids(
        self,
    ) -> None:
        report = {
            "addendumCandidateCommands": [
                "npm run templates:addenda -- --write --ids=approved"
            ]
        }
        self.assertEqual(
            page._addendum_write_commands(report),
            ("npm run templates:addenda -- --write --ids=approved",),
        )
        self.assertEqual(page._addendum_write_commands({}), ())

    def test_npm_command_tuple_keeps_runner_owned_ids(self) -> None:
        self.assertEqual(
            page._npm_command_tuple(
                "npm run templates:addenda -- --write --ids=approved"
            ),
            (
                "npm",
                "run",
                "templates:addenda",
                "--",
                "--write",
                "--ids=approved",
            ),
        )

    def test_npm_command_tuple_rejects_non_npm(self) -> None:
        with self.assertRaises(ValueError):
            page._npm_command_tuple("python -c pass")


if __name__ == "__main__":
    unittest.main()
