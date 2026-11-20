from __future__ import annotations

import re
import unittest
from pathlib import Path

from backoffice import REPO_ROOT
from backoffice.shared import (
    AVAILABLE_PHASE_MODELS,
    MODEL_LABELS,
    BUILD_PROFILE_ORDER,
    TIER_LABELS_SV,
    PHASE_ORDER,
    build_backoffice_context,
    build_profile_defaults,
    phase_thinking_defaults,
    read_json,
)


def _parse_own_model_ids(catalog_path: Path) -> list[str]:
    text = catalog_path.read_text(encoding="utf-8")
    match = re.search(r"export const OWN_MODEL_IDS = \[(.*?)\] as const;", text, re.DOTALL)
    if not match:
        raise AssertionError("Could not parse OWN_MODEL_IDS from catalog.ts")
    return re.findall(r'"([^"]+)"', match.group(1))


def _parse_retired_alias_keys(catalog_path: Path) -> list[str]:
    text = catalog_path.read_text(encoding="utf-8")
    match = re.search(
        r"const RETIRED_MODEL_ALIAS: Record<string, string> = \{(.*?)\};", text, re.DOTALL
    )
    if not match:
        raise AssertionError("Could not parse RETIRED_MODEL_ALIAS from catalog.ts")
    return re.findall(r'"([^"]+)":', match.group(1))


class SharedManifestParityTests(unittest.TestCase):
    def test_available_phase_models_matches_ts_catalog(self) -> None:
        catalog_path = REPO_ROOT / "src" / "lib" / "models" / "catalog.ts"
        own_model_ids = _parse_own_model_ids(catalog_path)
        retired = set(_parse_retired_alias_keys(catalog_path))
        self.assertIn("claude-sonnet-4.6", retired)
        self.assertEqual(AVAILABLE_PHASE_MODELS[0], "selected_build_model")
        # Ett pensionerat id körs aldrig (aliasRetiredModelId byter det), så det
        # får inte vara valbart i fasrullgardinen.
        self.assertEqual(set(AVAILABLE_PHASE_MODELS[1:]), set(own_model_ids) - retired)

    def test_retired_model_labels_name_the_replacement(self) -> None:
        catalog_path = REPO_ROOT / "src" / "lib" / "models" / "catalog.ts"
        for model_id in _parse_retired_alias_keys(catalog_path):
            label = MODEL_LABELS.get(model_id)
            if label is None:
                continue
            with self.subTest(model_id=model_id):
                self.assertIn("→", label, f"{model_id} is retired but labelled as live: {label}")

    def test_manifest_and_thinking_defaults_are_readable(self) -> None:
        ctx = build_backoffice_context(REPO_ROOT)
        manifest = read_json(ctx.manifest_json)
        build_defaults = build_profile_defaults(manifest)
        thinking = phase_thinking_defaults(manifest)

        self.assertEqual(
            BUILD_PROFILE_ORDER, ("pro", "max", "premium", "ultra", "codex", "anthropic")
        )
        self.assertEqual(TIER_LABELS_SV["pro"], "Låg (pro)")
        self.assertEqual(TIER_LABELS_SV["max"], "Mellan (max)")
        self.assertEqual(TIER_LABELS_SV["premium"], "Hög (premium)")
        self.assertEqual(TIER_LABELS_SV["ultra"], "Extra hög (ultra)")
        self.assertEqual(TIER_LABELS_SV["codex"], "Kod Max (codex, dold)")
        for tier in BUILD_PROFILE_ORDER:
            self.assertIn(tier, build_defaults)
            self.assertTrue(str(build_defaults[tier]).strip())
            self.assertIn(tier, thinking)
            for phase in PHASE_ORDER:
                self.assertIn(phase, thinking[tier])
                self.assertIn("thinking", thinking[tier][phase])
                self.assertIn("reasoningEffort", thinking[tier][phase])
                self.assertNotEqual(
                    thinking[tier][phase].get("reasoningMode"),
                    "pro",
                    msg=f"{tier}/{phase} still has reasoningMode=pro",
                )
        self.assertEqual(thinking["premium"]["planner"]["reasoningMode"], "standard")
        self.assertEqual(thinking["premium"]["planner"]["reasoningEffort"], "high")
        self.assertEqual(thinking["premium"]["generator"]["reasoningEffort"], "xhigh")
        self.assertEqual(thinking["premium"]["generator"]["reasoningMode"], "standard")
        self.assertEqual(thinking["premium"]["verifier"]["thinking"], False)
        self.assertEqual(thinking["premium"]["verifier"]["reasoningEffort"], "medium")


if __name__ == "__main__":
    unittest.main()

