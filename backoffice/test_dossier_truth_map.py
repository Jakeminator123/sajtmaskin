"""Tester för Systemkarta-lagret: projektionsläsning, filter, DOT och färskhet.

Python-sidan får inte äga någon härledning — den läser den genererade
projektionen (`data/dossiers/_index/capability-map.json`) och renderar. Testerna
låser precis det: rad-/filter-/DOT-hjälparna är rena, och färskhetskollen jämför
exakta sha256-hashar mot de källfiler projektionen själv listar.

Ingen Streamlit-runtime och inga subprocess-anrop (`_run_capability_map_write`
mockas), samma disciplin som test_dossiers_page.py.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backoffice.pages import dossiers as dossiers_page
from backoffice.pages.dossiers_lib import io as dossiers_io
from backoffice.pages.dossiers_lib.truth_map import (
    build_system_map_dot,
    build_system_map_rows,
    filter_system_map_rows,
    index_dossiers_by_class_and_id,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
CAPABILITY_MAP_PATH = REPO_ROOT / "data" / "dossiers" / "_index" / "capability-map.json"


def _source_file_sha256(path: Path) -> str:
    """Match the capability-map generator's platform-stable LF hash."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


PROJECTION = {
    "groups": {
        "payments": {"label": "Betalningar", "capabilities": ["payments"]},
        "analytics": {"label": "Mätning", "capabilities": ["analytics"]},
    },
    "dossiers": [
        {
            "id": "stripe-checkout",
            "label": "Betalningar — Stripe",
            "class": "hard",
            "capability": "payments",
            "providers": ["stripe"],
            "defaultForCapability": True,
            "mock": "demo",
            "envVars": [
                {"key": "STRIPE_SECRET_KEY", "required": True, "enforcement": "build"},
                {"key": "STRIPE_PUBLIC_KEY", "required": False},
            ],
            "fileRoles": {"client": 2, "server": 1},
            "dependencies": ["stripe"],
            "summarySv": "Tar betalt.",
            "verificationStatus": "accepted",
            "lastVerified": "2026-04-21",
            "f2Disposition": "deferred",
            "f2Reason": "build-server",
            "buildServerRequirement": True,
            "buildServerReasons": ["build-env", "server-file"],
        },
        {
            "id": "vercel-analytics",
            "label": "Besöksstatistik — Vercel",
            "class": "hard",
            "capability": "analytics",
            "providers": ["vercel-analytics"],
            "defaultForCapability": True,
            "mock": "none",
            "envVars": [],
            "fileRoles": {"client": 1},
            "dependencies": ["@vercel/analytics"],
            "summarySv": "Räknar besök.",
            "verificationStatus": "accepted",
            "lastVerified": "2026-04-21",
            "f2Disposition": "deferred",
            "f2Reason": "policy-only",
            "buildServerRequirement": False,
            "buildServerReasons": [],
        },
        {
            "id": "local-site-search",
            "label": "Sök på sajten",
            "class": "soft",
            "capability": "site-search",
            "providers": [],
            "defaultForCapability": True,
            "mock": None,
            "envVars": [{"key": "SEARCH_HINT", "required": False, "enforcement": "warn-only"}],
            "fileRoles": {},
            "dependencies": [],
            "summarySv": "Söker lokalt.",
            "verificationStatus": "unverified",
            "lastVerified": "2026-05-02",
            "f2Disposition": "available",
            "f2Reason": "available",
            "buildServerRequirement": False,
            "buildServerReasons": [],
        },
    ],
}


class BuildSystemMapRowsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rows = build_system_map_rows(PROJECTION)
        self.by_id = {row["id"]: row for row in self.rows}

    def test_every_dossier_becomes_one_row(self) -> None:
        self.assertEqual(len(self.rows), 3)

    def test_rows_are_sorted_by_group_capability_id(self) -> None:
        keys = [(row["group_label"], row["capability"], row["id"]) for row in self.rows]
        self.assertEqual(keys, sorted(keys))

    def test_group_label_comes_from_the_projection_groups_view(self) -> None:
        self.assertEqual(self.by_id["stripe-checkout"]["group_label"], "Betalningar")
        self.assertEqual(self.by_id["stripe-checkout"]["group_id"], "payments")

    def test_capability_missing_from_groups_view_falls_back_to_ovrigt(self) -> None:
        # `site-search` is deliberately absent from PROJECTION["groups"].
        self.assertEqual(self.by_id["local-site-search"]["group_id"], "other")
        self.assertEqual(self.by_id["local-site-search"]["group_label"], "Övrigt")

    def test_env_vars_are_bucketed_by_enforcement_with_build_as_default(self) -> None:
        buckets = self.by_id["stripe-checkout"]["env_by_enforcement"]
        self.assertEqual(buckets["build"], ["STRIPE_PUBLIC_KEY", "STRIPE_SECRET_KEY"])
        self.assertEqual(buckets["feature-runtime"], [])
        self.assertEqual(buckets["warn-only"], [])
        self.assertEqual(
            self.by_id["local-site-search"]["env_by_enforcement"]["warn-only"], ["SEARCH_HINT"]
        )

    def test_axes_are_carried_through_untouched(self) -> None:
        analytics = self.by_id["vercel-analytics"]
        self.assertEqual(analytics["f2_disposition"], "deferred")
        self.assertEqual(analytics["f2_reason"], "policy-only")
        self.assertFalse(analytics["build_server_requirement"])
        self.assertEqual(analytics["build_server_reasons"], [])

    def test_missing_mock_becomes_none_and_file_roles_are_ints(self) -> None:
        self.assertEqual(self.by_id["local-site-search"]["mock"], "none")
        self.assertEqual(self.by_id["stripe-checkout"]["file_roles"], {"client": 2, "server": 1})

    def test_non_dict_entries_and_missing_views_are_skipped(self) -> None:
        self.assertEqual(build_system_map_rows({}), [])
        self.assertEqual(build_system_map_rows({"dossiers": ["nope", None, 7]}), [])

    def test_groups_view_of_wrong_type_does_not_crash(self) -> None:
        rows = build_system_map_rows({"groups": "nope", "dossiers": PROJECTION["dossiers"]})
        self.assertEqual({row["group_id"] for row in rows}, {"other"})


class IndexDossiersByClassAndIdTests(unittest.TestCase):
    """Systemkartans radvy slår upp rå-manifestet (`_walk_all_dossiers()`-
    formen, med `_class`/`_path`) via denna lookup — inte projektionsraden."""

    def test_looks_up_by_class_and_id_tuple(self) -> None:
        pool = [
            {"_class": "hard", "id": "stripe-checkout", "_path": "data/dossiers/hard/stripe-checkout"},
            {"_class": "soft", "id": "local-site-search", "_path": "data/dossiers/soft/local-site-search"},
        ]
        index = index_dossiers_by_class_and_id(pool)
        self.assertEqual(
            index[("hard", "stripe-checkout")]["_path"],
            "data/dossiers/hard/stripe-checkout",
        )
        self.assertEqual(len(index), 2)

    def test_same_id_in_both_classes_does_not_collide(self) -> None:
        pool = [
            {"_class": "hard", "id": "dup"},
            {"_class": "soft", "id": "dup"},
        ]
        index = index_dossiers_by_class_and_id(pool)
        self.assertEqual(len(index), 2)
        self.assertIsNot(index[("hard", "dup")], index[("soft", "dup")])

    def test_non_dict_entries_are_skipped_not_raised(self) -> None:
        pool = [{"_class": "hard", "id": "ok"}, "nope", None, 7]
        index = index_dossiers_by_class_and_id(pool)
        self.assertEqual(list(index.keys()), [("hard", "ok")])

    def test_missing_class_or_id_falls_back_to_empty_string_key(self) -> None:
        index = index_dossiers_by_class_and_id([{"id": "no-class"}])
        self.assertIn(("", "no-class"), index)

    def test_unknown_lookup_key_is_a_plain_miss(self) -> None:
        index = index_dossiers_by_class_and_id([{"_class": "hard", "id": "acme"}])
        self.assertIsNone(index.get(("hard", "missing")))


class FilterSystemMapRowsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rows = build_system_map_rows(PROJECTION)

    def _ids(self, **kwargs) -> list[str]:
        return [row["id"] for row in filter_system_map_rows(self.rows, **kwargs)]

    def test_no_filters_returns_everything(self) -> None:
        self.assertEqual(len(self._ids()), 3)

    def test_group_filter(self) -> None:
        self.assertEqual(self._ids(groups={"analytics"}), ["vercel-analytics"])

    def test_class_filter(self) -> None:
        self.assertEqual(self._ids(classes={"soft"}), ["local-site-search"])

    def test_f2_disposition_filter(self) -> None:
        self.assertEqual(self._ids(f2_dispositions={"available"}), ["local-site-search"])

    def test_build_server_filter_separates_the_two_axes(self) -> None:
        self.assertEqual(self._ids(build_server_values={True}), ["stripe-checkout"])
        self.assertEqual(
            sorted(self._ids(build_server_values={False})),
            ["local-site-search", "vercel-analytics"],
        )

    def test_empty_selection_matches_nothing(self) -> None:
        self.assertEqual(self._ids(groups=set()), [])

    def test_query_matches_provider_dependency_and_label_case_insensitively(self) -> None:
        self.assertEqual(self._ids(query="STRIPE"), ["stripe-checkout"])
        self.assertEqual(self._ids(query="@vercel/analytics"), ["vercel-analytics"])
        self.assertEqual(self._ids(query="  Mätning "), ["vercel-analytics"])
        self.assertEqual(self._ids(query="ingenting-alls"), [])

    def test_blank_query_is_not_a_filter(self) -> None:
        self.assertEqual(len(self._ids(query="   ")), 3)


class BuildSystemMapDotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rows = build_system_map_rows(PROJECTION)

    def test_dot_is_row_order_independent(self) -> None:
        self.assertEqual(
            build_system_map_dot(self.rows), build_system_map_dot(list(reversed(self.rows)))
        )

    def test_dot_is_stable_across_repeated_calls(self) -> None:
        self.assertEqual(build_system_map_dot(self.rows), build_system_map_dot(self.rows))

    def test_dot_wires_group_capability_dossier_provider(self) -> None:
        dot = build_system_map_dot(self.rows)
        self.assertIn('"group:payments" -> "cap:payments";', dot)
        self.assertIn('"cap:payments" -> "dossier:hard:stripe-checkout";', dot)
        self.assertIn('"dossier:hard:stripe-checkout" -> "provider:stripe";', dot)
        self.assertTrue(dot.startswith("digraph dossiers {"))
        self.assertTrue(dot.endswith("}"))

    def test_dot_labels_f2_status_per_dossier(self) -> None:
        dot = build_system_map_dot(self.rows)
        self.assertIn("Planerad F2", dot)
        self.assertIn("Tillgänglig F2", dot)

    def test_dot_escapes_quotes_and_backslashes(self) -> None:
        rows = build_system_map_rows(
            {
                "groups": {"g": {"label": 'Grupp "A"', "capabilities": ["c"]}},
                "dossiers": [
                    {
                        "id": "d",
                        "label": 'Namn "med" \\ tecken',
                        "class": "soft",
                        "capability": "c",
                        "f2Disposition": "available",
                    }
                ],
            }
        )
        dot = build_system_map_dot(rows)
        self.assertIn('Namn \\"med\\" \\\\ tecken', dot)

    def test_empty_rows_still_yield_a_valid_graph(self) -> None:
        dot = build_system_map_dot([])
        self.assertTrue(dot.startswith("digraph dossiers {"))
        self.assertTrue(dot.endswith("}"))


