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

    def test_regex_literal_quotes_do_not_mask_a_following_env_read(self) -> None:
        payload = _next_project(
            'const re = /["\']/; const quotient = 10 / 2;\n'
            "const token = process.env.SECRET_AFTER_REGEX + String(quotient);\n"
            'const bracketToken = process.env["SECRET_BRACKET_AFTER_REGEX"];\n'
            'const escaped = /[\\/"\'\\]]+/gimu;\n'
            "export default function Page() {"
            " return <main>{token + bracketToken + String(re) + escaped.source}</main>"
            " }"
        )
        audit = self._run_audit({"regex-before-env": payload})["regex-before-env"]
        self.assertEqual(
            audit["envUncovered"],
            ["SECRET_AFTER_REGEX", "SECRET_BRACKET_AFTER_REGEX"],
        )
        self.assertIn("env-missing-server(2)", audit["issues"])

    def test_regex_expression_after_control_heads_and_block_keeps_scanning(self) -> None:
        suffix = (
            " const token = process.env.SECRET_AFTER_STATEMENT_REGEX;"
            " export default function Page(){return <main>{token}</main>}"
        )
        sources = {
            "if-regex": "const gate=true; if (gate) /[\"']/.test('x');" + suffix,
            "while-regex": "let gate=false; while (gate) /[\"']/.test('x');" + suffix,
            "block-regex": "{} /[\"']/.test('x');" + suffix,
        }
        audits = self._run_audit(
            {name: _next_project(source) for name, source in sources.items()}
        )
        for name, audit in audits.items():
            with self.subTest(name=name):
                self.assertEqual(audit["envUncovered"], ["SECRET_AFTER_STATEMENT_REGEX"])
                self.assertIn("env-missing-server(1)", audit["issues"])

    def test_call_and_parenthesized_division_do_not_start_regex_literals(self) -> None:
        payload = _next_project(
            "const factory = () => 8;\n"
            'const callRatio = factory() / "\'".length;\n'
            "const groupedRatio = (10 + 2) / 2;\n"
            "const catchRatio = Promise.resolve(8).catch(() => 8) / 2;\n"
            "const token = process.env.SECRET_AFTER_DIVISION;\n"
            "export default function Page() {"
            " return <main>{token + callRatio + groupedRatio + catchRatio}</main>"
            " }"
        )
        audit = self._run_audit({"call-division": payload})["call-division"]
        self.assertEqual(audit["envUncovered"], ["SECRET_AFTER_DIVISION"])
        self.assertIn("env-missing-server(1)", audit["issues"])

    def test_typescript_parser_handles_previously_ambiguous_grammar(self) -> None:
        sources = {
            "for-await": (
                "async function consume(stream) {"
                " for await (const item of stream) /[\"']/.test(item);"
                " return process.env.LAZY_FOR_AWAIT;"
                " }"
                " export default function Page(){return null}"
            ),
            "case-block": (
                "const mode = 1; switch (mode) { case 1: { /[\"']/.test('x'); break; } }"
                " const token = process.env.SECRET_AFTER_CASE_BLOCK;"
                " export default function Page(){return <main>{token}</main>}"
            ),
            "function-division": (
                "const ratio = function () { return 8 } / 2;"
                " const token = process.env.SECRET_AFTER_FUNCTION_DIVISION;"
                " export default function Page(){return <main>{token + ratio}</main>}"
            ),
            "template-object-division": (
                "const value = `${{ amount: 8 }.amount / 2}`;"
                " const token = process.env.SECRET_AFTER_TEMPLATE_DIVISION;"
                " export default function Page(){return <main>{token + value}</main>}"
            ),
        }
        audits = self._run_audit(
            {name: _next_project(source) for name, source in sources.items()}
        )
        expected = {
            "for-await": "LAZY_FOR_AWAIT",
            "case-block": "SECRET_AFTER_CASE_BLOCK",
            "function-division": "SECRET_AFTER_FUNCTION_DIVISION",
            "template-object-division": "SECRET_AFTER_TEMPLATE_DIVISION",
        }
        for name, key in expected.items():
            with self.subTest(name=name):
                audit = audits[name]
                self.assertEqual(audit["envUncovered"], [key], audit)
                self.assertFalse(
                    any(issue.startswith("env-scan-incomplete(parse)") for issue in audit["issues"]),
                    audit,
                )
        self.assertEqual(audits["for-await"]["envPlacement"], "lazy-only")
        self.assertFalse(audits["for-await"]["envPlacementDetail"][0]["topLevel"])

    def test_parse_diagnostic_with_env_candidate_forces_review(self) -> None:
        payload = _next_project(
            "const broken = ; const token = process . env . SECRET_WITH_PARSE_ERROR;"
            " export default function Page(){return <main>{token}</main>}"
        )
        audit = self._run_audit({"parse-error": payload})["parse-error"]
        self.assertIn("env-scan-incomplete(parse)", audit["issues"])
        digest = hashlib.sha256(payload).hexdigest()
        profile = profile_template(
            {
                "id": "parse-error",
                "title": "parse-error",
                "category": "test",
                "archiveUrl": "https://unit.public.blob.vercel-storage.com/parse-error.zip",
                "archiveSizeBytes": len(payload),
                "archiveSha256": digest,
            },
            audit,
            host_packages={},
            extractor_sha256="a" * 64,
        )
        self.assertEqual(profile["decision"], "review")

    def test_unclosed_framework_code_region_forces_parse_review(self) -> None:
        astro = _zip_bytes(
            {
                "package.json": json.dumps(
                    {"scripts": {"dev": "astro dev"}, "dependencies": {"astro": "5.0.0"}}
                ),
                "astro.config.mjs": "export default {}",
                "src/pages/index.astro": "---\nconst token = import.meta.env.ASTRO_UNCLOSED;",
            }
        )
        svelte = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite dev"},
                        "dependencies": {"@sveltejs/kit": "2.0.0"},
                    }
                ),
                "svelte.config.js": "export default {}",
                "src/routes/+page.svelte": (
                    "<script>const token = import.meta.env.PUBLIC_UNCLOSED;"
                ),
            }
        )
        audits = self._run_audit({"astro-unclosed": astro, "svelte-unclosed": svelte})
        for name, audit in audits.items():
            with self.subTest(name=name):
                self.assertIn("env-scan-incomplete(parse)", audit["issues"], audit)

    def test_svelte_require_wrappers_and_property_access_are_not_clean(self) -> None:
        payload = _next_project(
            "const direct = require('$env/static/private').SVELTE_DIRECT_SECRET;\n"
            "const { SVELTE_CAST_SECRET } ="
            " require('$env/static/private') as { SVELTE_CAST_SECRET: string };\n"
            "const { ...rest } = require('$env/static/private');\n"
            "const dynamicEnv = require('$env/dynamic/private')!;\n"
            "export default function Page(){"
            "return <main>{String(direct || dynamicEnv || rest)}</main>}"
        )
        audit = self._run_audit({"svelte-require-wrappers": payload})[
            "svelte-require-wrappers"
        ]
        self.assertTrue(
            {
                "SVELTE_DIRECT_SECRET",
                "SVELTE_CAST_SECRET",
                "SVELTEKIT_STATIC_PRIVATE",
                "SVELTEKIT_DYNAMIC_PRIVATE",
            }.issubset(set(audit["envUncovered"])),
            audit,
        )
        self.assertIn("env-missing-server(4)", audit["issues"])

    def test_svelte_require_inside_fallback_expression_is_not_clean(self) -> None:
        payload = _next_project(
            "const nullish = require('$env/static/private').NULLISH_SECRET ?? 'fallback';\n"
            "const either = require('$env/static/private').OR_SECRET || 'fallback';\n"
            "const { DESTRUCTURED_SECRET } = require('$env/static/private') ?? {};\n"
            "export default function Page(){"
            "return <main>{nullish + either + DESTRUCTURED_SECRET}</main>}"
        )
        audit = self._run_audit({"svelte-require-fallback": payload})[
            "svelte-require-fallback"
        ]
        self.assertTrue(
            {"NULLISH_SECRET", "OR_SECRET", "DESTRUCTURED_SECRET"}.issubset(
                set(audit["envUncovered"])
            ),
            audit,
        )
        self.assertIn("env-missing-server(3)", audit["issues"])

    def test_svelte_require_inside_arrow_uses_lazy_placement(self) -> None:
        payload = _next_project(
            "const load = () => require('$env/static/private').LAZY_REQUIRE_SECRET;\n"
            "export default function Page(){return <main>{String(load)}</main>}"
        )
        audit = self._run_audit({"svelte-require-arrow": payload})[
            "svelte-require-arrow"
        ]
        details = {item["key"]: item for item in audit["envPlacementDetail"]}
        self.assertFalse(details["LAZY_REQUIRE_SECRET"]["topLevel"])
        self.assertEqual(audit["envPlacement"], "lazy-only")

    def test_computed_method_env_reads_are_top_level_but_function_body_is_lazy(self) -> None:
        payload = _next_project(
            "class C { [process.env.COMPUTED_CLASS_SECRET]() {} }\n"
            "const object = { [process.env.COMPUTED_OBJECT_SECRET]() {} };\n"
            "const lazy = () => process.env.LAZY_FUNCTION_SECRET;\n"
            "export default function Page(){return <main>{String(object || lazy || C)}</main>}"
        )
        audit = self._run_audit({"computed-method-env": payload})["computed-method-env"]
        details = {item["key"]: item for item in audit["envPlacementDetail"]}
        self.assertTrue(details["COMPUTED_CLASS_SECRET"]["topLevel"])
        self.assertTrue(details["COMPUTED_OBJECT_SECRET"]["topLevel"])
        self.assertFalse(details["LAZY_FUNCTION_SECRET"]["topLevel"])
        self.assertEqual(audit["envPlacement"], "crash-on-load")

    def test_parameter_decorator_is_eager_but_default_value_is_lazy(self) -> None:
        payload = _next_project(
            "function dec(value: string) { return () => value; }\n"
            "class C { method("
            "@dec(process.env.PARAM_DECORATOR_SECRET) "
            "value: string = process.env.PARAM_DEFAULT_SECRET) {} }\n"
            "function read({ token = process.env.NESTED_DEFAULT_SECRET } = {}) {"
            " return token; }\n"
            "export default function Page(){return <main>{String(C)}</main>}"
        )
        audit = self._run_audit({"parameter-decorator-env": payload})[
            "parameter-decorator-env"
        ]
        details = {item["key"]: item for item in audit["envPlacementDetail"]}
        self.assertTrue(details["PARAM_DECORATOR_SECRET"]["topLevel"])
        self.assertFalse(details["PARAM_DEFAULT_SECRET"]["topLevel"])
        self.assertFalse(details["NESTED_DEFAULT_SECRET"]["topLevel"])
        self.assertEqual(audit["envPlacement"], "crash-on-load")

    def test_unicode_escaped_process_env_identifier_is_parsed(self) -> None:
        payload = _next_project(
            r"const token = process.\u0065nv.UNICODE_ENV_SECRET;"
            r" const other = pr\u006fcess.env.UNICODE_PROCESS_SECRET;"
            " export default function Page(){return <main>{token + other}</main>}"
        )
        audit = self._run_audit({"unicode-env": payload})["unicode-env"]
        self.assertEqual(
            audit["envUncovered"],
            ["UNICODE_ENV_SECRET", "UNICODE_PROCESS_SECRET"],
            audit,
        )

    def test_wrapped_and_bracket_env_bases_are_detected_without_literal_false_positives(self) -> None:
        payload = _next_project(
            "const wrapped = (process.env).WRAPPED_PROCESS_SECRET;\n"
            "const nonNull = process.env!.NON_NULL_PROCESS_SECRET;\n"
            "const castMeta = (import.meta.env as any).VITE_CAST_META_SECRET;\n"
            "const bracketProcess = process['env'].BRACKET_PROCESS_SECRET;\n"
            'const bracketMeta = import.meta["env"]["VITE_BRACKET_META_SECRET"];\n'
            'const literal = "(process.env).FAKE_WRAPPED_LITERAL";\n'
            "const template = `process['env'].FAKE_BRACKET_TEMPLATE`;\n"
            "// (import.meta.env as any).FAKE_CAST_COMMENT\n"
            "export default function Page(){"
            "return <main>{String(wrapped || nonNull || castMeta || bracketProcess || "
            "bracketMeta || literal || template)}</main>}"
        )
        audit = self._run_audit({"wrapped-env-bases": payload})["wrapped-env-bases"]
        self.assertEqual(
            set(audit["envUncovered"]),
            {
                "WRAPPED_PROCESS_SECRET",
                "NON_NULL_PROCESS_SECRET",
                "VITE_CAST_META_SECRET",
                "BRACKET_PROCESS_SECRET",
                "VITE_BRACKET_META_SECRET",
            },
            audit,
        )
        self.assertFalse(
            {"FAKE_WRAPPED_LITERAL", "FAKE_BRACKET_TEMPLATE", "FAKE_CAST_COMMENT"}
            & set(audit["envUncovered"]),
            audit,
        )
        self.assertFalse(
            any(issue.startswith("env-scan-incomplete(") for issue in audit["issues"]),
            audit,
        )

    def test_static_env_object_destructuring_adds_exact_evidence(self) -> None:
        payload = _next_project(
            "const { DESTRUCTURED_PROCESS_SECRET: processAlias } = process.env;\n"
            "const { VITE_DESTRUCTURED_META_SECRET: metaAlias } = import.meta.env;\n"
            "export default function Page(){"
            "return <main>{processAlias + metaAlias}</main>}"
        )
        audit = self._run_audit({"destructured-env-object": payload})[
            "destructured-env-object"
        ]
        self.assertEqual(
            set(audit["envUncovered"]),
            {"DESTRUCTURED_PROCESS_SECRET", "VITE_DESTRUCTURED_META_SECRET"},
            audit,
        )
        self.assertFalse(
            any(issue.startswith("env-scan-incomplete(") for issue in audit["issues"]),
            audit,
        )

    def test_dynamic_or_bare_env_object_access_forces_review(self) -> None:
        payload = _next_project(
            "const key = 'RUNTIME_SECRET';\n"
            "const dynamic = process.env[key];\n"
            "function consume(value: unknown) { return value; }\n"
            "const forwarded = consume(import.meta.env);\n"
            "export default function Page(){return <main>{String(dynamic || forwarded)}</main>}"
        )
        audit = self._run_audit({"dynamic-env-object": payload})["dynamic-env-object"]
        self.assertIn("env-scan-incomplete(dynamic-access)", audit["issues"])
        digest = hashlib.sha256(payload).hexdigest()
        profile = profile_template(
            {
                "id": "dynamic-env-object",
                "title": "dynamic-env-object",
                "category": "test",
                "archiveUrl": "https://unit.public.blob.vercel-storage.com/dynamic-env.zip",
                "archiveSizeBytes": len(payload),
                "archiveSha256": digest,
            },
            audit,
            host_packages={},
            extractor_sha256="a" * 64,
        )
        self.assertEqual(profile["decision"], "review")

    def test_env_object_rest_destructuring_is_dynamic_not_an_exact_key(self) -> None:
        payload = _next_project(
            "const { ...REST } = process.env;\n"
            "export default function Page(){return <main>{String(REST)}</main>}"
        )
        audit = self._run_audit({"env-object-rest": payload})["env-object-rest"]
        self.assertNotIn("REST", audit["envUncovered"], audit)
        self.assertEqual(audit["envRefCount"], 0, audit)
        self.assertIn("env-scan-incomplete(dynamic-access)", audit["issues"])

    def test_mts_and_cts_env_reads_are_scanned_but_declarations_are_not_executable(self) -> None:
        payload = _next_project(
            "import '../config.mts'; import '../legacy.cts';\n"
            "export default function Page(){return <main>ready</main>}",
            **{
                "config.mts": "export const token = process.env.MTS_CONFIG_SECRET;",
                "legacy.cts": 'export const token = process.env["CTS_CONFIG_SECRET"];',
                "types.d.mts": (
                    "declare const invalidRuntime: typeof process.env.DECLARATION_ONLY_SECRET;"
                ),
            },
        )
        audit = self._run_audit({"module-ts-env": payload})["module-ts-env"]
        self.assertEqual(
            set(audit["envUncovered"]),
            {"MTS_CONFIG_SECRET", "CTS_CONFIG_SECRET"},
            audit,
        )
        self.assertNotIn("DECLARATION_ONLY_SECRET", audit["envUncovered"], audit)
        digest = hashlib.sha256(payload).hexdigest()
        profile = profile_template(
            {
                "id": "module-ts-env",
                "title": "module-ts-env",
                "category": "test",
                "archiveUrl": "https://unit.public.blob.vercel-storage.com/module-ts.zip",
                "archiveSizeBytes": len(payload),
                "archiveSha256": digest,
            },
            audit,
            host_packages={},
            extractor_sha256="a" * 64,
        )
        self.assertEqual(profile["decision"], "review")

    def test_svelte_env_reexports_and_dynamic_imports_require_review(self) -> None:
        payload = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite dev"},
                        "dependencies": {"@sveltejs/kit": "2.0.0"},
                    }
                ),
                "svelte.config.js": "export default {}",
                "src/routes/+page.svelte": (
                    "<script context='module' lang='ts'>\n"
                    "export { REEXPORTED_SECRET } from '$env/static/private';\n"
                    "export * from '$env/static/public';\n"
                    "</script>\n"
                    "<script lang='ts'>\n"
                    "const load = () => import('$env/dynamic/private');\n"
                    "const loadWithOptions = () => import('$env/dynamic/public', {});\n"
                    "</script>\n"
                    "<main>{String(load || loadWithOptions)}</main>"
                ),
            }
        )
        audit = self._run_audit({"svelte-env-exports": payload})[
            "svelte-env-exports"
        ]
        self.assertEqual(
            set(audit["envUncovered"]),
            {
                "REEXPORTED_SECRET",
                "PUBLIC_SVELTEKIT_STATIC",
                "SVELTEKIT_DYNAMIC_PRIVATE",
                "PUBLIC_SVELTEKIT_DYNAMIC",
            },
            audit,
        )
        details = {item["key"]: item for item in audit["envPlacementDetail"]}
        self.assertTrue(details["REEXPORTED_SECRET"]["topLevel"])
        self.assertFalse(details["SVELTEKIT_DYNAMIC_PRIVATE"]["topLevel"])
        digest = hashlib.sha256(payload).hexdigest()
        profile = profile_template(
            {
                "id": "svelte-env-exports",
                "title": "svelte-env-exports",
                "category": "test",
                "archiveUrl": "https://unit.public.blob.vercel-storage.com/svelte-exports.zip",
                "archiveSizeBytes": len(payload),
                "archiveSha256": digest,
            },
            audit,
            host_packages={},
            extractor_sha256="a" * 64,
        )
        self.assertNotEqual(profile["decision"], "qualified")

    def test_env_like_regex_text_and_comments_stay_ignored(self) -> None:
        payload = _next_project(
            "const envPattern = /process\\.env\\.FAKE_REGEX[\"']/gi;\n"
            'const text = "process.env.FAKE_TEXT";\n'
            "const template = `process.env.FAKE_TEMPLATE`;\n"
            "// process.env.FAKE_LINE_COMMENT\n"
            "/* process.env.FAKE_BLOCK_COMMENT */\n"
            'const ratio = envPattern.source.length / "\'".length;\n'
            "export default function Page() { return <main>{text + template + ratio}</main> }"
        )
        audit = self._run_audit({"regex-env-literals": payload})["regex-env-literals"]
        self.assertEqual(audit["envRefCount"], 0, audit)
        self.assertFalse(any(issue.startswith("env-missing-") for issue in audit["issues"]))

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

    def test_template_evidence_cap_reports_unprocessed_same_file(self) -> None:
        def env_source(start: int, count: int) -> str:
            return "\n".join(
                f"export const value{index} = process.env.SECRET_{index};"
                for index in range(start, start + count)
            )

        payload = _zip_bytes(
            {
                "package.json": json.dumps(
                    {
                        "scripts": {"dev": "vite"},
                        "dependencies": {"vite": "7.0.0"},
                    }
                ),
                "index.html": "<div id='app'></div>",
                "src/chunk-0.ts": env_source(0, 40),
                "src/chunk-1.ts": env_source(40, 40),
                "src/chunk-2.ts": env_source(80, 40),
                "src/chunk-3.ts": env_source(120, 40),
                "src/chunk-4.ts": env_source(160, 30),
                "src/chunk-5.ts": env_source(190, 20),
            }
        )
        audit = self._run_audit({"template-evidence-budget": payload})[
            "template-evidence-budget"
        ]
        self.assertIn("env-scan-incomplete(evidence-cap)", audit["issues"])
        self.assertEqual(audit["envRefCount"], 200)

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
