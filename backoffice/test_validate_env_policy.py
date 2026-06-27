"""Positive- and negative-path tests for the env-policy validate-on-save.

Guards the Plan B #5 save guard added to ``env_policy.py``: the editor parses
the JSON, then calls ``validate_json_against_schema`` against
``docs/schemas/strict/env-policy.schema.json`` before writing. The committed
``config/env-policy.json`` must stay schema-valid so a legitimate save is never
blocked, and an obviously-broken value must be caught before it can corrupt the
env governance layer.
"""

from __future__ import annotations

import copy
import unittest

from backoffice import REPO_ROOT
from backoffice.shared import read_json, validate_json_against_schema

ENV_POLICY_JSON = REPO_ROOT / "config" / "env-policy.json"
ENV_POLICY_SCHEMA = REPO_ROOT / "docs" / "schemas" / "strict" / "env-policy.schema.json"


class EnvPolicySchemaTests(unittest.TestCase):
    def test_committed_env_policy_passes(self) -> None:
        """The committed config/env-policy.json must remain schema-valid."""
        data = read_json(ENV_POLICY_JSON)
        self.assertEqual(validate_json_against_schema(data, ENV_POLICY_SCHEMA), [])

    def test_unknown_classification_is_rejected(self) -> None:
        """A rule classification outside the enum must be caught before write."""
        data = copy.deepcopy(read_json(ENV_POLICY_JSON))
        data["rules"][0]["classification"] = "not-a-classification"
        self.assertTrue(validate_json_against_schema(data, ENV_POLICY_SCHEMA))

    def test_rule_missing_classification_is_rejected(self) -> None:
        """Each rule must declare a classification."""
        data = copy.deepcopy(read_json(ENV_POLICY_JSON))
        del data["rules"][0]["classification"]
        self.assertTrue(validate_json_against_schema(data, ENV_POLICY_SCHEMA))

    def test_unknown_vercel_target_is_rejected(self) -> None:
        """recommendedVercelTargets entries must be a known Vercel environment."""
        data = copy.deepcopy(read_json(ENV_POLICY_JSON))
        data["rules"][0]["recommendedVercelTargets"] = ["staging"]
        self.assertTrue(validate_json_against_schema(data, ENV_POLICY_SCHEMA))

    def test_unknown_top_level_key_is_rejected(self) -> None:
        """additionalProperties:false — a stray top-level key must be caught."""
        data = copy.deepcopy(read_json(ENV_POLICY_JSON))
        data["garbage"] = True
        self.assertTrue(validate_json_against_schema(data, ENV_POLICY_SCHEMA))

    def test_missing_required_array_is_rejected(self) -> None:
        """Dropping a required top-level array (rules) must be caught."""
        data = copy.deepcopy(read_json(ENV_POLICY_JSON))
        del data["rules"]
        self.assertTrue(validate_json_against_schema(data, ENV_POLICY_SCHEMA))


if __name__ == "__main__":
    unittest.main()
