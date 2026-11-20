"""Enhetstester för backoffice/pages/llm_flode_telemetry.py.

Fokus: degraderingssektionen läser ALLA `version.degraded.*` i timeline.ndjson.
Den hårdkodade listan missade `typecheck_advisory`, `lint_advisory` och
`stale_content_revision`, så RenderGate-advisory såg ut som "inga degraderingar".
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backoffice.pages import llm_flode_telemetry as lft


def _write_timeline(run_dir: Path, events: list[dict]) -> None:
    run_dir.mkdir(parents=True)
    lines = [
        json.dumps({"ts": "2026-11-05T02:23:00Z", "target": "in-progress", "slug": "s", "data": event})
        for event in events
    ]
    (run_dir / "timeline.ndjson").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


class DegradationCollectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.run_dir = Path(self._tmp.name) / "run-1"
        _write_timeline(
            self.run_dir,
            [
                {"type": "version.degraded.typecheck_advisory", "kind": "typecheck_advisory"},
                {"type": "version.degraded.lint_advisory", "kind": "lint_advisory"},
                {"type": "version.degraded.typecheck_advisory", "kind": "typecheck_advisory"},
                {"type": "version.degraded.verifier_skipped_by_policy", "kind": "verifier_skipped_by_policy"},
                {"type": "version.degraded.brand_new_kind"},
                {"type": "site.done"},
            ],
        )

    def test_prefix_collects_every_degraded_kind(self) -> None:
        events = lft._collect_events_by_type_prefix([self.run_dir], lft._DEGRADED_PREFIX)
        self.assertEqual(len(events), 5)

    def test_counts_keep_known_order_and_include_unknown_kinds(self) -> None:
        events = lft._collect_events_by_type_prefix([self.run_dir], lft._DEGRADED_PREFIX)
        self.assertEqual(
            list(lft._degradation_counts(events).items()),
            [
                ("verifier_skipped_by_policy", 1),
                ("typecheck_advisory", 2),
                ("lint_advisory", 1),
                ("brand_new_kind", 1),
            ],
        )

    def test_exact_type_collector_is_unchanged(self) -> None:
        events = lft._collect_events_by_type([self.run_dir], "site.done")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["_run"], "run-1")


if __name__ == "__main__":
    unittest.main()
