"""The Orchestration Map parses TS unions from fixed source paths and silently
skips a block whose file is missing. `build-spec.ts` became a directory and the
BuildSpec block disappeared without any error, so every path must exist."""

from __future__ import annotations

import unittest

from backoffice.pages.orchestration import _orch_ts_sources
from backoffice.shared_lib.context import build_backoffice_context


class OrchestrationSourcesTests(unittest.TestCase):
    def test_every_parsed_source_file_exists(self) -> None:
        sources = _orch_ts_sources(build_backoffice_context())
        missing = sorted(label for label, path in sources.items() if not path.is_file())
        self.assertEqual(missing, [], f"Orchestration Map points at missing files: {missing}")


if __name__ == "__main__":
    unittest.main()
