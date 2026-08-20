"""Generation Cost: defaultkälla är llm_usage, inte codegen-tabellen."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path
from unittest import mock

from backoffice.pages import generation_cost as gc


class GenerationCostSourceTests(unittest.TestCase):
    def test_default_source_choice_is_llm_usage(self) -> None:
        first = next(iter(gc._SOURCE_CHOICES.values()))
        self.assertEqual(first, "usage")
        self.assertEqual(gc._SOURCE_CHOICES["llm_usage (alla faser)"], "usage")

    def test_run_cost_passes_source_flag(self) -> None:
        fake = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {
                    "ok": True,
                    "generatedAt": "2026-08-19T00:00:00Z",
                    "envPath": ".env.local",
                    "target": "dev",
                    "isProdLike": False,
                    "windowDays": 30,
                    "source": "usage",
                    "sourceTable": "llm_usage",
                    "pricingVerifiedAt": "2026-08-12",
                    "fx": {"usdToSek": 10.5},
                    "totals": {"totalUsd": 1.25, "promptTokens": 1000, "completionTokens": 200},
                    "byModel": [],
                    "byPhase": [{"phase": "fixer", "totalUsd": 0.4, "rows": 2}],
                    "byDay": [],
                    "unpricedModels": [],
                    "caveats": ["Källa: llm_usage (alla faser)."],
                }
            ),
            stderr="",
        )
        with mock.patch("backoffice.pages.generation_cost.subprocess.run", return_value=fake) as run:
            payload = gc._run_cost(Path("."), ".env.local", 30, False, "usage")
        self.assertTrue(payload.ok)
        self.assertEqual(payload.source_table, "llm_usage")
        self.assertEqual(payload.by_phase[0]["phase"], "fixer")
        argv = run.call_args.args[0]
        self.assertIn("--source=usage", argv)

    def test_pricing_verified_at_is_read_from_the_price_list_not_the_run(self) -> None:
        """Etiketten "Prislista verifierad" får inte visa när rapporten kördes."""
        fake = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {
                    "ok": True,
                    "generatedAt": "2026-08-19T21:30:00Z",
                    "pricingVerifiedAt": "2026-08-12",
                    "source": "usage",
                    "sourceTable": "llm_usage",
                    "fx": {},
                    "totals": {},
                }
            ),
            stderr="",
        )
        with mock.patch("backoffice.pages.generation_cost.subprocess.run", return_value=fake):
            payload = gc._run_cost(Path("."), ".env.local", 30, False, "usage")

        self.assertEqual(payload.pricing_verified_at, "2026-08-12")
        self.assertNotEqual(payload.pricing_verified_at[:10], payload.generated_at[:10])

    def test_missing_pricing_verified_at_is_not_backfilled_with_today(self) -> None:
        fake = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {
                    "ok": True,
                    "generatedAt": "2026-08-19T21:30:00Z",
                    "pricingVerifiedAt": None,
                    "source": "usage",
                    "sourceTable": "llm_usage",
                    "fx": {},
                    "totals": {},
                }
            ),
            stderr="",
        )
        with mock.patch("backoffice.pages.generation_cost.subprocess.run", return_value=fake):
            payload = gc._run_cost(Path("."), ".env.local", 30, False, "usage")

        self.assertEqual(payload.pricing_verified_at, "")

    def test_model_df_uses_phase_and_cache_not_generation_count_label(self) -> None:
        df = gc._build_model_df(
            [
                {
                    "phase": "planner",
                    "model": "gpt-5.3-codex",
                    "label": "GPT-5.3 Codex",
                    "rows": 3,
                    "promptTokens": 1000,
                    "cachedInputTokens": 200,
                    "completionTokens": 50,
                    "inputUsd": 0.01,
                    "cachedUsd": 0.002,
                    "cacheWriteUsd": 0.001,
                    "outputUsd": 0.02,
                    "totalUsd": 0.033,
                }
            ],
            10.5,
        )
        self.assertIn("Fas", df.columns)
        self.assertIn("Anrop", df.columns)
        self.assertNotIn("Genereringar", df.columns)
        self.assertEqual(df.iloc[0]["Fas"], "planner")
        self.assertEqual(df.iloc[0]["Varav cache"], "200")
        self.assertIn("Cache $", df.columns)
