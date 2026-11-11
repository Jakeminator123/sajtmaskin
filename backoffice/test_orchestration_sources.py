"""The Orchestration Map parses TS unions from fixed source paths and silently
skips a block whose file is missing. `build-spec.ts` became a directory and the
BuildSpec block disappeared without any error, so every path must exist."""

from __future__ import annotations

import unittest

from backoffice.pages.orchestration import ORCH_UNION_SPECS, _orch_ts_sources, load_union_rows
from backoffice.shared_lib.context import build_backoffice_context


class OrchestrationSourcesTests(unittest.TestCase):
    def test_every_parsed_source_file_exists(self) -> None:
        sources = _orch_ts_sources(build_backoffice_context())
        missing = sorted(label for label, path in sources.items() if not path.is_file())
        self.assertEqual(missing, [], f"Orchestration Map points at missing files: {missing}")

    def test_every_union_type_parses_non_empty(self) -> None:
        """A renamed TS type must fail here, not vanish silently from the map."""
        sources = _orch_ts_sources(build_backoffice_context())
        rows = load_union_rows(sources)
        self.assertEqual(len(rows), len(ORCH_UNION_SPECS))
        broken = [
            row["type"]
            for row in rows
            if not row["values"] or row["values"][0] in ("(typ saknas)", "(fil saknas)")
        ]
        self.assertEqual(broken, [], f"Orchestration Map cannot parse: {broken}")

    def test_unparsable_type_is_shown_not_dropped(self) -> None:
        sources = _orch_ts_sources(build_backoffice_context())
        rows = load_union_rows({**sources, "BuildIntent / BuildMethod": sources["SerializeMode"]})
        by_type = {row["type"]: row["values"] for row in rows}
        self.assertEqual(by_type["BuildIntent"], ["(typ saknas)"])


if __name__ == "__main__":
    unittest.main()
