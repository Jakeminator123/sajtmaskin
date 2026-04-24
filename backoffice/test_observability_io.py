"""Test för backoffice/observability_io.py - load_tail_ndjson.

Verifierar de fyra edge-cases som motiverade extraktionen:
  1. Saknad fil
  2. Tom fil
  3. Fil mindre än tail-fönstret (full read)
  4. Fil större än tail-fönstret (skip-första-raden för att undvika halv JSON)
  5. Rader som inte är JSON-objekt (icke-dict skippas)

Långbänk-uppföljning 2026-04-24.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backoffice.observability_io import load_tail_ndjson


class LoadTailNdjsonTests(unittest.TestCase):
    def test_missing_file_returns_empty(self) -> None:
        self.assertEqual(load_tail_ndjson(Path("/no-such-file.ndjson")), [])

    def test_empty_file_returns_empty(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".ndjson", delete=False) as fh:
            tmp = Path(fh.name)
        try:
            self.assertEqual(load_tail_ndjson(tmp), [])
        finally:
            tmp.unlink()

    def test_small_file_full_read(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".ndjson", delete=False, mode="w") as fh:
            for i in range(5):
                fh.write(json.dumps({"i": i}) + "\n")
            tmp = Path(fh.name)
        try:
            result = load_tail_ndjson(tmp)
            self.assertEqual([r["i"] for r in result], [0, 1, 2, 3, 4])
        finally:
            tmp.unlink()

    def test_large_file_skips_first_potentially_broken_row(self) -> None:
        """När filen är större än tail_bytes ska första raden (som kan vara
        halv) skippas för att inte få tyst JSONDecodeError."""
        with tempfile.NamedTemporaryFile(suffix=".ndjson", delete=False, mode="w") as fh:
            # Skriv 1000 rader med padding så filen blir > 1KB
            for i in range(1000):
                fh.write(json.dumps({"i": i, "padding": "x" * 100}) + "\n")
            tmp = Path(fh.name)
        try:
            # Begränsa tail_bytes så vi tvingar truncated-läge
            result = load_tail_ndjson(tmp, max_rows=10, tail_bytes=2_000)
            # Vi får några rader (max 10), alla giltiga
            self.assertGreater(len(result), 0)
            self.assertLessEqual(len(result), 10)
            for r in result:
                self.assertIn("i", r)
                self.assertIn("padding", r)
            # Första rad-i ska INTE vara 0 (vi skippar början)
            self.assertGreater(result[0]["i"], 0)
        finally:
            tmp.unlink()

    def test_skips_non_dict_lines(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".ndjson", delete=False, mode="w") as fh:
            fh.write(json.dumps({"ok": True}) + "\n")
            fh.write(json.dumps([1, 2, 3]) + "\n")  # array — skippas
            fh.write(json.dumps("string") + "\n")  # string — skippas
            fh.write(json.dumps({"ok": False}) + "\n")
            tmp = Path(fh.name)
        try:
            result = load_tail_ndjson(tmp)
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]["ok"], True)
            self.assertEqual(result[1]["ok"], False)
        finally:
            tmp.unlink()

    def test_skips_invalid_json_lines(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".ndjson", delete=False, mode="w") as fh:
            fh.write(json.dumps({"a": 1}) + "\n")
            fh.write("this is not json\n")
            fh.write("{broken json\n")
            fh.write(json.dumps({"b": 2}) + "\n")
            tmp = Path(fh.name)
        try:
            result = load_tail_ndjson(tmp)
            self.assertEqual(len(result), 2)
            self.assertEqual(result[0]["a"], 1)
            self.assertEqual(result[1]["b"], 2)
        finally:
            tmp.unlink()

    def test_max_rows_truncates_tail(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".ndjson", delete=False, mode="w") as fh:
            for i in range(50):
                fh.write(json.dumps({"i": i}) + "\n")
            tmp = Path(fh.name)
        try:
            result = load_tail_ndjson(tmp, max_rows=5)
            # Sista 5 rader
            self.assertEqual([r["i"] for r in result], [45, 46, 47, 48, 49])
        finally:
            tmp.unlink()


if __name__ == "__main__":
    unittest.main()
