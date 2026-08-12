"""UI-state guards for the Template (v0-mall) curator."""

from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from backoffice.pages import template_curator as page
from scripts.template_curator import catalog


def _render_curator_for_apptest() -> None:
    from pathlib import Path

    from backoffice.shared import build_backoffice_context
    from backoffice.pages import template_curator

    template_curator.render(build_backoffice_context(Path.cwd()))


def _record(
    template_id: str,
    *,
    title: str = "Demo",
    category: str = "landing-pages",
    archive_sha: str = "a" * 64,
    addendum_status: str = "missing",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=template_id,
        title=title,
        slug=template_id,
        category=category,
        archive_sha256=archive_sha,
        addendum_status=addendum_status,
        addendum_review_status=None,
        addendum_source_archive_sha256=None,
        addendum_extractor_sha256=None,
        structural_references=(),
    )


class CatalogUiHelpersTests(unittest.TestCase):
    def test_committed_snapshot_has_all_five_expected_populations(self) -> None:
        snapshot = catalog.load_catalog(Path.cwd())
        self.assertEqual(
            {scope.value: count for scope, count in snapshot.scope_counts.items()},
            {
                "blob": 313,
                "preview_fit": 278,
                "gallery": 278,
                "site_visible": 262,
                "variant_cited": 69,
            },
        )

    def test_search_matches_id_title_and_category_case_insensitively(self) -> None:
        rows = (
            _record("alpha", title="Nordic Shop", category="e-commerce"),
            _record("beta", title="Control Center", category="dashboards"),
        )
        self.assertEqual(
            [
                row.id
                for row in page._filter_catalog_records(
                    rows, category="Alla", query="SHOP"
                )
            ],
            ["alpha"],
        )
        self.assertEqual(
            [
                row.id
                for row in page._filter_catalog_records(
                    rows, category="Alla", query="dash"
                )
            ],
            ["beta"],
        )
        self.assertEqual(
            [
                row.id
                for row in page._filter_catalog_records(
                    rows, category="e-commerce", query="alpha"
                )
            ],
            ["alpha"],
        )

    def test_jsonable_serializes_nested_dataclasses_and_paths(self) -> None:
        from dataclasses import dataclass
        from pathlib import Path

        @dataclass(frozen=True)
        class Example:
            id: str
            path: Path

        self.assertEqual(
            page._jsonable(Example("a", Path("profiles/a.json"))),
            {"id": "a", "path": "profiles/a.json"},
        )