class CapabilityMapFreshnessTests(unittest.TestCase):
    """`_capability_map_is_stale` compares exact hashes of the sources the
    projection itself lists — no mtimes, no counts, no Python copy of the TS
    path list."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        self.index_root = self.dossier_root / "_index"
        self.index_root.mkdir(parents=True)
        self.map_path = self.index_root / "capability-map.json"

        self.source = self.repo_root / "src" / "lib" / "gen" / "dossiers" / "f2-mute.ts"
        self.source.parent.mkdir(parents=True)
        self.source.write_text("export const x = 1;\n", encoding="utf-8")

        self.manifest = self.dossier_root / "hard" / "acme" / "manifest.json"
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_text(json.dumps({"id": "acme"}), encoding="utf-8")

        for target, value in (
            ("REPO_ROOT", self.repo_root),
            ("DOSSIER_ROOT", self.dossier_root),
            ("CAPABILITY_MAP_PATH", self.map_path),
        ):
            patch = mock.patch.object(dossiers_page, target, value)
            patch.start()
            self.addCleanup(patch.stop)

    def _sha(self, path: Path) -> str:
        return _source_file_sha256(path)

    def _fresh_projection(self) -> dict:
        return {
            "dossiers": [],
            "groups": {},
            "f2Policy": {"mutedCapabilities": []},
            "labelsSv": {"class": {}, "mock": {}, "requiresF3": {}},
            "policy": {"mocklessCapabilityExceptions": ["analytics"]},
            "sourceFiles": {
                "data/dossiers/hard/acme/manifest.json": self._sha(self.manifest),
                "src/lib/gen/dossiers/f2-mute.ts": self._sha(self.source),
            },
        }

    def test_matching_hashes_are_not_stale(self) -> None:
        self.assertFalse(dossiers_io._capability_map_is_stale(self._fresh_projection()))

    def test_crlf_source_matches_lf_projection_and_real_drift_is_stale(self) -> None:
        self.source.write_bytes(b"export const x = 1;\n")
        projection = self._fresh_projection()

        self.source.write_bytes(b"export const x = 1;\r\n")
        self.assertFalse(dossiers_io._capability_map_is_stale(projection))

        self.source.write_bytes(b"export const x = 2;\r\n")
        self.assertTrue(dossiers_io._capability_map_is_stale(projection))

    def test_content_drift_in_a_recorded_source_is_stale(self) -> None:
        projection = self._fresh_projection()
        self.source.write_text("export const x = 2;\n", encoding="utf-8")
        self.assertTrue(dossiers_io._capability_map_is_stale(projection))

    def test_manifest_content_drift_is_stale(self) -> None:
        projection = self._fresh_projection()
        self.manifest.write_text(json.dumps({"id": "acme", "capability": "cms"}), encoding="utf-8")
        self.assertTrue(dossiers_io._capability_map_is_stale(projection))

    def test_recorded_source_deleted_from_disk_is_stale(self) -> None:
        projection = self._fresh_projection()
        self.source.unlink()
        self.assertTrue(dossiers_io._capability_map_is_stale(projection))

    def test_added_dossier_directory_is_stale(self) -> None:
        projection = self._fresh_projection()
        added = self.dossier_root / "soft" / "newcomer" / "manifest.json"
        added.parent.mkdir(parents=True)
        added.write_text(json.dumps({"id": "newcomer"}), encoding="utf-8")
        self.assertTrue(dossiers_io._capability_map_is_stale(projection))

    def test_removed_dossier_directory_is_stale(self) -> None:
        projection = self._fresh_projection()
        self.manifest.unlink()
        self.manifest.parent.rmdir()
        self.assertTrue(dossiers_io._capability_map_is_stale(projection))

    def test_missing_or_malformed_source_files_view_is_stale(self) -> None:
        for broken in ({}, {"sourceFiles": None}, {"sourceFiles": []}, {"sourceFiles": {}}):
            with self.subTest(broken=broken):
                self.assertTrue(dossiers_io._capability_map_is_stale(broken))

    def test_absolute_or_escaping_keys_never_become_paths(self) -> None:
        # A corrupt/hand-edited projection must degrade to "stale" (which soft-
        # regenerates), never raise out of a Streamlit render or read outside
        # the repo. pathlib would otherwise let an absolute key replace the base.
        for key in (
            "/etc/passwd",
            "C:/Windows/win.ini",
            "../../../etc/passwd",
            "src/../../escape.ts",
            "",
        ):
            with self.subTest(key=key):
                projection = {"sourceFiles": {key: "0" * 64}}
                self.assertTrue(dossiers_io._capability_map_is_stale(projection))

    def test_projection_with_only_manifest_keys_is_stale(self) -> None:
        # No fixed TS/JSON source recorded → nothing to derive the path list
        # from, so the guard must not silently accept the file as fresh.
        projection = {
            "sourceFiles": {"data/dossiers/hard/acme/manifest.json": self._sha(self.manifest)}
        }
        self.assertTrue(dossiers_io._capability_map_is_stale(projection))


class EnsureCapabilityMapCurrentTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo_root = Path(self._tmp.name)
        self.dossier_root = self.repo_root / "data" / "dossiers"
        self.index_root = self.dossier_root / "_index"
        self.index_root.mkdir(parents=True)
        self.map_path = self.index_root / "capability-map.json"
        for target, value in (
            ("REPO_ROOT", self.repo_root),
            ("DOSSIER_ROOT", self.dossier_root),
            ("CAPABILITY_MAP_PATH", self.map_path),
        ):
            patch = mock.patch.object(dossiers_page, target, value)
            patch.start()
            self.addCleanup(patch.stop)

    def test_broken_json_triggers_regeneration_and_warns_on_failure(self) -> None:
        self.map_path.write_text("{ not json", encoding="utf-8")
        with mock.patch.object(
            dossiers_io, "_run_capability_map_write", return_value=(False, "npm saknas")
        ) as runner:
            projection, warning = dossiers_io._ensure_capability_map_current()
        runner.assert_called_once()
        self.assertEqual(projection, {})
        self.assertIsNotNone(warning)
        self.assertIn("npm saknas", warning)

    def test_missing_file_triggers_regeneration(self) -> None:
        with mock.patch.object(
            dossiers_io, "_run_capability_map_write", return_value=(False, "")
        ) as runner:
            _, warning = dossiers_io._ensure_capability_map_current()
        runner.assert_called_once()
        self.assertIsNotNone(warning)

    def test_green_generator_that_leaves_an_incomplete_view_still_warns(self) -> None:
        self.map_path.write_text(json.dumps({"dossiers": []}), encoding="utf-8")
        with mock.patch.object(
            dossiers_io, "_run_capability_map_write", return_value=(True, "wrote map")
        ):
            _, warning = dossiers_io._ensure_capability_map_current()
        self.assertIsNotNone(warning)
        self.assertIn("fortfarande ofullständig", warning)

    def test_fresh_projection_never_shells_out(self) -> None:
        source = self.repo_root / "src" / "lib" / "gen" / "dossiers" / "f2-mute.ts"
        source.parent.mkdir(parents=True)
        source.write_text("export const x = 1;\n", encoding="utf-8")
        self.map_path.write_text(
            json.dumps(
                {
                    "dossiers": [],
                    "groups": {},
                    "f2Policy": {"mutedCapabilities": []},
                    "labelsSv": {"class": {}, "mock": {}, "requiresF3": {}},
                    "policy": {"mocklessCapabilityExceptions": ["analytics"]},
                    "sourceFiles": {
                        "src/lib/gen/dossiers/f2-mute.ts": _source_file_sha256(source),
                    },
                }
            ),
            encoding="utf-8",
        )
        with mock.patch.object(dossiers_io, "_run_capability_map_write") as runner:
            projection, warning = dossiers_io._ensure_capability_map_current()
        runner.assert_not_called()
        self.assertIsNone(warning)
        self.assertEqual(projection["f2Policy"], {"mutedCapabilities": []})


class CommittedProjectionTests(unittest.TestCase):
    """Sanity against the real, committed projection — the file the CI gate
    (`npm run dossiers:capability-map:check`) keeps fresh."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.projection = json.loads(CAPABILITY_MAP_PATH.read_text(encoding="utf-8"))
        cls.rows = build_system_map_rows(cls.projection)

    def test_committed_projection_is_not_stale(self) -> None:
        self.assertFalse(dossiers_io._capability_map_is_stale(self.projection))

    def test_every_row_lands_in_a_named_category(self) -> None:
        self.assertGreater(len(self.rows), 0)
        self.assertNotIn("other", {row["group_id"] for row in self.rows})

    def test_analytics_is_the_control_case_at_the_python_layer(self) -> None:
        analytics = next(row for row in self.rows if row["id"] == "vercel-analytics")
        self.assertEqual(analytics["f2_disposition"], "deferred")
        self.assertEqual(analytics["f2_reason"], "policy-only")
        self.assertFalse(analytics["build_server_requirement"])
        self.assertEqual(analytics["build_server_reasons"], [])
        self.assertEqual(analytics["env_by_enforcement"]["build"], [])

    def test_the_two_axes_do_not_collapse_in_the_real_pool(self) -> None:
        deferred = [row for row in self.rows if row["f2_disposition"] == "deferred"]
        self.assertTrue(any(not row["build_server_requirement"] for row in deferred))
        self.assertTrue(any(row["build_server_requirement"] for row in deferred))


if __name__ == "__main__":
    unittest.main()
