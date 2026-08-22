from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


def _load_selection_rationale():
    """Load the page without importing every Streamlit backoffice page."""
    sys.modules.setdefault("streamlit", types.ModuleType("streamlit"))
    shared = types.ModuleType("backoffice.shared")
    shared.BackofficeContext = object
    sys.modules.setdefault("backoffice.shared", shared)
    path = Path(__file__).parent / "pages" / "selection_rationale.py"
    spec = importlib.util.spec_from_file_location("selection_rationale_under_test", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load selection_rationale.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


selection_rationale = _load_selection_rationale()


class SelectionRationaleVariantTraceTest(unittest.TestCase):
    def test_reads_variant_authority_from_generation_timeline(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            entry = {
                "ts": "2026-08-22T10:00:00Z",
                "data": {
                    "type": "orchestration.styleDirection",
                    "styleDirection": "editorial-lux",
                    "variantSelection": {
                        "source": "brief-keyword",
                        "hintId": "corporate-grid",
                        "finalId": "editorial-lux",
                        "changedFromHint": True,
                    },
                    "explicitDesignAxes": ["style", "palette"],
                    "explicitDesignFields": ["palette.accent"],
                },
            }
            (run_dir / "timeline.ndjson").write_text(
                json.dumps(entry) + "\n",
                encoding="utf-8",
            )

            signals = selection_rationale._scan_timeline_signals(run_dir)

        self.assertEqual(signals["styleDirection"], "editorial-lux")
        self.assertEqual(signals["variantSelection"]["source"], "brief-keyword")
        self.assertTrue(signals["variantSelection"]["changedFromHint"])
        self.assertEqual(signals["explicitDesignAxes"], ["style", "palette"])
        self.assertEqual(signals["explicitDesignFields"], ["palette.accent"])

    def test_reads_persisted_variant_authority_from_telemetry_meta(self) -> None:
        authority = selection_rationale._variant_authority_from_meta(
            {
                "variantSelection": {
                    "source": "brief-embedding",
                    "hintId": "corporate-grid",
                    "finalId": "editorial-lux",
                    "changedFromHint": True,
                },
                "resolvedDesign": {
                    "explicitAxes": ["style", "typography"],
                    "explicitFields": ["typography.headings"],
                },
            }
        )

        self.assertIsNotNone(authority)
        self.assertEqual(authority["source"], "brief-embedding")
        self.assertEqual(authority["explicitDesignAxes"], ["style", "typography"])
        self.assertEqual(authority["explicitDesignFields"], ["typography.headings"])


if __name__ == "__main__":
    unittest.main()
