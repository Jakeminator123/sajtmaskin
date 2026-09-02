from __future__ import annotations

import re
import unittest
from pathlib import Path

from backoffice import REPO_ROOT
from backoffice.shared import (
    AVAILABLE_PHASE_MODELS,
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


class SharedManifestParityTests(unittest.TestCase):
    def test_available_phase_models_matches_ts_catalog(self) -> None:
        catalog_path = REPO_ROOT / "src" / "lib" / "models" / "catalog.ts"
        own_model_ids = _parse_own_model_ids(catalog_path)
        self.assertEqual(AVAILABLE_PHASE_MODELS[0], "selected_build_model")
        self.assertEqual(set(AVAILABLE_PHASE_MODELS[1:]), set(own_model_ids))

    def test_manifest_and_thinking_defaults_are_readable(self) -> None:
        ctx = build_backoffice_context(REPO_ROOT)
        manifest = read_json(ctx.manifest_json)
        build_defaults = build_profile_defaults(manifest)
        thinking = phase_thinking_defaults(manifest)

        self.assertEqual(
            BUILD_PROFILE_ORDER, ("pro", "max", "premium", "codex", "anthropic")
        )
        self.assertEqual(TIER_LABELS_SV["pro"], "Låg (pro)")
        self.assertEqual(TIER_LABELS_SV["max"], "Mellan (max)")
        self.assertEqual(TIER_LABELS_SV["premium"], "Hög (premium)")
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
        self.assertEqual(thinking["premium"]["verifier"]["reasoningEffort"], "low")


if __name__ == "__main__":
    unittest.main()

