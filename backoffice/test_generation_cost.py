"""Generation Cost: defaultkälla är llm_usage, inte codegen-tabellen."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backoffice.pages import generation_cost as gc


def _render_cost_for_test(repo_root: str) -> None:
    from pathlib import Path

    from backoffice.pages.generation_cost import render
    from backoffice.shared import build_backoffice_context

    render(build_backoffice_context(Path(repo_root)))


class GenerationCostInteractionTests(unittest.TestCase):
    def setUp(self):
        from streamlit.testing.v1 import AppTest

        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        gc._cached_cost.clear()
        self.addCleanup(gc._cached_cost.clear)
        patcher = mock.patch.object(gc, "_run_cost", return_value=gc.CostPayload(
            ok=True, usd_to_sek=10.5, totals={"totalUsd": 10.0},
        ))
        self.run_cost = patcher.start()
        self.addCleanup(patcher.stop)
        self.app = AppTest.from_function(_render_cost_for_test, args=(str(self.root),))
        self.app.run(timeout=10)

    def test_currency_change_reuses_data_and_recalculates_sek(self):
        self.app.number_input[0].set_value(11.0).run()
        self.assertEqual(list(self.app.exception), [])
        self.run_cost.assert_called_once()
        metrics = {m.label: m.value for m in self.app.metric}
        self.assertEqual(metrics["Total kostnad (SEK)"], "110 kr")

    def test_explicit_refresh_fetches_again(self):
        next(b for b in self.app.button if b.label == "Uppdatera kostnadsdata").click().run()
        self.assertEqual(self.run_cost.call_count, 2)
        self.assertEqual(list(self.app.exception), [])

    def test_query_changes_fetch_separate_results(self):
        self.app.slider[0].set_value(7).run()
        self.assertEqual(self.run_cost.call_count, 2)
        self.assertEqual(self.run_cost.call_args.args[2], 7)
        self.app.selectbox[1].select("engine_generation_logs (bara codegen)").run()
        self.assertEqual(self.run_cost.call_count, 3)
        self.assertEqual(self.run_cost.call_args.args[4], "logs")
        self.app.selectbox[0].select("Prod (.env.vercel.production.pulled)").run()
        self.assertEqual(self.run_cost.call_count, 4)
        self.assertEqual(self.run_cost.call_args.args[1], ".env.vercel.production.pulled")

    def test_changed_env_and_pricing_files_invalidate_cached_result(self):
        for rel in (".env.local", "config/ai_models/pricing.json"):
            with self.subTest(path=rel):
                path = self.root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                before = self.run_cost.call_count
                path.write_text("fixture input", encoding="utf-8")
                self.app.run()
                self.assertEqual(self.run_cost.call_count, before + 1)

    def test_changed_inherited_environment_invalidates_cached_result(self):
        with mock.patch.dict(os.environ, {"DATABASE_URL": "postgres://fixture/changed"}):
            self.app.run()
        self.assertEqual(self.run_cost.call_count, 2)

    def test_unreadable_configuration_never_displays_cached_report(self):
        with mock.patch.object(gc, "repo_command_fingerprint", side_effect=PermissionError):
            self.app.run()
        self.run_cost.assert_called_once()
        self.assertEqual(len(self.app.metric), 0)
        self.assertTrue(any("konfiguration" in e.value for e in self.app.error))


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
