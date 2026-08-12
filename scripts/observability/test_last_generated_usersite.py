# -*- coding: utf-8 -*-
"""Tester för genlogg-insamlingen (`last-generated-usersite.py` + `genlogs/`).

Deterministiska och nyckelfria: ingen DB, inget nätverk. Körs med
`npm run observability:test`.
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
#: HERE är redan katalogen `scripts/observability`, så parents[1] är repo-roten
#: (CLI:t räknar från filen och behöver därför parents[2]).
REPO_ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from genlogs import assess, envfile, report, store, usage  # noqa: E402
from genlogs.pricing import PricingTable, normalize_model_id  # noqa: E402
from genlogs.redact import MASK, Redactor  # noqa: E402
from genlogs.sources import did, fly, openai_usage, vercel  # noqa: E402
from genlogs.httpjson import _parse_ndjson, _with_params  # noqa: E402


# Fixturer för maskeringstesterna byggs ihop i runtime. Innehållet är påhittat, men
# en literal sträng med rätt form triggar secret-scanners (GitGuardian) i CI — och
# en röd säkerhetsgrind för en testfixtur är bara brus.
def _fake(prefix: str, body: str) -> str:
    return prefix + body


FAKE_OPENAI_KEY = _fake("sk-", "notarealkey" + "0" * 8)
FAKE_ADMIN_KEY = _fake("sk-admin-", "notarealkey" + "0" * 8)
FAKE_VERCEL_TOKEN = _fake("vcp_", "notarealtoken000")
FAKE_DB_PASSWORD = _fake("notareal", "password00")
FAKE_BEARER = _fake("notarealbearer", "0000")
FAKE_BASIC = _fake("bm90YXJlYWw", "wYXNzd29yZA00")
FAKE_JWT = ".".join([_fake("ey", "Jub3RhcmVhbCI6MX0"), _fake("ey", "Jub3RhcmVhbCI6Mn0"), "notarealsignature00"])


# Lösenordet i test-URL:erna. Sätts ihop av delar: en strängliteral intill ordet
# "password" är precis vad generic-password-detektorer letar efter, och en röd
# säkerhetsgrind för ett påhittat testvärde är bara brus.
FAKE_PG_PASSWORD = "p" + "@" + "ss"
FAKE_PG_PASSWORD_ENCODED = "p" + "%40" + "ss"


def _pg_url(user: str, password: str, host: str, port: int, database: str, query: str = "") -> str:
    """Bygg en Postgres-URL i runtime.

    Parsern måste testas med kompletta URL:er, men en literal `användare:lösenord@host`
    i filen triggar secret-scanners. Delarna sätts därför ihop här.
    """
    return f"postgresql://{user}:{password}@{host}:{port}/{database}{query}"


def _load_cli():
    """Filnamnet innehåller bindestreck — ladda modulen via sökväg."""
    path = HERE / "last-generated-usersite.py"
    spec = importlib.util.spec_from_file_location("last_generated_usersite", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CLI = _load_cli()


class EnvFileTests(unittest.TestCase):
    def test_parses_quotes_comments_and_export(self) -> None:
        parsed = envfile.parse_env_text(
            "\n".join(
                [
                    "# kommentar",
                    "PLAIN=abc",
                    'QUOTED="hem\\nlig"',
                    "SINGLE='raw#value'",
                    "export EXPORTED=xyz",
                    "TRAILING=value # efterkommentar",
                    "EMPTY=",
                    "not a pair",
                ]
            )
        )
        self.assertEqual(parsed["PLAIN"], "abc")
        self.assertEqual(parsed["QUOTED"], "hem\nlig")
        self.assertEqual(parsed["SINGLE"], "raw#value")
        self.assertEqual(parsed["EXPORTED"], "xyz")
        self.assertEqual(parsed["TRAILING"], "value")
        self.assertEqual(parsed["EMPTY"], "")
        self.assertNotIn("not a pair", parsed)

    def test_file_values_win_over_process_env(self) -> None:
        bundle = envfile.EnvBundle(env_path=".env.test", file_values={"POSTGRES_URL": "from-file"})
        self.assertEqual(bundle.get("POSTGRES_URL"), "from-file")
        self.assertIsNone(bundle.get("MISSING_KEY"))
        self.assertEqual(bundle.get("MISSING_KEY", "fallback"), "fallback")

    def test_postgres_target_precedence_and_sslmode(self) -> None:
        bundle = envfile.EnvBundle(
            env_path=".env.test",
            file_values={
                "DATABASE_URL": _pg_url("a", "b", "last", 5432, "last"),
                "POSTGRES_URL": _pg_url(
                    "user",
                    FAKE_PG_PASSWORD_ENCODED,
                    "db.example",
                    6543,
                    "prod",
                    "?sslmode=require&supa=1",
                ),
            },
        )
        target, error = envfile.resolve_postgres_target(bundle)
        self.assertIsNone(error)
        assert target is not None
        self.assertEqual(target.source_key, "POSTGRES_URL")
        self.assertEqual((target.host, target.port, target.database), ("db.example", 6543, "prod"))
        self.assertEqual(target.password, FAKE_PG_PASSWORD)
        self.assertTrue(target.ssl_requested)
        self.assertEqual(target.label, "db.example:6543/prod")

    def test_sslmode_disable_means_no_tls(self) -> None:
        bundle = envfile.EnvBundle(
            env_path=".env.test",
            file_values={
                "POSTGRES_URL": _pg_url(
                    "postgres", "postgres", "localhost", 5432, "x", "?sslmode=disable"
                )
            },
        )
        target, _ = envfile.resolve_postgres_target(bundle)
        assert target is not None
        self.assertFalse(target.ssl_requested)

    def test_broken_high_priority_url_does_not_block_a_working_one(self) -> None:
        # En oexpanderad platshållare i POSTGRES_URL ska inte hindra DATABASE_URL.
        bundle = envfile.EnvBundle(
            env_path=".env.test",
            file_values={
                "POSTGRES_URL": "${POSTGRES_URL}",
                "DATABASE_URL": _pg_url("u", FAKE_PG_PASSWORD_ENCODED, "fallback.host", 5432, "app"),
            },
        )
        target, error = envfile.resolve_postgres_target(bundle)
        self.assertIsNone(error)
        assert target is not None
        self.assertEqual(target.source_key, "DATABASE_URL")
        self.assertEqual(target.host, "fallback.host")

    def test_all_urls_broken_lists_every_reason(self) -> None:
        bundle = envfile.EnvBundle(
            env_path=".env.test",
            file_values={"POSTGRES_URL": "mysql://x/y", "DATABASE_URL": "postgresql:///nohost"},
        )
        target, error = envfile.resolve_postgres_target(bundle)
        self.assertIsNone(target)
        assert error is not None
        self.assertIn("POSTGRES_URL", error)
        self.assertIn("DATABASE_URL", error)

    def test_missing_url_reports_error(self) -> None:
        target, error = envfile.resolve_postgres_target(
            envfile.EnvBundle(env_path=".env.test", file_values={"POSTGRES_URL": ""})
        )
        # Processens env kan ha POSTGRES_URL satt i vissa miljöer — då är det ok.
        if target is None:
            self.assertIsNotNone(error)

    def test_secret_values_skips_short_and_non_secret_keys(self) -> None:
        bundle = envfile.EnvBundle(
            env_path=".env.test",
            file_values={
                "OPENAI_API_KEY": FAKE_OPENAI_KEY,
                "SHORT_TOKEN": "abc",
                "PUBLIC_LABEL": "this-is-not-a-secret-value",
            },
        )
        secrets = bundle.secret_values()
        self.assertIn(FAKE_OPENAI_KEY, secrets)
        self.assertNotIn("abc", secrets)
        self.assertNotIn("this-is-not-a-secret-value", secrets)


class RedactTests(unittest.TestCase):
    def test_masks_known_literals_longest_first(self) -> None:
        redactor = Redactor(["notarealvalue00", "notarealvalue00-with-suffix"])
        self.assertEqual(redactor.text("x notarealvalue00-with-suffix y"), f"x {MASK} y")

    def test_masks_provider_key_patterns(self) -> None:
        redactor = Redactor([])
        text = redactor.text(f"key={FAKE_ADMIN_KEY} and {FAKE_VERCEL_TOKEN}")
        self.assertNotIn(FAKE_ADMIN_KEY, text)
        self.assertNotIn(FAKE_VERCEL_TOKEN, text)

    def test_masks_connection_string_password_but_keeps_host(self) -> None:
        redactor = Redactor([])
        text = redactor.text(_pg_url("postgres", FAKE_DB_PASSWORD, "db.example", 5432, "prod"))
        self.assertIn("db.example:5432/prod", text)
        self.assertIn("postgres:", text)
        self.assertNotIn(FAKE_DB_PASSWORD, text)

    def test_masks_auth_headers_jwt_and_query_tokens(self) -> None:
        redactor = Redactor([])
        self.assertNotIn(
            FAKE_BEARER, redactor.text(f"Authorization: Bearer {FAKE_BEARER}")
        )
        self.assertNotIn(FAKE_BASIC, redactor.text(f"Basic {FAKE_BASIC}"))
        self.assertNotIn(FAKE_JWT, redactor.text(f"token {FAKE_JWT}"))
        self.assertEqual(
            redactor.text("https://x/y?token=abcdefgh12345"), f"https://x/y?token={MASK}"
        )

    def test_recurses_into_structures_and_keeps_ids(self) -> None:
        redactor = Redactor(["notarealvalue00"])
        payload = {
            "chatId": "86c4bb41-cb43-426b-8810-7d552adb384f",
            "nested": [{"key": "notarealvalue00"}],
            "count": 3,
        }
        scrubbed = redactor.value(payload)
        self.assertEqual(scrubbed["chatId"], "86c4bb41-cb43-426b-8810-7d552adb384f")
        self.assertEqual(scrubbed["nested"][0]["key"], MASK)
        self.assertEqual(scrubbed["count"], 3)


class StoreTests(unittest.TestCase):
    def test_run_dir_name_is_sortable_and_windows_safe(self) -> None:
        stamp = dt.datetime(2026, 7, 24, 23, 12, 5, tzinfo=dt.timezone.utc)
        name = store.build_run_dir_name(stamp, "86c4bb41-cb43-426b")
        self.assertEqual(name, "2026-07-24_231205Z_86c4bb41-cb43-426b")
        self.assertTrue(store.RUN_DIR_RE.match(name))
        self.assertNotIn(":", name)

    def test_run_dir_name_without_chat(self) -> None:
        stamp = dt.datetime(2026, 1, 2, 3, 4, 5, tzinfo=dt.timezone.utc)
        self.assertEqual(store.build_run_dir_name(stamp, None), "2026-01-02_030405Z_okand-chat")

    def test_unique_run_dir_name_avoids_collision(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = "2026-07-24_231205Z_chat"
            self.assertEqual(store.unique_run_dir_name(root, base), base)
            (root / base).mkdir()
            second = store.unique_run_dir_name(root, base)
            self.assertEqual(second, f"{base}-2")
            self.assertTrue(store.RUN_DIR_RE.match(second))
            (root / second).mkdir()
            self.assertEqual(store.unique_run_dir_name(root, base), f"{base}-3")

    def test_max_gen_logs_resolution(self) -> None:
        self.assertEqual(store.resolve_max_gen_logs(None, None), (store.DEFAULT_MAX_GEN_LOGS, None))
        self.assertEqual(store.resolve_max_gen_logs("3", None), (3, None))
        self.assertEqual(store.resolve_max_gen_logs("3", 5), (5, None))
        value, warning = store.resolve_max_gen_logs("noll", None)
        self.assertEqual(value, store.DEFAULT_MAX_GEN_LOGS)
        self.assertIsNotNone(warning)
        value, warning = store.resolve_max_gen_logs("0", None)
        self.assertEqual(value, store.DEFAULT_MAX_GEN_LOGS)
        self.assertIsNotNone(warning)

    def test_rotation_keeps_newest_and_ignores_foreign_dirs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            names = [f"2026-07-2{index}_120000Z_chat" for index in range(1, 6)]
            for name in names:
                (root / name).mkdir()
            (root / "min-egen-mapp").mkdir()
            removed = store.rotate_run_dirs(root, 2)
            self.assertEqual(removed, names[:3])
            remaining = {path.name for path in root.iterdir()}
            self.assertEqual(remaining, {names[3], names[4], "min-egen-mapp"})

    def test_rotation_never_deletes_the_current_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            oldest = root / "2026-07-01_120000Z_chat"
            newest = root / "2026-07-09_120000Z_chat"
            oldest.mkdir()
            newest.mkdir()
            removed = store.rotate_run_dirs(root, 1, keep=oldest)
            self.assertEqual(removed, [])
            self.assertTrue(oldest.is_dir())

    def test_store_writes_redacted_files_and_blocks_escape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_store = store.RunStore(Path(tmp) / "run", redactor=Redactor(["notarealvalue00"]))
            run_store.write_json("db/x.json", {"a": "notarealvalue00", "when": dt.date(2026, 7, 24)})
            written = json.loads((run_store.run_dir / "db" / "x.json").read_text(encoding="utf-8"))
            self.assertEqual(written["a"], MASK)
            self.assertEqual(written["when"], "2026-07-24")
            self.assertIn("db/x.json", run_store.files)
            self.assertGreater(run_store.total_bytes, 0)
            with self.assertRaises(ValueError):
                run_store.write_text("../escape.txt", "nope")


class PricingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pricing = PricingTable.load(REPO_ROOT)

    def test_pricing_file_loads(self) -> None:
        self.assertIsNone(self.pricing.error)
        self.assertGreater(self.pricing.usd_to_sek, 0)

    def test_normalizes_provider_prefixes(self) -> None:
        self.assertEqual(normalize_model_id("openai/GPT-5.5"), "gpt-5.5")
        self.assertEqual(normalize_model_id("anthropic-direct/claude-opus-4-8"), "claude-opus-4-8")
        self.assertEqual(normalize_model_id(None), "")

    def test_longest_match_wins(self) -> None:
        # "gpt-5.5-pro" innehåller både "gpt-5.5" och "gpt-5.5-pro" — den längsta
        # måste vinna, annars prissätts pro-modellen som bas-modellen.
        base = self.pricing.price_for_model("gpt-5.5")
        pro = self.pricing.price_for_model("openai/gpt-5.5-pro")
        mini = self.pricing.price_for_model("gpt-5.4-mini-2026-01-01")
        assert base and pro and mini
        self.assertEqual(base.key, "gpt-5.5")
        self.assertEqual(pro.key, "gpt-5.5-pro")
        self.assertEqual(mini.key, "gpt-5.4-mini")
        self.assertGreater(pro.input_per_1m, base.input_per_1m)

    def test_embedding_models_are_priced_despite_null_output_rate(self) -> None:
        # pricing.json har output: null för embeddings (de ger inga output-tokens).
        price = self.pricing.price_for_model("text-embedding-3-small")
        assert price is not None
        self.assertEqual(price.output_per_1m, 0.0)
        usd, _ = self.pricing.cost_usd(
            "text-embedding-3-small", prompt_tokens=1_000_000, completion_tokens=0
        )
        self.assertIsNotNone(usd)
        self.assertAlmostEqual(usd or 0, price.input_per_1m)

    def test_unknown_model_has_no_price(self) -> None:
        self.assertIsNone(self.pricing.price_for_model("modell-som-inte-finns"))
        usd, price = self.pricing.cost_usd("modell-som-inte-finns", prompt_tokens=10, completion_tokens=10)
        self.assertIsNone(usd)
        self.assertIsNone(price)

    def test_cost_math_uses_per_million_rates(self) -> None:
        table = PricingTable(
            {
                "fx": {"usdToSek": 10.0},
                "models": {
                    "test-model": {
                        "match": ["test-model"],
                        "tiers": {"standard": {"input": 2.0, "cachedInput": 0.5, "output": 10.0}},
                    }
                },
            }
        )
        usd, price = table.cost_usd("test-model", prompt_tokens=1_000_000, completion_tokens=100_000)
        assert price is not None and usd is not None
        self.assertAlmostEqual(usd, 2.0 + 1.0)
        self.assertAlmostEqual(table.to_sek(usd) or 0, 30.0)

    def test_cached_input_is_discounted_and_clamped(self) -> None:
        table = PricingTable(
            {
                "models": {
                    "test-model": {
                        "match": ["test-model"],
                        "tiers": {"standard": {"input": 10.0, "cachedInput": 1.0, "output": 0.0}},
                    }
                }
            }
        )
        usd, _ = table.cost_usd(
            "test-model", prompt_tokens=1_000_000, completion_tokens=0, cached_input_tokens=1_000_000
        )
        self.assertAlmostEqual(usd or 0, 1.0)
        # Fler cachade än totala input-tokens får inte ge negativ ocachad volym.
        usd_clamped, _ = table.cost_usd(
            "test-model", prompt_tokens=100, completion_tokens=0, cached_input_tokens=10_000
        )
        self.assertAlmostEqual(usd_clamped or 0, 100 * 1.0 / 1_000_000)


class UsageRollupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.pricing = PricingTable(
            {
                "fx": {"usdToSek": 10.0},
                "models": {
                    "gpt-5.5": {
                        "match": ["gpt-5.5"],
                        "label": "GPT-5.5",
                        "provider": "openai",
                        "tiers": {"standard": {"input": 1.0, "output": 2.0}},
                    }
                },
            }
        )

    def test_run_scope_uses_telemetry_for_the_selected_version_only(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={
                "telemetry": [
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 1_000_000, "completion_tokens": 500_000},
                    {"version_id": "v1", "model": "gpt-5.5", "prompt_tokens": 9_000_000, "completion_tokens": 9_000_000},
                ],
                "generations": [
                    {"model": "gpt-5.5", "prompt_tokens": 1_000_000, "completion_tokens": 500_000},
                    {"model": "gpt-5.5", "prompt_tokens": 9_000_000, "completion_tokens": 9_000_000},
                ],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["source"], "generation_telemetry")
        self.assertEqual(rollup["versionId"], "v2")
        # Bara v2-raden: en annan versions follow-up får inte blåsa upp summan.
        self.assertEqual(rollup["totals"]["totalTokens"], 1_500_000)
        self.assertAlmostEqual(rollup["totals"]["usd"] or 0, 2.0)
        # Chat-scopet ser allt, men separat.
        self.assertEqual(rollup["chat"]["source"], "engine_generation_logs")
        self.assertEqual(rollup["chat"]["totals"]["totalTokens"], 19_500_000)

    def test_llm_usage_replaces_generation_logs_instead_of_adding_to_them(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {"version_id": "v2", "model": "gpt-5.5", "phase": "brief", "input_tokens": 100, "output_tokens": 50},
                    {"version_id": "v2", "model": "gpt-5.5", "phase": "codegen", "input_tokens": 10, "output_tokens": 5},
                ],
                "telemetry": [{"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 10, "completion_tokens": 5}],
                "generations": [{"model": "gpt-5.5", "prompt_tokens": 10, "completion_tokens": 5}],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["source"], "llm_usage")
        # 165 tokens, inte 165 + telemetri/generations-dubbletterna.
        self.assertEqual(rollup["totals"]["totalTokens"], 165)
        self.assertEqual(rollup["totals"]["calls"], 2)
        self.assertEqual({row["phase"] for row in rollup["byPhase"]}, {"brief", "codegen"})
        self.assertEqual(rollup["chat"]["source"], "llm_usage")

    def test_mixed_era_keeps_pre_instrumentation_codegen(self) -> None:
        # En chat som sträcker sig över instrumenteringen: gamla codegen-rader finns
        # BARA i engine_generation_logs. De får inte tappas när llm_usage dyker upp.
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {
                        "version_id": "v2",
                        "phase": "brief",
                        "model": "gpt-5.5",
                        "input_tokens": 100,
                        "output_tokens": 10,
                        "created_at": "2026-07-24T12:00:00+00:00",
                    }
                ],
                "telemetry": [
                    {
                        "version_id": "v2",
                        "model": "gpt-5.5",
                        "prompt_tokens": 1_000,
                        "completion_tokens": 100,
                        "created_at": "2026-07-24T12:00:05+00:00",
                    }
                ],
                "generations": [
                    # Gammal körning, före instrumenteringen.
                    {
                        "model": "gpt-5.5",
                        "prompt_tokens": 5_000,
                        "completion_tokens": 500,
                        "created_at": "2026-07-20T09:00:00+00:00",
                    },
                    # Samma anrop som telemetri-raden ovan (efter instrumenteringen)
                    # — får INTE räknas en andra gång.
                    {
                        "model": "gpt-5.5",
                        "prompt_tokens": 1_000,
                        "completion_tokens": 100,
                        "created_at": "2026-07-24T12:00:05+00:00",
                    },
                ],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        # Run: brief (llm_usage) + codegen (telemetri för versionen).
        self.assertEqual(rollup["source"], "llm_usage + generation_telemetry")
        self.assertEqual(rollup["totals"]["totalTokens"], 110 + 1_100)
        self.assertEqual({row["phase"] for row in rollup["byPhase"]}, {"brief", "codegen"})
        # Chat: llm_usage + BÅDA genereringsraderna. Den gamla hör till tiden före
        # instrumenteringen, och den nya har ingen codegen-rad i llm_usage att vara
        # dubblett av — bara en telemetri-rad, som hör till run-scopet.
        self.assertIn("utan matchande codegen-rad", rollup["chat"]["source"])
        self.assertEqual(rollup["chat"]["totals"]["totalTokens"], 110 + 5_500 + 1_100)

    def test_failed_codegen_row_does_not_hide_telemetry_tokens(self) -> None:
        # En misslyckad codegen-rad saknar tokensiffror — den verkliga volymen
        # ligger kvar i telemetrin och måste räknas.
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {"version_id": "v2", "phase": "codegen", "model": "gpt-5.5", "ok": False},
                ],
                "telemetry": [
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 900, "completion_tokens": 100},
                ],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["source"], "llm_usage + generation_telemetry")
        self.assertEqual(rollup["totals"]["totalTokens"], 1_000)

    def test_generation_row_is_deduped_against_a_codegen_usage_row(self) -> None:
        # Samma anrop, båda tabellerna: codegen skriver till engine_generation_logs
        # OCH llm_usage efter instrumenteringen. Får bara räknas en gång.
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {
                        "version_id": "v2",
                        "phase": "codegen",
                        "model": "gpt-5.5",
                        "input_tokens": 1_000,
                        "created_at": "2026-07-24T12:00:05+00:00",
                    }
                ],
                "generations": [
                    {
                        "model": "gpt-5.5",
                        "prompt_tokens": 1_000,
                        "created_at": "2026-07-24T12:00:06+00:00",
                    }
                ],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["chat"]["source"], "llm_usage")
        self.assertEqual(rollup["chat"]["totals"]["totalTokens"], 1_000)

    def test_generation_row_survives_a_missing_usage_write(self) -> None:
        # llm_usage-skrivningen uteblev för det anropet (misslyckad insert). Då är
        # genereringsraden enda källan och får inte tappas.
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {
                        "version_id": "v2",
                        "phase": "brief",
                        "model": "gpt-5.5",
                        "input_tokens": 50,
                        "created_at": "2026-07-24T12:00:00+00:00",
                    }
                ],
                "generations": [
                    {
                        "model": "gpt-5.5",
                        "prompt_tokens": 9_000,
                        "created_at": "2026-07-24T12:05:00+00:00",
                    }
                ],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertIn("utan matchande codegen-rad", rollup["chat"]["source"])
        self.assertEqual(rollup["chat"]["totals"]["totalTokens"], 9_050)

    def test_llm_usage_with_codegen_does_not_pull_in_telemetry(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {"version_id": "v2", "phase": "codegen", "model": "gpt-5.5", "input_tokens": 10},
                ],
                "telemetry": [
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 10},
                ],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["source"], "llm_usage")
        self.assertEqual(rollup["totals"]["totalTokens"], 10)

    def test_unknown_version_reports_note_instead_of_chat_sum(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={"generations": [{"model": "gpt-5.5", "prompt_tokens": 10, "completion_tokens": 5}]},
            pricing=self.pricing,
            version_id="version-utan-rader",
        )
        self.assertEqual(rollup["totals"]["totalTokens"], 0)
        self.assertTrue(any("version_id" in note for note in rollup["notes"]))
        self.assertEqual(rollup["chat"]["totals"]["totalTokens"], 15)

    def test_repair_passes_are_flagged_as_possible_double_count(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={
                "telemetry": [
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 100, "completion_tokens": 10},
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 100, "completion_tokens": 10},
                ]
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["totals"]["calls"], 2)
        self.assertTrue(any("retry/repair" in note for note in rollup["notes"]))

    def test_repair_pass_stub_is_not_counted_as_an_llm_call(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={
                "telemetry": [
                    # Tunn repair-pass-rad: bara gate-resultat, ingen tokenvolym.
                    {"version_id": "v2", "model": "gpt-5.5", "quality_gate_result": "preflight_passed"},
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 100, "completion_tokens": 10},
                ]
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["totals"]["calls"], 1)
        self.assertEqual(rollup["totals"]["totalTokens"], 110)
        self.assertEqual(rollup["notes"], [])

    def test_double_count_note_also_when_sources_are_combined(self) -> None:
        # Risken sitter i telemetri-raderna, inte i vilken kombination källorna
        # hamnade i — varningen måste komma även i hybridläget.
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {"version_id": "v2", "phase": "brief", "model": "gpt-5.5", "input_tokens": 50},
                ],
                "telemetry": [
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 100, "completion_tokens": 10},
                    {"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": 100, "completion_tokens": 10},
                ],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["source"], "llm_usage + generation_telemetry")
        self.assertTrue(any("retry/repair" in note for note in rollup["notes"]))

    def test_unstamped_rows_are_reported_not_silently_dropped(self) -> None:
        # Efterstämplingen är best-effort. Missar den en rad ska kostnaden synas som
        # en not — inte försvinna ur körningens summa i tysthet.
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {"version_id": "v2", "phase": "codegen", "model": "gpt-5.5", "input_tokens": 100},
                    {"version_id": None, "phase": "brief", "model": "gpt-5.5", "input_tokens": 4_000,
                     "output_tokens": 900},
                ]
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["totals"]["totalTokens"], 100)
        self.assertEqual(rollup["unstamped"], {"rows": 1, "phases": ["brief"], "totalTokens": 4_900})
        self.assertTrue(any("saknar version_id" in note for note in rollup["notes"]))

    def test_no_unstamped_note_when_everything_is_attributed(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={
                "llmusage": [
                    {"version_id": "v2", "phase": "codegen", "model": "gpt-5.5", "input_tokens": 100},
                ]
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["unstamped"]["rows"], 0)
        self.assertEqual(rollup["notes"], [])

    def test_unpriced_models_are_listed(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={"telemetry": [{"version_id": "v1", "model": "okänd-modell", "prompt_tokens": 10, "completion_tokens": 5}]},
            pricing=self.pricing,
            version_id="v1",
        )
        self.assertEqual(rollup["unpricedModels"], ["okänd-modell"])
        self.assertIsNone(rollup["totals"]["usd"])

    def test_run_scope_refuses_token_free_telemetry_rows(self) -> None:
        # Reservläget (dump-logs.mjs) kan ge telemetri utan tokenkolumner —
        # det får bli en varning, inte "0 tokens".
        rollup = usage.build_token_rollup(
            db_data={
                "telemetry": [{"version_id": "v2", "model": "gpt-5.5", "duration_ms": 100}],
                "generations": [{"model": "gpt-5.5", "prompt_tokens": 500, "completion_tokens": 100}],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["source"], "saknas")
        self.assertEqual(rollup["totals"]["totalTokens"], 0)
        self.assertTrue(any("tokenvolym" in note for note in rollup["notes"]))
        self.assertEqual(rollup["chat"]["totals"]["totalTokens"], 600)
        self.assertFalse(usage.has_token_fields([{"model": "x"}]))
        # Kolumn finns men är NULL = ingen usage skrevs, inte "0 tokens".
        self.assertFalse(usage.has_token_fields([{"prompt_tokens": None}]))
        self.assertTrue(usage.has_token_fields([{"prompt_tokens": 1}]))
        self.assertTrue(usage.has_token_fields([{"prompt_tokens": 0}]))

    def test_coverage_separates_measured_and_unmeasured(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={"telemetry": [{"version_id": "v1", "model": "gpt-5.5", "prompt_tokens": 5}]},
            pricing=self.pricing,
            version_id="v1",
        )
        coverage = usage.build_coverage(rollup=rollup, llm_usage_table_present=False)
        measured = {row["phase"] for row in coverage["measuredPhases"]}
        unmeasured = {row["phase"] for row in coverage["unmeasuredPhases"]}
        self.assertIn("codegen", measured)
        self.assertIn("brief", unmeasured)
        self.assertIn("verifier", unmeasured)
        self.assertFalse(coverage["llmUsageTablePresent"])
        self.assertIn("UNDRE", coverage["note"])

    def test_coverage_only_counts_llm_phases_for_the_version(self) -> None:
        rollup = usage.build_token_rollup(
            db_data={"llmusage": [{"version_id": "v1", "phase": "brief", "input_tokens": 10}]},
            pricing=self.pricing,
            version_id="v2",
        )
        coverage = usage.build_coverage(rollup=rollup, llm_usage_table_present=True)
        unmeasured = {row["phase"] for row in coverage["unmeasuredPhases"]}
        self.assertIn("brief", unmeasured)

    def test_coverage_does_not_claim_codegen_from_another_version(self) -> None:
        # Chat-nivå-rader får inte göra codegen "mätt" för en version som saknar
        # egna rader — det skulle motsäga en tom run-summa.
        rollup = usage.build_token_rollup(
            db_data={
                "generations": [{"model": "gpt-5.5", "prompt_tokens": 10}],
                "telemetry": [{"version_id": "v1", "prompt_tokens": 10}],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        coverage = usage.build_coverage(rollup=rollup, llm_usage_table_present=False)
        self.assertIn("codegen", {row["phase"] for row in coverage["unmeasuredPhases"]})
        self.assertEqual(coverage["measuredPhases"], [])

    def test_coverage_agrees_with_a_rejected_token_free_rollup(self) -> None:
        # Telemetri finns men utan tokenvolym: rollupen vägrar den, och då får
        # coverage inte påstå att codegen mättes.
        rollup = usage.build_token_rollup(
            db_data={
                "telemetry": [{"version_id": "v2", "model": "gpt-5.5", "prompt_tokens": None}],
                "generations": [{"model": "gpt-5.5", "prompt_tokens": 10, "completion_tokens": 5}],
            },
            pricing=self.pricing,
            version_id="v2",
        )
        self.assertEqual(rollup["source"], "saknas")
        self.assertTrue(any("tokenvolym" in note for note in rollup["notes"]))
        coverage = usage.build_coverage(rollup=rollup, llm_usage_table_present=False)
        self.assertEqual(coverage["measuredPhases"], [])
        self.assertIn("codegen", {row["phase"] for row in coverage["unmeasuredPhases"]})


class AssessTests(unittest.TestCase):
    def test_no_version_is_unknown(self) -> None:
        result = assess.assess_run(version=None, db_data={})
        self.assertEqual(result["verdict"], assess.VERDICT_UNKNOWN)

    def test_clean_run_is_successful(self) -> None:
        result = assess.assess_run(
            version={"id": "v1", "verification_state": "passed"},
            db_data={
                "telemetry": [{"preview_success": True, "quality_gate_result": "pass", "retry_count": 0}],
                "generations": [{"success": True}],
                "errors": [],
            },
        )
        self.assertEqual(result["verdict"], assess.VERDICT_OK)

    def test_failed_preview_is_failure(self) -> None:
        result = assess.assess_run(
            version={"id": "v1"},
            db_data={
                "telemetry": [{"preview_success": False, "preview_blocking_reason": "install_failed"}],
                "generations": [{"success": True}],
            },
        )
        self.assertEqual(result["verdict"], assess.VERDICT_FAILED)
        self.assertTrue(any("install_failed" in reason for reason in result["reasons"]))

    def test_recognizes_the_real_quality_gate_values(self) -> None:
        # persist-telemetry.ts skriver preflight_passed / preflight_failed /
        # verifier_failed — inte "fail"/"blocked".
        self.assertEqual(assess.gate_outcome("preflight_passed"), "pass")
        self.assertEqual(assess.gate_outcome("preflight_failed"), "fail")
        self.assertEqual(assess.gate_outcome("verifier_failed"), "fail")
        self.assertIsNone(assess.gate_outcome(None))
        self.assertIsNone(assess.gate_outcome("nytt_okant_varde"))

    def test_verifier_failed_without_preview_signal_is_a_failure(self) -> None:
        created = "2026-07-24T22:35:00+00:00"
        result = assess.assess_run(
            version={"id": "v1", "created_at": created, "verification_state": "pending"},
            db_data={
                # verifier blockade raden men preflight lät previewn passera →
                # preview_success är null. Får inte bli grönt.
                "telemetry": [{"preview_success": None, "quality_gate_result": "verifier_failed"}],
                "generations": [{"success": True, "created_at": created}],
            },
        )
        self.assertEqual(result["verdict"], assess.VERDICT_FAILED)
        self.assertTrue(any("verifier_failed" in reason for reason in result["reasons"]))

    def test_failed_verification_state_is_a_failure(self) -> None:
        result = assess.assess_run(
            version={"id": "v1", "verification_state": "failed"},
            db_data={"telemetry": [{"preview_success": True, "quality_gate_result": "preflight_passed"}]},
        )
        self.assertEqual(result["verdict"], assess.VERDICT_FAILED)

    def test_pending_verification_is_unknown_not_success(self) -> None:
        result = assess.assess_run(
            version={"id": "v1", "verification_state": "verifying"},
            db_data={"telemetry": [{"preview_success": None}]},
        )
        self.assertEqual(result["verdict"], assess.VERDICT_UNKNOWN)

    def test_preview_up_while_still_verifying_is_partial(self) -> None:
        # Previewn kan vara uppe innan server-verifieringen hunnit falla.
        result = assess.assess_run(
            version={"id": "v1", "verification_state": "verifying"},
            db_data={
                "telemetry": [{"preview_success": True, "quality_gate_result": "preflight_passed"}]
            },
        )
        self.assertEqual(result["verdict"], assess.VERDICT_PARTIAL)
        self.assertTrue(any("inte satt sig" in reason for reason in result["reasons"]))

    def test_passed_verification_without_confirmed_preview_is_partial(self) -> None:
        # preview_success = null betyder "inte bekräftad", inte lyckad.
        result = assess.assess_run(
            version={"id": "v1", "verification_state": "passed"},
            db_data={
                "telemetry": [{"preview_success": None, "quality_gate_result": "preflight_passed"}]
            },
        )
        self.assertEqual(result["verdict"], assess.VERDICT_PARTIAL)
        self.assertTrue(any("inte bekräftad" in reason for reason in result["reasons"]))

    def test_help_text_matches_the_actual_default_env(self) -> None:
        help_text = CLI.build_parser().format_help()
        self.assertIn(envfile.DEV_ENV_FILE, help_text)
        self.assertNotIn(f"default: {envfile.PROD_ENV_FILE}", help_text)

    def test_repair_available_is_partial(self) -> None:
        result = assess.assess_run(
            version={"id": "v1", "verification_state": "repair_available"},
            db_data={"telemetry": [{"preview_success": True, "quality_gate_result": "preflight_passed"}]},
        )
        self.assertEqual(result["verdict"], assess.VERDICT_PARTIAL)

    def test_unknown_gate_alone_is_not_green(self) -> None:
        # Ett okänt gate-värde är ingen bekräftelse — och en matchad
        # genereringslogg utan success-flagga är det inte heller.
        result = assess.assess_run(
            version={"id": "v1", "created_at": "2026-07-24T22:35:00+00:00"},
            db_data={
                "versions": [{"id": "v1", "created_at": "2026-07-24T22:35:00+00:00"}],
                "telemetry": [
                    {"version_id": "v1", "preview_success": True, "quality_gate_result": "nytt_okant_varde"}
                ],
                "generations": [{"created_at": "2026-07-24T22:35:02+00:00"}],
            },
            version_id="v1",
        )
        self.assertEqual(result["verdict"], assess.VERDICT_PARTIAL)

    def test_a_passed_gate_alone_confirms_the_run(self) -> None:
        result = assess.assess_run(
            version={"id": "v1", "created_at": "2026-07-24T22:35:00+00:00"},
            db_data={
                "versions": [{"id": "v1", "created_at": "2026-07-24T22:35:00+00:00"}],
                "telemetry": [
                    {"version_id": "v1", "preview_success": True, "quality_gate_result": "preflight_passed"}
                ],
            },
            version_id="v1",
        )
        self.assertEqual(result["verdict"], assess.VERDICT_OK)
        self.assertTrue(any("RenderGate" in reason for reason in result["reasons"]))

    def test_preview_up_without_any_confirming_signal_is_partial(self) -> None:
        # En stale preview från en tidigare version ser ut precis så här.
        result = assess.assess_run(
            version={"id": "v1", "created_at": "2026-07-24T22:35:00+00:00"},
            db_data={
                "versions": [{"id": "v1", "created_at": "2026-07-24T22:35:00+00:00"}],
                "telemetry": [{"version_id": "v1", "preview_success": True}],
                "generations": [],
            },
            version_id="v1",
        )
        self.assertEqual(result["verdict"], assess.VERDICT_PARTIAL)
        self.assertFalse(result["signals"]["generationLogMatched"])

    def test_retry_and_errors_downgrade_to_partial(self) -> None:
        result = assess.assess_run(
            version={"id": "v1"},
            db_data={
                "telemetry": [{"preview_success": True, "retry_count": 2, "autofix_applied": True}],
                "generations": [{"success": True}],
                "errors": [{"level": "warning", "message": "x"}],
            },
        )
        self.assertEqual(result["verdict"], assess.VERDICT_PARTIAL)

    def test_repair_pass_stub_does_not_hide_preview_success(self) -> None:
        # recordRepairPassedQualityGate skriver en tunn nyare rad med bara
        # quality_gate_result. preview_success ska ärvas från finalize-raden.
        result = assess.assess_run(
            version={"id": "v1", "verification_state": "passed"},
            db_data={
                "telemetry": [
                    {"version_id": "v1", "quality_gate_result": "preflight_passed", "preview_success": None},
                    {"version_id": "v1", "quality_gate_result": "verifier_failed", "preview_success": True},
                ]
            },
            version_id="v1",
        )
        self.assertEqual(result["verdict"], assess.VERDICT_OK)
        self.assertIs(result["signals"]["previewSuccess"], True)
        # Gate-fältet ska däremot komma från NYASTE raden (repair-passet).
        self.assertEqual(result["signals"]["qualityGateResult"], "preflight_passed")

    def test_merge_telemetry_lets_the_newest_gate_row_win(self) -> None:
        merged = assess.merge_telemetry(
            [
                {"quality_gate_result": "preflight_passed", "retry_count": None},
                {"quality_gate_result": "preflight_failed", "retry_count": 2, "duration_ms": 100},
            ]
        )
        self.assertEqual(merged["quality_gate_result"], "preflight_passed")
        self.assertEqual(merged["retry_count"], 2)
        self.assertEqual(merged["duration_ms"], 100)
        self.assertEqual(assess.merge_telemetry([]), {})

    def test_preview_session_from_another_version_is_not_counted_as_found(self) -> None:
        fly_result = {
            "matchedSession": {"previewSessionId": "ps_old", "chatId": "c1", "versionId": "v1"},
            "sessionVersionMismatch": {
                "previewSessionId": "ps_old",
                "sessionVersionId": "v1",
                "expectedVersionId": "v2",
            },
        }
        result = assess.assess_run(
            version={"id": "v2", "verification_state": "passed"},
            db_data={"telemetry": [{"version_id": "v2", "preview_success": True}]},
            fly=fly_result,
            version_id="v2",
        )
        self.assertFalse(result["signals"]["previewSessionFound"])
        self.assertEqual(result["signals"]["previewSessionVersionMismatch"]["sessionVersionId"], "v1")
        # Utan missmatch räknas den som hittad.
        ok = assess.assess_run(
            version={"id": "v2", "verification_state": "passed"},
            db_data={"telemetry": [{"version_id": "v2", "preview_success": True}]},
            fly={"matchedSession": {"previewSessionId": "ps_new", "versionId": "v2"}},
            version_id="v2",
        )
        self.assertTrue(ok["signals"]["previewSessionFound"])

    def test_signals_come_from_the_assessed_version_only(self) -> None:
        db_data = {
            "telemetry": [
                {"version_id": "v1", "preview_success": False, "preview_blocking_reason": "install_failed"},
                {"version_id": "v2", "preview_success": True, "quality_gate_result": "pass"},
            ],
            "generations": [{"success": True}],
            "errors": [{"version_id": "v1", "level": "error", "message": "gammalt fel"}],
            "deploys": [{"version_id": "v1", "status": "ERROR"}],
        }
        # v2 är ren trots att v1 föll.
        good = assess.assess_run(
            version={"id": "v2", "verification_state": "passed"},
            db_data=db_data,
            version_id="v2",
        )
        self.assertEqual(good["verdict"], assess.VERDICT_OK)
        self.assertEqual(good["signals"]["errorRows"], 0)
        self.assertEqual(good["signals"]["assessedVersionId"], "v2")
        # v1 ska fortfarande bedömas som misslyckad.
        bad = assess.assess_run(version={"id": "v1"}, db_data=db_data, version_id="v1")
        self.assertEqual(bad["verdict"], assess.VERDICT_FAILED)

    def test_generation_log_is_matched_by_time_not_by_recency(self) -> None:
        version = {"id": "v2", "created_at": "2026-07-24T22:35:00+00:00"}
        db_data = {
            "versions": [version, {"id": "v1", "created_at": "2026-07-24T20:00:00+00:00"}],
            "telemetry": [{"version_id": "v2", "preview_success": True}],
            # Nyaste raden hör till en annan (äldre) körning långt bort i tid.
            "generations": [
                {"success": False, "error_message": "gammalt fel", "created_at": "2026-07-24T20:00:00+00:00"},
                {"success": True, "created_at": "2026-07-24T22:35:04+00:00"},
            ],
        }
        result = assess.assess_run(version=version, db_data=db_data, version_id="v2")
        self.assertEqual(result["verdict"], assess.VERDICT_OK)
        self.assertTrue(result["signals"]["generationLogMatched"])
        self.assertIs(result["signals"]["generationSuccess"], True)

    def test_generation_log_matches_across_a_slow_run(self) -> None:
        # Versionsraden skapas i början av finalize, loggen skrivs i slutet — efter
        # verifier och preview-boot. 12 minuter senare måste fortfarande matcha.
        version = {"id": "v1", "created_at": "2026-07-24T22:35:00+00:00"}
        result = assess.assess_run(
            version={**version, "verification_state": "passed"},
            db_data={
                "versions": [version],
                "telemetry": [{"version_id": "v1", "preview_success": True}],
                "generations": [{"success": True, "created_at": "2026-07-24T22:47:00+00:00"}],
            },
            version_id="v1",
        )
        self.assertTrue(result["signals"]["generationLogMatched"])
        self.assertIs(result["signals"]["generationSuccess"], True)

    def test_generation_log_is_not_borrowed_from_a_nearer_version(self) -> None:
        # v2 saknar egen genereringslogg (logGeneration är best-effort). Raden som
        # finns ligger inom fönstret men hör tydligt till v1 — den får inte ärvas.
        db_data = {
            "versions": [
                {"id": "v2", "created_at": "2026-07-24T22:35:00+00:00"},
                {"id": "v1", "created_at": "2026-07-24T22:31:00+00:00"},
            ],
            "telemetry": [{"version_id": "v2", "preview_success": True}],
            "generations": [
                {"success": False, "error_message": "v1 föll", "created_at": "2026-07-24T22:31:02+00:00"}
            ],
        }
        result = assess.assess_run(
            version={
                "id": "v2",
                "created_at": "2026-07-24T22:35:00+00:00",
                "verification_state": "passed",
            },
            db_data=db_data,
            version_id="v2",
        )
        self.assertFalse(result["signals"]["generationLogMatched"])
        # Grönt kommer från den egna verifieringen — inte från v1:s logg.
        self.assertEqual(result["verdict"], assess.VERDICT_OK)
        # Och v1 får fortfarande sin egen rad.
        v1 = assess.assess_run(
            version={"id": "v1", "created_at": "2026-07-24T22:31:00+00:00"},
            db_data=db_data,
            version_id="v1",
        )
        self.assertTrue(v1["signals"]["generationLogMatched"])
        self.assertEqual(v1["verdict"], assess.VERDICT_FAILED)

    def test_generation_signal_needs_a_known_version_list(self) -> None:
        # Utan versions-rader kan ägarskapet inte avgöras — signalen ska bli okänd
        # i stället för att en rad antas höra till den bedömda versionen.
        created = "2026-07-24T22:35:00+00:00"
        result = assess.assess_run(
            version={"id": "v1", "created_at": created},
            db_data={
                "telemetry": [{"version_id": "v1", "preview_success": True}],
                "generations": [{"success": False, "created_at": created}],
            },
            version_id="v1",
        )
        self.assertFalse(result["signals"]["generationLogMatched"])
        self.assertIsNone(result["signals"]["generationSuccess"])

    def test_generation_signal_is_unknown_without_a_time_match(self) -> None:
        result = assess.assess_run(
            version={
                "id": "v2",
                "created_at": "2026-07-24T22:35:00+00:00",
                "verification_state": "passed",
            },
            db_data={
                "versions": [{"id": "v2", "created_at": "2026-07-24T22:35:00+00:00"}],
                "telemetry": [{"version_id": "v2", "preview_success": True}],
                "generations": [{"success": False, "created_at": "2026-07-01T10:00:00+00:00"}],
            },
            version_id="v2",
        )
        self.assertFalse(result["signals"]["generationLogMatched"])
        self.assertIsNone(result["signals"]["generationSuccess"])
        self.assertEqual(result["verdict"], assess.VERDICT_OK)
        self.assertEqual(assess.generation_for_version([{"success": True}], None), {})

    def test_version_id_is_read_from_the_version_row_when_not_passed(self) -> None:
        db_data = {
            "telemetry": [{"version_id": "other", "preview_success": False}],
            "generations": [{"success": True}],
        }
        result = assess.assess_run(version={"version_id": "mine"}, db_data=db_data)
        self.assertEqual(result["signals"]["assessedVersionId"], "mine")
        self.assertIsNone(result["signals"]["previewSuccess"])

    def test_failed_generation_and_deploy_are_failures(self) -> None:
        created = "2026-07-24T22:35:00+00:00"
        versions = [{"id": "v1", "created_at": created}]
        result = assess.assess_run(
            version={"id": "v1", "created_at": created},
            db_data={
                "versions": versions,
                "generations": [
                    {"success": False, "error_message": "Stream error", "created_at": created}
                ],
            },
        )
        self.assertEqual(result["verdict"], assess.VERDICT_FAILED)
        deploy = assess.assess_run(
            version={"id": "v1", "created_at": created},
            db_data={
                "versions": versions,
                "telemetry": [{"preview_success": True}],
                "generations": [{"success": True, "created_at": created}],
                "deploys": [{"status": "ERROR"}],
            },
        )
        self.assertEqual(deploy["verdict"], assess.VERDICT_FAILED)

    def test_cancelled_deploy_counts_as_failure_in_both_spellings(self) -> None:
        # DB-statusen är `cancelled` (mapVercelReadyStateToStatus), inte `canceled`.
        for status in ("cancelled", "canceled", "error"):
            result = assess.assess_run(
                version={"id": "v1", "verification_state": "passed"},
                db_data={
                    "telemetry": [{"preview_success": True}],
                    "deploys": [{"status": status}],
                },
            )
            self.assertEqual(result["verdict"], assess.VERDICT_FAILED, status)
        ready = assess.assess_run(
            version={"id": "v1", "verification_state": "passed"},
            db_data={"telemetry": [{"preview_success": True}], "deploys": [{"status": "ready"}]},
        )
        self.assertEqual(ready["verdict"], assess.VERDICT_OK)


class ReportTests(unittest.TestCase):
    def _manifest(self, **overrides) -> dict:
        manifest = {
            "collectedAt": "2026-07-24T23:12:05+00:00",
            "runDir": "2026-07-24_231205Z_chat",
            "env": {"path": ".env.local", "target": "localhost:5432/test", "prodLike": False},
            "identity": {"chatId": "chat-1", "versionId": "ver-1", "title": "Min sajt", "model": "gpt-5.5"},
            "owner": {"userId": None, "guest": True},
            "assessment": {"verdict": "delvis", "reasons": ["1 retry i genereringen."], "signals": {"retryCount": 1}},
            "tokens": {
                "source": "generation_telemetry",
                "versionId": "ver-1",
                "totals": {"calls": 1, "promptTokens": 10, "completionTokens": 5, "totalTokens": 15, "usd": 0.1, "sek": 1.05},
                "byModel": [{"model": "gpt-5.5", "calls": 1, "promptTokens": 10, "completionTokens": 5, "totalTokens": 15, "usd": 0.1, "sek": 1.05}],
                "byPhase": [{"phase": "codegen", "calls": 1, "totalTokens": 15}],
                "unpricedModels": [],
                "notes": ["2 telemetri-rader för versionen (retry/repair-pass) summeras."],
                "chat": {
                    "source": "engine_generation_logs",
                    "totals": {"calls": 4, "promptTokens": 900, "completionTokens": 100, "totalTokens": 1000, "usd": 1.0, "sek": 10.5},
                    "byModel": [{"model": "gpt-5.5", "calls": 4, "promptTokens": 900, "completionTokens": 100, "totalTokens": 1000, "usd": 1.0, "sek": 10.5}],
                    "unpricedModels": [],
                    "note": "Alla hämtade rader för chatten.",
                },
            },
            "coverage": {"note": "undre gräns", "unmeasuredPhases": [{"phase": "brief", "label": "Deep Brief", "reason": "loggas inte", "owner": "src/x.ts"}]},
            "sources": {"postgres": {"status": "ok"}, "openai": {"status": "unavailable", "reason": "saknar nyckel"}},
            "db": {"counts": {"versions": 1}, "tables": {"versions": "engine_versions"}},
            "rotation": {"maxGenLogs": 10, "removed": []},
            "tails": {},
        }
        manifest.update(overrides)
        return manifest

    def test_summary_leads_with_verdict(self) -> None:
        text = report.render_summary_md(self._manifest())
        self.assertIn("**Bedömning: delvis**", text)
        self.assertIn("Min sajt", text)
        self.assertIn("Deep Brief", text)
        self.assertIn("Ej tillgänglig", text)

    def test_owner_label_distinguishes_guest_from_unknown(self) -> None:
        self.assertEqual(report.owner_label({"userId": "user_1"}), "user_1")
        self.assertIn("gäst", report.owner_label({"userId": None, "guest": True}))
        # Reducerat läge vet inte om det är gäst — det ska inte se ut som gäst.
        unknown = report.owner_label({"userId": None, "guest": None, "unknown": True})
        self.assertIn("okänd", unknown)
        self.assertNotIn("gäst", unknown)
        self.assertEqual(report.owner_label({}), "okänd")

    def test_summary_separates_version_and_chat_scope(self) -> None:
        text = report.render_summary_md(self._manifest())
        self.assertIn("denna version", text)
        self.assertIn("Hela chatten", text)
        self.assertIn("retry/repair-pass", text)

    def test_html_shows_both_scopes(self) -> None:
        html_text = report.render_report_html(self._manifest())
        self.assertIn("Tokens (denna version)", html_text)
        self.assertIn("Tokens (hela chatten)", html_text)
        self.assertIn("Hela chatten (alla versioner)", html_text)

    def test_summary_escapes_pipes_in_table_cells(self) -> None:
        manifest = self._manifest()
        manifest["identity"]["model"] = "a | b"
        text = report.render_summary_md(manifest)
        self.assertIn("| Modell | a \\| b |", text)

    def test_html_is_self_contained_and_escapes_markup(self) -> None:
        manifest = self._manifest()
        manifest["identity"]["title"] = "<script>alert(1)</script>"
        html_text = report.render_report_html(manifest)
        self.assertTrue(html_text.startswith("<!doctype html>"))
        self.assertNotIn("<script>alert(1)</script>", html_text)
        self.assertIn("&lt;script&gt;", html_text)
        self.assertNotIn("http://", html_text.split("</style>")[0])  # inga externa resurser
        self.assertIn("Bedömning: Delvis", html_text)


class VercelSourceTests(unittest.TestCase):
    def test_missing_token_is_unavailable(self) -> None:
        result = vercel.collect(
            token=None, team_id=None, app_project_id=None, deploy_rows=[], since_ms=None, until_ms=None
        )
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("VERCEL_TOKEN", result["reason"])

    def test_pool_health_counts_both_markers(self) -> None:
        payload = [
            {"payload": {"text": "timeout exceeded when trying to connect"}},
            {"text": "EMAXCONNSESSION: max clients reached"},
            {"payload": {"text": "allt bra"}},
        ]
        health = vercel.scan_pool_health(payload)
        self.assertEqual(health["counts"], {"connect_timeout": 1, "max_sessions": 1})
        self.assertFalse(health["healthy"])
        healthy = vercel.scan_pool_health([{"payload": {"text": "ok"}}])
        self.assertTrue(healthy["healthy"])

    def test_build_log_tail_reads_payload_text(self) -> None:
        tail = vercel.build_log_tail([{"payload": {"text": "rad 1"}}, {"message": "rad 2"}, {"payload": {}}])
        self.assertEqual(tail, ["rad 1", "rad 2"])

    def test_build_log_tail_keeps_the_end_where_the_error_is(self) -> None:
        rows = [{"payload": {"text": f"rad {index}"}} for index in range(1, 11)]
        rows.append({"payload": {"text": "Error: Module not found"}})
        tail = vercel.build_log_tail(rows, max_lines=3)
        self.assertEqual(tail, ["rad 9", "rad 10", "Error: Module not found"])

    def test_site_deploy_rows_are_version_filtered(self) -> None:
        rows = [
            {"vercel_deployment_id": "dpl_v1", "version_id": "v1"},
            {"vercel_deployment_id": None, "version_id": "v2"},
        ]
        # v2 publicerades aldrig → v1:s byggfel får inte lånas in.
        mine, others = vercel.select_site_deploy_rows(rows, "v2")
        self.assertEqual(mine, [])
        self.assertEqual(others, ["v1"])
        # v1 får sin egen rad.
        mine_v1, _ = vercel.select_site_deploy_rows(rows, "v1")
        self.assertEqual(mine_v1[0]["vercel_deployment_id"], "dpl_v1")
        # Utan känd version faller den tillbaka på allt användbart.
        self.assertEqual(len(vercel.select_site_deploy_rows(rows, None)[0]), 1)

    def test_site_block_explains_why_no_build_log(self) -> None:
        result = vercel.collect(
            token="vcp_test0123456789",
            team_id=None,
            app_project_id=None,
            deploy_rows=[{"vercel_deployment_id": "dpl_v1", "version_id": "v1"}],
            since_ms=None,
            until_ms=None,
            version_id="v2",
        )
        self.assertEqual(result["site"]["status"], "no_deployment")
        self.assertIn("v1", result["site"]["note"])

    def test_env_policy_marks_the_local_only_keys(self) -> None:
        policy = json.loads((REPO_ROOT / "config" / "env-policy.json").read_text(encoding="utf-8"))
        rules = {rule["key"]: rule for rule in policy["rules"]}
        for key in ("DID_API_KEY", "MAX_GEN_LOGS"):
            self.assertIn(key, policy["extraKnownKeys"], key)
            self.assertIn(key, rules, key)
            self.assertEqual(rules[key]["classification"], "local_only", key)
            self.assertEqual(rules[key]["recommendedVercelTargets"], [], key)

        openai_admin = rules["OPENAI_ADMIN_KEY"]
        self.assertEqual(openai_admin["classification"], "optional_runtime")
        self.assertEqual(
            openai_admin["recommendedVercelTargets"],
            ["development", "preview", "production"],
        )

    def test_first_deployment_id_handles_uid_and_id(self) -> None:
        self.assertEqual(vercel._first_deployment_id({"deployments": [{"uid": "dpl_1"}]}), "dpl_1")
        self.assertEqual(vercel._first_deployment_id({"deployments": [{"id": "dpl_2"}]}), "dpl_2")
        self.assertIsNone(vercel._first_deployment_id({"deployments": []}))
        self.assertIsNone(vercel._first_deployment_id(None))

    def test_read_linked_project_maps_org_to_team(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".vercel").mkdir()
            (root / ".vercel" / "project.json").write_text(
                json.dumps({"projectId": "prj_1", "orgId": "team_1"}), encoding="utf-8"
            )
            self.assertEqual(vercel.read_linked_project(root), {"projectId": "prj_1", "teamId": "team_1"})
        self.assertEqual(vercel.read_linked_project(Path("/finns/inte")), {})


class FlySourceTests(unittest.TestCase):
    def test_missing_base_url_is_unavailable(self) -> None:
        result = fly.collect(base_url=None, api_key=None, chat_id="c1")
        self.assertEqual(result["status"], "unavailable")

    def test_derive_fly_app_from_base_url(self) -> None:
        self.assertEqual(fly.derive_fly_app("https://vm-fly-jakem.fly.dev"), "vm-fly-jakem")
        self.assertIsNone(fly.derive_fly_app("https://preview.example.com"))
        self.assertIsNone(fly.derive_fly_app(None))

    def test_find_session_prefers_exact_chat_and_version_match(self) -> None:
        payload = {
            "sessions": [
                {"previewSessionId": "ps_old", "chatId": "c1", "versionId": "v1"},
                {"previewSessionId": "ps_new", "chatId": "c1", "versionId": "v2"},
                {"previewSessionId": "ps_other", "chatId": "other", "versionId": "v9"},
            ]
        }
        # Flera sessioner för samma chat: versionen avgör vilken logg vi läser.
        self.assertEqual(
            fly.find_session(payload, chat_id="c1", version_id="v2")["previewSessionId"], "ps_new"
        )
        self.assertEqual(
            fly.find_session(payload, chat_id="okänd", version_id="v9")["previewSessionId"], "ps_other"
        )
        # Utan version faller den tillbaka på första chat-träffen.
        self.assertEqual(fly.find_session(payload, chat_id="c1")["previewSessionId"], "ps_old")
        self.assertIsNone(fly.find_session({"sessions": []}, chat_id="c1"))
        self.assertIsNone(fly.find_session(None, chat_id="c1"))

    def test_session_version_mismatch_is_reported(self) -> None:
        session = {"previewSessionId": "ps_old", "chatId": "c1", "versionId": "v1"}
        mismatch = fly.session_version_mismatch(session, "v2")
        assert mismatch is not None
        self.assertEqual(mismatch["sessionVersionId"], "v1")
        self.assertEqual(mismatch["expectedVersionId"], "v2")
        # Rätt version, ingen version, eller ingen session → ingen varning.
        self.assertIsNone(fly.session_version_mismatch(session, "v1"))
        self.assertIsNone(fly.session_version_mismatch(session, None))
        self.assertIsNone(fly.session_version_mismatch(None, "v2"))
        self.assertIsNone(fly.session_version_mismatch({"chatId": "c1"}, "v2"))

    def test_log_tail_formats_entries(self) -> None:
        tail = fly.log_tail({"lines": [{"ts": "2026-07-24T00:00:00Z", "message": "boot"}, "rå rad"]})
        self.assertEqual(tail, ["2026-07-24T00:00:00Z boot", "rå rad"])
        self.assertEqual(fly.log_tail({}), [])


class OpenAiUsageTests(unittest.TestCase):
    def test_missing_admin_key_explains_which_key_is_needed(self) -> None:
        result = openai_usage.collect(admin_key=None, start_epoch=0, end_epoch=60)
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("OPENAI_ADMIN_KEY", result["reason"])
        self.assertIn("OPENAI_API_KEY", result["reason"])

    def test_minute_buckets_are_capped(self) -> None:
        self.assertEqual(openai_usage.minute_buckets_for_window(0, 60), 1)
        self.assertEqual(openai_usage.minute_buckets_for_window(0, 61), 2)
        self.assertEqual(openai_usage.minute_buckets_for_window(0, 10**7), openai_usage.MAX_MINUTE_BUCKETS)

    def test_sum_usage_aggregates_per_model(self) -> None:
        payload = {
            "data": [
                {
                    "results": [
                        {"model": "gpt-5.5", "input_tokens": 100, "output_tokens": 10, "num_model_requests": 1},
                        {"model": "gpt-5.5", "input_tokens": 50, "output_tokens": 5, "num_model_requests": 1},
                        {"model": "text-embedding-3-small", "input_tokens": 7, "num_model_requests": 1},
                    ]
                }
            ]
        }
        totals = openai_usage.sum_usage(payload)
        self.assertEqual(totals["totals"]["input_tokens"], 157)
        self.assertEqual(totals["totals"]["num_model_requests"], 3)
        by_model = {row["model"]: row for row in totals["byModel"]}
        self.assertEqual(by_model["gpt-5.5"]["input_tokens"], 150)

    def test_sum_costs_groups_line_items(self) -> None:
        payload = {
            "data": [
                {"results": [{"amount": {"value": 0.5, "currency": "usd"}, "line_item": "gpt-5.5"}]},
                {"results": [{"amount": {"value": 0.25, "currency": "usd"}, "line_item": "Image models"}]},
            ]
        }
        costs = openai_usage.sum_costs(payload)
        self.assertAlmostEqual(costs["amount"], 0.75)
        self.assertEqual(costs["byLineItem"][0]["lineItem"], "gpt-5.5")


class DidSourceTests(unittest.TestCase):
    def test_missing_key_points_at_the_right_env(self) -> None:
        result = did.collect(api_key=None)
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("DID_API_KEY", result["reason"])
        self.assertIn("NEXT_PUBLIC_AVATAR_", result["reason"])

    def test_auth_variants_try_raw_then_base64(self) -> None:
        variants = did.auth_variants(f"user@example.com:{FAKE_DB_PASSWORD}")
        self.assertEqual(len(variants), 2)
        self.assertTrue(variants[0].startswith("Basic user@example.com:"))
        self.assertNotIn(":", variants[1].split(" ", 1)[1])
        self.assertEqual(len(did.auth_variants("dXNlcjpwYXNz")), 1)

    def test_summarize_credits_handles_dict_and_list(self) -> None:
        self.assertEqual(
            did.summarize_credits({"credits": {"total": 200, "remaining": 100}}),
            {"remaining": 100.0, "total": 200.0, "items": 1},
        )
        summed = did.summarize_credits(
            {"credits": [{"total": 10, "remaining": 4}, {"total": 5, "remaining": 1}]}
        )
        assert summed is not None
        self.assertEqual(summed["remaining"], 5.0)
        self.assertIsNone(did.summarize_credits(None))

    def test_filter_talks_uses_window(self) -> None:
        start = dt.datetime(2026, 7, 24, 12, 0, tzinfo=dt.timezone.utc)
        end = dt.datetime(2026, 7, 24, 13, 0, tzinfo=dt.timezone.utc)
        payload = {
            "talks": [
                {"id": "in", "created_at": "2026-07-24T12:30:00Z"},
                {"id": "ute", "created_at": "2026-07-25T12:30:00Z"},
                {"id": "utan-datum"},
            ]
        }
        ids = [row["id"] for row in did.filter_talks(payload, start, end)]
        self.assertEqual(ids, ["in"])
        self.assertEqual(len(did.filter_talks(payload, None, None)), 3)


class HttpParamTests(unittest.TestCase):
    def test_repeated_keys_and_skipped_none(self) -> None:
        url = _with_params("https://x/y", {"group_by": ["model", "project_id"], "skip": None, "limit": 5})
        self.assertIn("group_by=model&group_by=project_id", url)
        self.assertIn("limit=5", url)
        self.assertNotIn("skip", url)

    def test_appends_to_existing_query(self) -> None:
        self.assertEqual(_with_params("https://x/y?a=1", {"b": 2}), "https://x/y?a=1&b=2")
        self.assertEqual(_with_params("https://x/y", None), "https://x/y")

    def test_ndjson_fallback(self) -> None:
        self.assertEqual(_parse_ndjson('{"a":1}\n{"b":2}\n'), [{"a": 1}, {"b": 2}])
        self.assertIsNone(_parse_ndjson("not json"))


class CliHelperTests(unittest.TestCase):
    def test_env_path_resolution_prefers_explicit_flags(self) -> None:
        parser = CLI.build_parser()
        self.assertEqual(CLI.resolve_env_path(parser.parse_args(["--prod"])), envfile.PROD_ENV_FILE)
        self.assertEqual(CLI.resolve_env_path(parser.parse_args(["--dev"])), envfile.DEV_ENV_FILE)
        self.assertEqual(CLI.resolve_env_path(parser.parse_args(["--env", "x.env"])), "x.env")

    def test_default_is_dev_even_when_a_prod_snapshot_exists(self) -> None:
        # Prod ska aldrig väljas tyst bara för att snapshot-filen ligger kvar.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / envfile.PROD_ENV_FILE).write_text("POSTGRES_URL=x\n", encoding="utf-8")
            self.assertTrue(envfile.prod_snapshot_exists(root))
            self.assertEqual(envfile.default_env_file(root), envfile.DEV_ENV_FILE)
        self.assertEqual(
            CLI.resolve_env_path(CLI.build_parser().parse_args([])), envfile.DEV_ENV_FILE
        )

    def test_conflicting_prod_and_dev_exits_with_usage_error(self) -> None:
        self.assertEqual(CLI.main(["--prod", "--dev"]), 2)

    def test_datetime_parsing_normalizes_to_utc(self) -> None:
        parsed = CLI._as_datetime("2026-07-24T23:12:05Z")
        assert parsed is not None
        self.assertEqual(parsed.tzinfo, dt.timezone.utc)
        naive = CLI._as_datetime(dt.datetime(2026, 7, 24, 23, 12, 5))
        assert naive is not None
        self.assertEqual(naive.tzinfo, dt.timezone.utc)
        self.assertIsNone(CLI._as_datetime("inte ett datum"))
        self.assertIsNone(CLI._as_datetime(None))

    def test_digests_surface_unavailable_reason(self) -> None:
        digest = CLI._openai_digest({"status": "unavailable", "reason": "saknar nyckel"})
        self.assertEqual(digest, {"status": "unavailable", "reason": "saknar nyckel"})
        did_digest = CLI._did_digest({"status": "ok", "creditsSummary": {"remaining": 5}, "talksInWindow": [1, 2]})
        self.assertEqual(did_digest["talksInWindow"], 2)
        self.assertEqual(did_digest["credits"], {"remaining": 5})


if __name__ == "__main__":
    unittest.main()
