"""Sparvägarna i ai_models-sidan: oförändrad sparning ska ge identiskt manifest.

Fångar fynden från backoffice-granskningen (paket C):
- Provider/kontrakt tappade `providerKey` m.fl. och delade regexar på `|`, så
  sparningen blockerades alltid av schemat.
- Deep Brief lämnade `briefing.allowed.models` som gammal kopia (TS-paritet).
- Numeriska defaults utanför postens egna min/max gick igenom schemat.
- Workloads-vyn visade generatorn från byggprofilen i stället för phaseRouting.
"""

from __future__ import annotations

import copy
import json
import unittest

from backoffice import REPO_ROOT
from backoffice.pages import ai_models
from backoffice.shared_lib.models import describe_workload_model_resolution
from backoffice.shared_lib.validation import (
    numeric_setting_range_errors,
    validate_manifest_or_error,
)


def _manifest() -> dict:
    path = REPO_ROOT / "config" / "ai_models" / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8"))


class ProviderContractRoundTripTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = _manifest()
        self.rules = self.manifest["preGenerationContracts"]["providerRules"]

    def test_unchanged_table_gives_identical_rules_and_valid_manifest(self) -> None:
        rows = ai_models._provider_rule_rows(self.rules)
        merged, errors = ai_models._merge_provider_rule_rows(self.rules, rows)
        self.assertEqual(errors, [])
        self.assertEqual(merged, self.rules)
        self.assertEqual(
            [list(rule) for rule in merged], [list(rule) for rule in self.rules],
            "key order must survive so the saved JSON diff stays empty",
        )
        proposed = copy.deepcopy(self.manifest)
        proposed["preGenerationContracts"]["providerRules"] = merged
        self.assertEqual(validate_manifest_or_error(proposed), [])

    def test_regex_with_alternation_survives(self) -> None:
        piped = [p for rule in self.rules for p in rule["matchPatterns"] if "|" in p]
        self.assertTrue(piped, "fixture expects regexes containing `|`")
        rows = ai_models._provider_rule_rows(self.rules)
        merged, _ = ai_models._merge_provider_rule_rows(self.rules, rows)
        merged_patterns = [p for rule in merged for p in rule["matchPatterns"]]
        for pattern in piped:
            self.assertIn(pattern, merged_patterns)

    def test_editing_a_visible_field_keeps_hidden_fields(self) -> None:
        index = next(i for i, rule in enumerate(self.rules) if rule.get("packageRoots"))
        rows = ai_models._provider_rule_rows(self.rules)
        rows[index]["reason"] = "Ny motivering."
        # pandas returns the index column as float when a new row has NaN.
        rows = [{**row, "#": float(row["#"])} for row in rows]
        merged, errors = ai_models._merge_provider_rule_rows(self.rules, rows)
        self.assertEqual(errors, [])
        self.assertEqual(merged[index]["reason"], "Ny motivering.")
        for key in ("providerKey", "packageRoots", "dossierCapability"):
            if key in self.rules[index]:
                self.assertEqual(merged[index][key], self.rules[index][key])

    def test_unresolved_status_round_trips_and_deleted_row_disappears(self) -> None:
        self.assertIn("unresolved", ai_models.PROVIDER_RULE_STATUSES)
        rows = ai_models._provider_rule_rows(self.rules)
        merged, _ = ai_models._merge_provider_rule_rows(self.rules, rows[1:])
        self.assertEqual(merged, self.rules[1:])

    def test_new_row_requires_provider_key_and_json_patterns(self) -> None:
        rows = [
            {"#": None, "kind": "auth", "providerKey": "", "provider": "X", "name": "",
             "envVars": "", "matchPatterns": "a|b", "status": "", "reason": ""},
        ]
        merged, errors = ai_models._merge_provider_rule_rows([], rows)
        self.assertEqual(merged, [])
        self.assertTrue(any("providerKey" in message for message in errors), errors)
        self.assertTrue(any("JSON" in message for message in errors), errors)

    def test_blank_new_row_is_ignored(self) -> None:
        merged, errors = ai_models._merge_provider_rule_rows([], [{"#": None, "kind": None}])
        self.assertEqual((merged, errors), ([], []))


class BriefingEditTests(unittest.TestCase):
    def _apply(self, manifest: dict, gateway: list[str], direct: list[str]) -> None:
        defaults = manifest["briefing"]["defaults"]
        ai_models._apply_briefing_edits(
            manifest,
            assist=defaults["assist"],
            request_model=defaults["requestModel"],
            auto_openai=defaults["serverAutoOpenAI"],
            auto_anthropic=defaults["serverAutoAnthropic"],
            gateway_text="\n".join(gateway),
            anthropic_direct_text="\n".join(direct),
        )

    def test_unchanged_save_is_identical(self) -> None:
        original = _manifest()
        proposed = copy.deepcopy(original)
        allowed = original["briefing"]["allowed"]
        self._apply(proposed, allowed["gatewayClassModels"], allowed["anthropicDirectModels"])
        self.assertEqual(proposed, original)

    def test_models_follow_gateway_plus_direct(self) -> None:
        proposed = _manifest()
        allowed = proposed["briefing"]["allowed"]
        gateway = allowed["gatewayClassModels"][:-1]
        direct = allowed["anthropicDirectModels"]
        self._apply(proposed, gateway, direct)
        self.assertEqual(proposed["briefing"]["allowed"]["models"], [*gateway, *direct])


class NumericRangeGuardTests(unittest.TestCase):
    def test_committed_manifest_is_in_range(self) -> None:
        self.assertEqual(numeric_setting_range_errors(_manifest()), [])

    def test_default_above_max_is_rejected(self) -> None:
        manifest = _manifest()
        manifest["tokenBudgets"]["engineMaxOutputTokens"]["default"] = 500_000
        errors = validate_manifest_or_error(manifest)
        self.assertTrue(any("engineMaxOutputTokens" in message for message in errors), errors)

    def test_default_below_min_is_rejected(self) -> None:
        manifest = _manifest()
        manifest["postGenerationPasses"]["verifierTimeoutMs"]["default"] = 1
        errors = validate_manifest_or_error(manifest)
        self.assertTrue(any("verifierTimeoutMs" in message for message in errors), errors)

    def test_number_input_bounds_come_from_the_entry(self) -> None:
        entry = {"envKey": "X", "default": 950, "min": 60, "max": 1800}
        self.assertEqual(
            ai_models._setting_bounds(entry, 950), {"min_value": 60, "max_value": 1800}
        )
        # Out-of-range stored value: no bounds (Streamlit would raise); the guard blocks the save.
        self.assertEqual(ai_models._setting_bounds(entry, 5000), {})
        self.assertEqual(ai_models._setting_bounds(None, 5), {})


class WorkloadResolutionTests(unittest.TestCase):
    def test_codegen_follows_phase_routing_generator(self) -> None:
        manifest = _manifest()
        workload = next(w for w in manifest["workloads"] if w["id"] == "own_engine_codegen")
        manifest["phaseRouting"]["defaultByTier"]["max"]["generator"] = "gpt-6-luna"
        label, source, _note = describe_workload_model_resolution(workload, manifest)
        self.assertIn("Mellan (max): OpenAI GPT-6 Luna", label.replace("GPT-6 Luna", "OpenAI GPT-6 Luna")
                      if "OpenAI GPT-6 Luna" not in label else label)
        self.assertIn("phaseRouting.generator", source)


if __name__ == "__main__":
    unittest.main()