class ReportBindingTests(unittest.TestCase):
    def _snapshot(self, **overrides) -> SimpleNamespace:
        values = {
            "extractor_sha256": "e" * 64,
            "addenda_valid": True,
            "addenda_error": None,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_binding_preserves_selected_order(self) -> None:
        records = (_record("second"), _record("first", archive_sha="b" * 64))
        binding = page.build_report_binding(self._snapshot(), records)
        self.assertEqual(
            [item["id"] for item in binding["templates"]], ["second", "first"]
        )

    def test_binding_is_deterministic(self) -> None:
        snapshot = self._snapshot()
        records = (_record("one"), _record("two", archive_sha="b" * 64))
        self.assertEqual(
            page.build_report_binding(snapshot, records),
            page.build_report_binding(snapshot, records),
        )

    def test_reordering_selection_invalidates_report(self) -> None:
        snapshot = self._snapshot()
        first = _record("first")
        second = _record("second", archive_sha="b" * 64)
        original = page.build_report_binding(snapshot, (first, second))
        reordered = page.build_report_binding(snapshot, (second, first))
        self.assertFalse(page.report_is_fresh(original, reordered))

    def test_archive_sha_change_invalidates_report(self) -> None:
        snapshot = self._snapshot()
        original = page.build_report_binding(snapshot, (_record("one"),))
        changed = page.build_report_binding(
            snapshot, (_record("one", archive_sha="b" * 64),)
        )
        self.assertFalse(page.report_is_fresh(original, changed))

    def test_extractor_sha_change_invalidates_report(self) -> None:
        record = _record("one")
        original = page.build_report_binding(self._snapshot(), (record,))
        changed = page.build_report_binding(
            self._snapshot(extractor_sha256="f" * 64), (record,)
        )
        self.assertFalse(page.report_is_fresh(original, changed))

    def test_addendum_state_change_invalidates_report(self) -> None:
        snapshot = self._snapshot()
        original = page.build_report_binding(
            snapshot, (_record("one", addendum_status="missing"),)
        )
        changed = page.build_report_binding(
            snapshot, (_record("one", addendum_status="valid"),)
        )
        self.assertFalse(page.report_is_fresh(original, changed))

    def test_addenda_registry_validity_change_invalidates_report(self) -> None:
        record = _record("one")
        original = page.build_report_binding(self._snapshot(), (record,))
        changed = page.build_report_binding(
            self._snapshot(addenda_valid=False, addenda_error="invalid"), (record,)
        )
        self.assertFalse(page.report_is_fresh(original, changed))

    def test_matching_binding_is_fresh(self) -> None:
        current = page.build_report_binding(self._snapshot(), (_record("one"),))
        self.assertTrue(page.report_is_fresh(dict(current), current))
        self.assertFalse(page.report_is_fresh(None, current))

    def test_saved_runner_report_contains_the_same_full_binding(self) -> None:
        record = _record("one")
        snapshot = self._snapshot(
            by_id={"one": record},
            scope_counts={catalog.CatalogScope.BLOB: 1},
        )
        with (
            mock.patch(
                "scripts.template_curator.runner.curate_templates",
                return_value={"profiles": []},
            ),
            mock.patch(
                "scripts.template_curator.runner.write_report",
                return_value=Path("report.json"),
            ) as write_report,
        ):
            result = page._runner_result(
                Path.cwd(), snapshot, ("one",), scope_name="blob"
            )
        expected = page.build_report_binding(snapshot, (record,))
        self.assertEqual(result["reportBinding"], expected)
        saved = write_report.call_args.args[0]
        self.assertEqual(saved["reportBinding"], expected)


class CuratorAppTests(unittest.TestCase):
    def test_initial_render_is_network_free_and_requires_an_explicit_selection(
        self,
    ) -> None:
        from streamlit.testing.v1 import AppTest

        with mock.patch.object(page, "_runner_result") as runner:
            app = AppTest.from_function(_render_curator_for_apptest).run(timeout=10)
        runner.assert_not_called()
        self.assertEqual(list(app.exception), [])
        metrics = {metric.label: metric.value for metric in app.metric}
        self.assertEqual(metrics["Alla i Blob-manifestet"], "313")
        self.assertEqual(metrics["Ryms i preview"], "278")
        self.assertEqual(metrics["Finns i genererad gallerifil"], "278")
        self.assertEqual(metrics["Synliga på sajten"], "262")
        self.assertEqual(metrics["Citerade av varianter"], "69")
        self.assertEqual(len(app.multiselect), 1)
        analyze = next(
            button for button in app.button if button.label == "Analysera valda"
        )
        self.assertTrue(analyze.disabled)

    def test_variant_cited_population_offers_all_69_templates(self) -> None:
        from streamlit.testing.v1 import AppTest

        app = AppTest.from_function(_render_curator_for_apptest).run(timeout=10)
        population = next(
            selectbox for selectbox in app.selectbox if selectbox.label == "Population"
        )
        population.select("Citerade av varianter")
        app.run(timeout=10)
        self.assertEqual(list(app.exception), [])
        self.assertEqual(len(app.multiselect[0].options), 69)
        app.multiselect[0].select(app.multiselect[0].options[0])
        app.run(timeout=10)
        analyze = next(
            button for button in app.button if button.label == "Analysera valda"
        )
        self.assertFalse(analyze.disabled)


if __name__ == "__main__":
    unittest.main()
