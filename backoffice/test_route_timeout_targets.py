"""Drift-panelen för route `maxDuration` ska täcka exakt de mål som codegen
(`scripts/ai-models/route-timeout-targets.mjs`) äger. Tidigare saknade den
`engine/postchecks` och `v0/deployments/repair`."""

from __future__ import annotations

import unittest

from backoffice import REPO_ROOT
from backoffice.shared_lib.routes import (
    ROUTE_TIMEOUT_DISPLAY,
    read_route_maxduration_literals,
    read_route_timeout_targets,
)


class RouteTimeoutTargetsTests(unittest.TestCase):
    def test_targets_are_read_from_the_canonical_mjs(self) -> None:
        targets = read_route_timeout_targets(REPO_ROOT)
        self.assertIsNotNone(targets, "could not parse route-timeout-targets.mjs")
        rels = [rel for rel, _field in targets]
        self.assertIn("src/app/api/engine/postchecks/route.ts", rels)
        self.assertIn("src/app/api/v0/deployments/repair/route.ts", rels)

    def test_fallback_tuple_matches_the_canonical_list(self) -> None:
        self.assertEqual(read_route_timeout_targets(REPO_ROOT), ROUTE_TIMEOUT_DISPLAY)

    def test_every_target_has_exactly_one_literal(self) -> None:
        rows = read_route_maxduration_literals(REPO_ROOT)
        self.assertEqual(len(rows), len(ROUTE_TIMEOUT_DISPLAY))
        missing = [row["rel"] for row in rows if row["literal"] is None]
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
