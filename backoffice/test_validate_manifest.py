"""Negative- and positive-path tests for ``validate_manifest_or_error``.

Guards the backoffice raw-manifest save path (``ai_models.py`` / ``autofix.py``)
against the two Codex P2 findings on PR #210:

  (A) ``docLinks[].url`` must reject non-URL values (jsonschema skips
      ``format: "uri"`` unless a FormatChecker is supplied).
  (B) Nested sections that used to be loose ``{type: object}`` in
      ``manifest.schema.json`` (promptAssist / tokenBudgets / routeTimeouts /
      embeddingModels / qualityToOwnEngineModel) must reject runtime-invalid
      edits the way ``src/lib/ai-models/load-manifest.ts`` (Zod) would.

The committed manifest must still pass so a valid save is never blocked.
"""

from __future__ import annotations

import copy
import unittest

from backoffice import REPO_ROOT
from backoffice.shared import (
    build_backoffice_context,
    read_json,
    validate_manifest_or_error,
)


def _committed_manifest() -> dict:
    ctx = build_backoffice_context(REPO_ROOT)
    return read_json(ctx.manifest_json)


class ValidateManifestTests(unittest.TestCase):
    def test_committed_manifest_passes(self) -> None:
        """The currently-committed manifest must remain schema-valid (no
        regression that would block a legitimate save)."""
        self.assertEqual(validate_manifest_or_error(_committed_manifest()), [])

    def test_bad_url_in_doclinks_is_rejected(self) -> None:
        """Finding A: a malformed docLinks URL must be caught before write."""
        manifest = copy.deepcopy(_committed_manifest())
        manifest["docLinks"][0]["url"] = "not-a-url"
        errors = validate_manifest_or_error(manifest)
        self.assertTrue(errors, "expected a format error for a non-URL docLinks url")
        self.assertTrue(
            any("docLinks/0/url" in message for message in errors),
            f"expected the error to point at docLinks/0/url, got: {errors}",
        )

    def test_bad_url_in_workload_doclinks_is_rejected(self) -> None:
        """Finding A: workload docLinks share the runtime z.string().url() rule."""
        manifest = copy.deepcopy(_committed_manifest())
        target = None
        for workload in manifest["workloads"]:
            if workload.get("docLinks"):
                target = workload
                break
        self.assertIsNotNone(target, "fixture expects at least one workload with docLinks")
        target["docLinks"][0]["url"] = "not-a-url"
        self.assertTrue(
            validate_manifest_or_error(manifest),
            "expected a format error for a non-URL workload docLinks url",
        )

    def test_nested_invalid_route_timeout_is_rejected(self) -> None:
        """Finding B: dropping a required nested field (routeTimeouts.*.default)
        must be caught — Zod requires it at runtime."""
        manifest = copy.deepcopy(_committed_manifest())
        del manifest["routeTimeouts"]["engineRouteMaxDurationSeconds"]["default"]
        errors = validate_manifest_or_error(manifest)
        self.assertTrue(errors, "expected an error for a routeTimeouts entry missing 'default'")
        self.assertTrue(
            any("routeTimeouts" in message for message in errors),
            f"expected the error to mention routeTimeouts, got: {errors}",
        )

    def test_nested_invalid_prompt_assist_is_rejected(self) -> None:
        """Finding B: promptAssist used to be loose {type: object}; removing a
        required nested field must now fail."""
        manifest = copy.deepcopy(_committed_manifest())
        del manifest["promptAssist"]["allowed"]["gatewayClassModels"]
        self.assertTrue(
            validate_manifest_or_error(manifest),
            "expected an error for promptAssist.allowed missing gatewayClassModels",
        )

    def test_nested_invalid_token_budget_type_is_rejected(self) -> None:
        """Finding B: tokenBudgets used to be loose {type: object}; a wrong-typed
        nested value must now fail."""
        manifest = copy.deepcopy(_committed_manifest())
        manifest["tokenBudgets"]["engineMaxOutputTokens"]["default"] = "not-a-number"
        self.assertTrue(
            validate_manifest_or_error(manifest),
            "expected an error for a non-numeric tokenBudgets default",
        )


if __name__ == "__main__":
    unittest.main()
