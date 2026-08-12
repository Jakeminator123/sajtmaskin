from __future__ import annotations

import hashlib
import io
import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.template_curator.runner import profile_template

REPO_ROOT = Path(__file__).resolve().parents[1]
AUDITOR = REPO_ROOT / "scripts/v0-templates/audit-template-repos.mjs"


def _zip_bytes(files: dict[str, str | bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def _next_project(page: str, **extra_files: str) -> bytes:
    return _zip_bytes(
        {
            "package.json": json.dumps(
                {
                    "scripts": {"dev": "next dev"},
                    "dependencies": {"next": "16.0.0", "react": "19.0.0"},
                }
            ),
            "app/page.tsx": page,
            **extra_files,
        }
    )


class TemplateCuratorAuditSecurityTests(unittest.TestCase):
    def _run_audit(self, archives: dict[str, bytes]) -> dict[str, dict[str, object]]:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            archive_dir = root / "archives"
            archive_dir.mkdir()
            for name, payload in archives.items():
                (archive_dir / f"{name}.zip").write_bytes(payload)
            output = root / "report.json"
            completed = subprocess.run(
                [
                    "node",
                    str(AUDITOR),
                    "--dir",
                    str(archive_dir),
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
            return {row["id"]: row for row in json.loads(output.read_text(encoding="utf-8"))}

    def test_malformed_dev_dependencies_rejects_the_profile(self) -> None:
        payload = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite"},
                        "dependencies": {"vite": "7.0.0"},
                        "devDependencies": [],
                    }
                ),
                "index.html": "<main></main>",
                "src/main.tsx": "export default function App() { return null }",
            }
        )
        audit = self._run_audit({"bad-dev-deps": payload})["bad-dev-deps"]
        self.assertFalse(audit["packageJsonOk"])
        self.assertIn("dependencies-invalid-shape", audit["issues"])

        digest = hashlib.sha256(payload).hexdigest()
        profile = profile_template(
            {
                "id": "bad-dev-deps",
                "title": "bad-dev-deps",
                "category": "test",
                "archiveUrl": "https://unit.public.blob.vercel-storage.com/bad.zip",
                "archiveSizeBytes": len(payload),
                "archiveSha256": digest,
            },
            audit,
            host_packages={},
            extractor_sha256="a" * 64,
        )
        self.assertEqual(profile["decision"], "rejected")

    def test_dependency_entries_and_counts_invalidate_package_json(self) -> None:
        invalid_entry = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite"},
                        "dependencies": {"vite": "7.0.0"},
                        "devDependencies": {"typescript": []},
                    }
                ),
                "index.html": "<main></main>",
                "src/main.tsx": "export default function App() { return null }",
            }
        )
        invalid_count = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite"},
                        "dependencies": {f"package-{index}": "1.0.0" for index in range(1_001)},
                    }
                ),
                "vite.config.js": "export default {}",
                "index.html": "<main></main>",
                "src/main.tsx": "export default function App() { return null }",
            }
        )
        audits = self._run_audit({"bad-entry": invalid_entry, "bad-count": invalid_count})
        self.assertFalse(audits["bad-entry"]["packageJsonOk"])
        self.assertIn("dependencies-invalid-entry", audits["bad-entry"]["issues"])
        self.assertFalse(audits["bad-count"]["packageJsonOk"])
        self.assertIn("dependencies-invalid-count", audits["bad-count"]["issues"])

    def test_template_literal_scans_expressions_but_not_literal_text(self) -> None:
        payload = _next_project(
            "const label = `literal process.env.LITERAL_ONLY ${process.env.REAL_SECRET}`;\n"
            "export default function Page() { return <main>{label}</main> }"
        )
        audit = self._run_audit({"template-expression": payload})["template-expression"]
        self.assertIn("REAL_SECRET", audit["envUncovered"])
        self.assertNotIn("LITERAL_ONLY", audit["envUncovered"])
        self.assertEqual(audit["envPlacement"], "crash-on-load")

    def test_expression_bodied_arrow_env_read_is_lazy(self) -> None:
        payload = _next_project(
            "const readSecret = () => process.env.LAZY_SECRET;\n"
            "export default function Page() { return <main>{readSecret()}</main> }"
        )
        audit = self._run_audit({"expression-arrow": payload})["expression-arrow"]
        self.assertEqual(audit["envUncovered"], ["LAZY_SECRET"])
        self.assertEqual(audit["envPlacement"], "lazy-only")
        self.assertFalse(audit["envPlacementDetail"][0]["topLevel"])

    def test_vite_astro_and_sveltekit_env_syntax_requires_review(self) -> None:
        vite = _zip_bytes(
            {
                "package.json": json.dumps(
                    {"scripts": {"dev": "vite"}, "dependencies": {"vite": "7.0.0"}}
                ),
                "index.html": "<div id='app'></div>",
                "src/main.ts": (
                    "const direct = import.meta.env.VITE_REQUIRED_TOKEN;\n"
                    'const bracket = import.meta.env["VITE_BRACKET_TOKEN"];\n'
                    "const mode = import.meta.env.MODE;\n"
                    "const dev = import.meta.env.DEV;\n"
                    "document.body.dataset.ready = String(direct || bracket || mode || dev);"
                ),
            }
        )
        astro = _zip_bytes(
            {
                "package.json": json.dumps(
                    {"scripts": {"dev": "astro dev"}, "dependencies": {"astro": "5.0.0"}}
                ),
                "astro.config.mjs": "export default {}",
                "src/pages/index.astro": (
                    "---\nconst token = import.meta.env.ASTRO_REQUIRED_TOKEN;\n---\n"
                    "<main>{token}</main>"
                ),
            }
        )
        sveltekit = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite dev"},
                        "dependencies": {"@sveltejs/kit": "2.0.0"},
                    }
                ),
                "svelte.config.js": "export default {}",
                "src/routes/+page.svelte": (
                    "<script>\n"
                    "import { SVELTE_PRIVATE_TOKEN } from '$env/static/private';\n"
                    "import { env } from '$env/dynamic/private';\n"
                    "const publicToken = import.meta.env.PUBLIC_WIDGET_TOKEN;\n"
                    "</script>\n<main>{publicToken}</main>"
                ),
                "src/lib/required.cjs": (
                    "const { SVELTE_REQUIRED_TOKEN } = require('$env/static/private');\n"
                    "module.exports = SVELTE_REQUIRED_TOKEN;"
                ),
            }
        )
        payloads = {"vite-env": vite, "astro-env": astro, "svelte-env": sveltekit}
        audits = self._run_audit(payloads)
        expected = {
            "vite-env": {"VITE_REQUIRED_TOKEN", "VITE_BRACKET_TOKEN"},
            "astro-env": {"ASTRO_REQUIRED_TOKEN"},
            "svelte-env": {
                "PUBLIC_WIDGET_TOKEN",
                "SVELTEKIT_DYNAMIC_PRIVATE",
                "SVELTE_PRIVATE_TOKEN",
                "SVELTE_REQUIRED_TOKEN",
            },
        }
        for name, keys in expected.items():
            with self.subTest(name=name):
                audit = audits[name]
                self.assertTrue(keys.issubset(set(audit["envUncovered"])), audit)
                self.assertFalse({"MODE", "DEV"} & set(audit["envUncovered"]), audit)
                self.assertTrue(any(issue.startswith("env-missing-") for issue in audit["issues"]))
                digest = hashlib.sha256(payloads[name]).hexdigest()
                profile = profile_template(
                    {
                        "id": name,
                        "title": name,
                        "category": "test",
                        "archiveUrl": f"https://unit.public.blob.vercel-storage.com/{name}.zip",
                        "archiveSizeBytes": len(payloads[name]),
                        "archiveSha256": digest,
                    },
                    audit,
                    host_packages={},
                    extractor_sha256="a" * 64,
                )
                self.assertNotEqual(profile["decision"], "qualified")
        self.assertEqual(audits["vite-env"]["envUncoveredServer"], [])
        self.assertIn("env-missing-public(2)", audits["vite-env"]["issues"])

    def test_env_like_literals_comments_and_framework_markup_stay_clean(self) -> None:
        vite = _zip_bytes(
            {
                "package.json": json.dumps(
                    {"scripts": {"dev": "vite"}, "dependencies": {"vite": "7.0.0"}}
                ),
                "index.html": "<div id='app'></div>",
                "src/main.ts": (
                    'const literal = "import.meta.env.FAKE_LITERAL";\n'
                    "const template = `import.meta.env.FAKE_TEMPLATE`;\n"
                    "// import.meta.env.FAKE_COMMENT\n"
                    "document.body.textContent = literal + template;"
                ),
            }
        )
        astro = _zip_bytes(
            {
                "package.json": json.dumps(
                    {"scripts": {"dev": "astro dev"}, "dependencies": {"astro": "5.0.0"}}
                ),
                "astro.config.mjs": "export default {}",
                "src/pages/index.astro": (
                    '---\nconst literal = "import.meta.env.FAKE_FRONTMATTER";\n'
                    "// import.meta.env.FAKE_COMMENT\n---\n"
                    "<!-- <script>const fake = import.meta.env.FAKE_HTML_COMMENT</script> -->\n"
                    "<p>import.meta.env.FAKE_MARKUP</p>"
                ),
            }
        )
        sveltekit = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite dev"},
                        "dependencies": {"@sveltejs/kit": "2.0.0"},
                    }
                ),
                "svelte.config.js": "export default {}",
                "src/routes/+page.svelte": (
                    "<script>\n"
                    "const literal = \"import { FAKE } from '$env/static/private'\";\n"
                    "const template = `import.meta.env.FAKE_TEMPLATE`;\n"
                    "// import.meta.env.FAKE_COMMENT\n"
                    "</script>\n"
                    "<!-- <script>const fake = import.meta.env.FAKE_HTML_COMMENT</script> -->\n"
                    "<p>import.meta.env.FAKE_MARKUP</p>"
                ),
            }
        )
        audits = self._run_audit(
            {"vite-literals": vite, "astro-literals": astro, "svelte-literals": sveltekit}
        )
        for name, audit in audits.items():
            with self.subTest(name=name):
                self.assertEqual(audit["envRefCount"], 0, audit)
                self.assertFalse(any(issue.startswith("env-missing-") for issue in audit["issues"]))

    def test_oversized_eligible_source_reports_incomplete_scan(self) -> None:
        payload = _next_project("export default function Page() { return null }\n" + " " * (520 * 1024))
        audit = self._run_audit({"large-page": payload})["large-page"]
        self.assertIn("env-scan-incomplete(file-size)", audit["issues"])

    def test_total_source_budget_reports_incomplete_scan(self) -> None:
        filler = "export const value = 'safe';\n" + " " * (480 * 1024)
        files = {f"lib/chunk-{index}.tsx": filler for index in range(18)}
        payload = _next_project("export default function Page() { return null }", **files)
        audit = self._run_audit({"total-budget": payload})["total-budget"]
        self.assertTrue(
            any(issue.startswith("env-scan-incomplete(") and "total-bytes" in issue for issue in audit["issues"]),
            audit["issues"],
        )

    def test_per_file_evidence_cap_reports_incomplete_scan(self) -> None:
        source = "\n".join(f"const value{index} = process.env.SECRET_{index};" for index in range(41))
        payload = _next_project(source)
        audit = self._run_audit({"evidence-budget": payload})["evidence-budget"]
        self.assertIn("env-scan-incomplete(evidence-cap)", audit["issues"])
        self.assertLessEqual(len(audit["envPlacementDetail"]), 40)

    def test_regex_literal_quotes_do_not_mask_later_env_reads(self) -> None:
        payload = _next_project(
            'const re = /["\' ]/; const token = process.env.REGEX_FOLLOWED_SECRET;\n'
            "export default function Page() { return <main>{token}</main> }"
        )
        audit = self._run_audit({"regex-env": payload})["regex-env"]
        self.assertIn("REGEX_FOLLOWED_SECRET", audit["envUncovered"])

    def test_env_like_text_inside_regex_literals_is_not_an_env_read(self) -> None:
        payload = _next_project(
            "const re = /process.env.FAKE_IN_REGEX/;\n"
            "export default function Page() { return <main /> }"
        )
        audit = self._run_audit({"regex-fake": payload})["regex-fake"]
        self.assertNotIn("FAKE_IN_REGEX", audit["envUncovered"])

    def test_node_downloader_restricts_urls_and_disables_redirects(self) -> None:
        program = """
          import { ARCHIVE_REDIRECT_POLICY, isAllowedArchiveUrl } from './scripts/v0-templates/audit-template-repos.mjs';
          const urls = JSON.parse(process.argv[1]);
          console.log(JSON.stringify({ policy: ARCHIVE_REDIRECT_POLICY, allowed: urls.map(isAllowedArchiveUrl) }));
        """
        urls = [
            "https://unit.public.blob.vercel-storage.com/archive.zip",
            "https://user:secret@unit.public.blob.vercel-storage.com/archive.zip",
            "http://unit.public.blob.vercel-storage.com/archive.zip",
            "https://blob.vercel-storage.com.evil.example/archive.zip",
            "https://example.com/archive.zip",
        ]
        completed = subprocess.run(
            ["node", "--input-type=module", "--eval", program, json.dumps(urls)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertEqual(result["policy"], "error")
        self.assertEqual(result["allowed"], [True, False, False, False, False])


if __name__ == "__main__":
    unittest.main()
