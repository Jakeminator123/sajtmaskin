"""Positive- and negative-path tests for the matching-config validate-on-save.

Guards the Backoffice 2.0 Fas 5 save guards added to the matching-config
editors (``codegen_core.py`` domain-rules + prompt-heuristic-tokens, and
``scaffold_lifecycle.py`` scaffold variants). Each editor builds a dict/list as
today, then calls ``validate_json_against_schema`` before writing.

The currently-committed config files must stay schema-valid so a legitimate
save is never blocked, and an obviously-broken value must be caught before it
can corrupt the matching config.

NOTE: a previous drift (``corporate-grid`` >20 keywords; ``asymmetric-stack``
and ``hero-fullbleed-bg`` over-long ``signatureMotif`` / >4 antiPatterns) was
trimmed alongside this validate-on-save guard, so every committed variant now
satisfies ``scaffold-variant.schema.json``. ``test_all_committed_variants_pass``
asserts the whole set stays valid; the scaffold-variant schema itself is
unchanged by this phase.
"""

from __future__ import annotations

import copy
import unittest
from pathlib import Path

from backoffice import REPO_ROOT
from backoffice.shared import read_json, validate_json_against_schema

STRICT_DIR = REPO_ROOT / "docs" / "schemas" / "strict"
DOMAIN_RULES_JSON = REPO_ROOT / "config" / "domain-rules.json"
DOMAIN_RULES_SCHEMA = STRICT_DIR / "domain-rules.schema.json"
HEURISTIC_TOKENS_JSON = REPO_ROOT / "config" / "prompt-heuristic-tokens.json"
HEURISTIC_TOKENS_SCHEMA = STRICT_DIR / "prompt-heuristic-tokens.schema.json"
VARIANT_SCHEMA = STRICT_DIR / "scaffold-variant.schema.json"
KNOWN_GOOD_VARIANT = (
    REPO_ROOT / "config" / "scaffold-variants" / "base-nextjs" / "starter-neutral.json"
)


class DomainRulesSchemaTests(unittest.TestCase):
    def test_committed_domain_rules_pass(self) -> None:
        """The committed config/domain-rules.json must remain schema-valid."""
        data = read_json(DOMAIN_RULES_JSON)
        self.assertEqual(validate_json_against_schema(data, DOMAIN_RULES_SCHEMA), [])

    def test_unknown_domain_is_rejected(self) -> None:
        """A domain outside DOMAIN_PROFILES must be caught before write."""
        data = [
            {
                "domain": "not-a-domain",
                "briefHint": "x",
                "keywords_sv": [],
                "keywords_en": ["foo"],
            }
        ]
        errors = validate_json_against_schema(data, DOMAIN_RULES_SCHEMA)
        self.assertTrue(errors, "expected an enum error for an unknown domain")

    def test_missing_keyword_arrays_are_rejected(self) -> None:
        """The runtime spreads keywords_sv/keywords_en; a missing array (which
        would throw at runtime) must be caught."""
        data = [{"domain": "restaurant", "briefHint": "x", "keywords_en": ["foo"]}]
        self.assertTrue(validate_json_against_schema(data, DOMAIN_RULES_SCHEMA))

    def test_both_keyword_arrays_empty_is_rejected(self) -> None:
        """A rule with both keyword arrays empty compiles to an empty-alternation
        regex at runtime (src/lib/builder/domain-inference.ts), which matches
        almost any prompt and shadows every later rule. The schema must reject it
        before the backoffice editor can save such a rule."""
        data = [
            {
                "domain": "restaurant",
                "briefHint": "x",
                "keywords_sv": [],
                "keywords_en": [],
            }
        ]
        self.assertTrue(
            validate_json_against_schema(data, DOMAIN_RULES_SCHEMA),
            "expected an anyOf error when both keyword arrays are empty",
        )

    def test_one_keyword_array_empty_is_allowed(self) -> None:
        """A rule with exactly one non-empty keyword array is legitimate (a domain
        may have only Swedish or only English triggers) and must NOT be blocked."""
        data = [
            {
                "domain": "restaurant",
                "briefHint": "x",
                "keywords_sv": ["restaurang"],
                "keywords_en": [],
            }
        ]
        self.assertEqual(validate_json_against_schema(data, DOMAIN_RULES_SCHEMA), [])


class PromptHeuristicTokensSchemaTests(unittest.TestCase):
    def test_committed_tokens_pass(self) -> None:
        """The committed config/prompt-heuristic-tokens.json must stay valid."""
        data = read_json(HEURISTIC_TOKENS_JSON)
        self.assertEqual(validate_json_against_schema(data, HEURISTIC_TOKENS_SCHEMA), [])

    def test_non_list_tokens_are_rejected(self) -> None:
        """tokens must be an array of strings; a string value must be caught."""
        data = copy.deepcopy(read_json(HEURISTIC_TOKENS_JSON))
        data["design"]["tokens"] = "not-a-list"
        self.assertTrue(validate_json_against_schema(data, HEURISTIC_TOKENS_SCHEMA))

    def test_missing_required_category_is_rejected(self) -> None:
        """prompt-heuristics.ts reads design/scope/requirements/sections/styles;
        dropping one must be caught."""
        data = copy.deepcopy(read_json(HEURISTIC_TOKENS_JSON))
        del data["styles"]
        self.assertTrue(validate_json_against_schema(data, HEURISTIC_TOKENS_SCHEMA))


VARIANTS_DIR = REPO_ROOT / "config" / "scaffold-variants"


class ScaffoldVariantSchemaTests(unittest.TestCase):
    def test_known_good_variant_passes(self) -> None:
        """A stable committed variant must validate so re-saving it is never
        blocked by the new guard."""
        self.assertTrue(KNOWN_GOOD_VARIANT.is_file(), f"missing {KNOWN_GOOD_VARIANT}")
        data = read_json(KNOWN_GOOD_VARIANT)
        self.assertEqual(validate_json_against_schema(data, VARIANT_SCHEMA), [])

    def test_all_committed_variants_pass(self) -> None:
        """EVERY committed scaffold variant must satisfy scaffold-variant.schema.json
        so that the backoffice validate-on-save guard never blocks re-saving an
        existing variant. Guards against the drift that was trimmed alongside this
        phase (corporate-grid keyword count, asymmetric-stack / hero-fullbleed-bg
        signatureMotif length + antiPattern count) ever creeping back."""
        # config/scaffold-variants/<scaffoldId>/<variant>.json — skip the
        # tooling-only `_index/` dir (variant-embeddings.json is not a variant).
        variant_files = sorted(
            f
            for f in VARIANTS_DIR.glob("*/*.json")
            if not f.parent.name.startswith("_")
        )
        self.assertTrue(variant_files, f"no variant files under {VARIANTS_DIR}")
        failures: list[str] = []
        for variant_file in variant_files:
            errors = validate_json_against_schema(read_json(variant_file), VARIANT_SCHEMA)
            if errors:
                rel = variant_file.relative_to(REPO_ROOT).as_posix()
                failures.append(f"{rel}: {'; '.join(errors)}")
        self.assertEqual(failures, [], "schema-invalid committed variants:\n" + "\n".join(failures))

    def test_missing_required_field_is_rejected(self) -> None:
        """Dropping a required field (signatureMotif) must be caught before
        write."""
        data = copy.deepcopy(read_json(KNOWN_GOOD_VARIANT))
        data.pop("signatureMotif", None)
        self.assertTrue(validate_json_against_schema(data, VARIANT_SCHEMA))

    def test_too_few_keywords_are_rejected(self) -> None:
        """keywords has minItems: 3; a single-keyword variant must be caught."""
        data = copy.deepcopy(read_json(KNOWN_GOOD_VARIANT))
        data["keywords"] = ["solo"]
        self.assertTrue(validate_json_against_schema(data, VARIANT_SCHEMA))


class FailClosedTests(unittest.TestCase):
    def test_missing_schema_file_fails_closed(self) -> None:
        """A missing schema path returns a non-empty error list so the caller
        skips the write rather than persisting unvalidated data."""
        missing = STRICT_DIR / "does-not-exist.schema.json"
        self.assertTrue(validate_json_against_schema([], missing))


if __name__ == "__main__":
    unittest.main()
