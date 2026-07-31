"""Test för backoffice/observability_io.py + Prometheus-parsern.

Verifierar de fyra edge-cases som motiverade extraktionen:
  1. Saknad fil
  2. Tom fil
  3. Fil mindre än tail-fönstret (full read)
  4. Fil större än tail-fönstret (skip-första-raden för att undvika halv JSON)
  5. Rader som inte är JSON-objekt (icke-dict skippas)

Prometheus-parsern (``parse_prometheus_text`` / ``_parse_labels``) lever i
``backoffice/pages/observability.py`` — testerna ligger här eftersom P2-3
pekar ut luckan i just denna fil.

Långbänk-uppföljning 2026-04-24; Prometheus-täckning 2026-07-29 (P2-3).
"""

from __future__ import annotations

import json
import math
import tempfile
import unittest
from pathlib import Path

from backoffice.observability_io import load_tail_ndjson
from backoffice.pages import observability as obs


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


class ParseLabelsTests(unittest.TestCase):
    def test_empty_returns_empty(self) -> None:
        self.assertEqual(obs._parse_labels(""), {})

    def test_multiple_labels(self) -> None:
        self.assertEqual(
            obs._parse_labels('phase="autofix",le="100"'),
            {"phase": "autofix", "le": "100"},
        )

    def test_unescapes_quote_and_newline(self) -> None:
        self.assertEqual(
            obs._parse_labels(r'msg="say \"hi\"\nnext"'),
            {"msg": 'say "hi"\nnext'},
        )

    def test_unescapes_backslash(self) -> None:
        # Exposition ``path="C:\\tmp"`` → label value ``C:\tmp``.
        self.assertEqual(obs._parse_labels(r'path="C:\\tmp"'), {"path": "C:\\tmp"})

    def test_escaped_backslash_before_n_is_not_a_newline(self) -> None:
        """Ordningsregression: ``\\\\n`` är backslash + bokstaven n, inte nyrad.

        Kedjade ``replace``-anrop läste om sin egen utdata: ``\\\\n`` blev först
        ``\\n`` och sedan en riktig radbrytning. Ett litteralt ``\\n`` i datan
        tolkades alltså som nyrad.
        """
        self.assertEqual(
            obs._parse_labels(r'path="C:\\next"'),
            {"path": "C:\\next"},
        )
        self.assertNotIn("\n", obs._parse_labels(r'path="C:\\next"')["path"])

    def test_escaped_backslash_before_quote_escape(self) -> None:
        # ``\\\"`` = escaped backslash, then an escaped quote → ``\"``.
        self.assertEqual(obs._parse_labels(r'msg="a\\\"b"'), {"msg": 'a\\"b'})

    def test_undefined_escape_keeps_its_backslash(self) -> None:
        # The spec defines only \\, \" and \n — preserve anything else verbatim.
        self.assertEqual(obs._parse_labels(r'msg="a\tb"'), {"msg": "a\\tb"})


class ParsePrometheusTextTests(unittest.TestCase):
    def test_empty_and_comments_only(self) -> None:
        self.assertEqual(obs.parse_prometheus_text(""), {})
        self.assertEqual(
            obs.parse_prometheus_text("# HELP x desc\n# TYPE x counter\n\n"),
            {},
        )

    def test_unlabeled_sample(self) -> None:
        series = obs.parse_prometheus_text("sajtmaskin_up 1\n")
        self.assertEqual(list(series.keys()), ["sajtmaskin_up"])
        self.assertEqual(len(series["sajtmaskin_up"]), 1)
        sample = series["sajtmaskin_up"][0]
        self.assertEqual(sample.name, "sajtmaskin_up")
        self.assertEqual(sample.labels, {})
        self.assertEqual(sample.value, 1.0)

    def test_labeled_samples_grouped_by_name(self) -> None:
        text = "\n".join(
            [
                "# TYPE sajtmaskin_phase_duration_ms histogram",
                'sajtmaskin_phase_duration_ms_bucket{phase="autofix",le="50"} 3',
                'sajtmaskin_phase_duration_ms_bucket{phase="autofix",le="100"} 8',
                'sajtmaskin_phase_duration_ms_bucket{phase="autofix",le="+Inf"} 10',
                'sajtmaskin_phase_duration_ms_sum{phase="autofix"} 420',
                'sajtmaskin_phase_duration_ms_count{phase="autofix"} 10',
            ]
        )
        series = obs.parse_prometheus_text(text)
        buckets = series["sajtmaskin_phase_duration_ms_bucket"]
        self.assertEqual(len(buckets), 3)
        self.assertEqual(buckets[0].labels["phase"], "autofix")
        self.assertEqual(buckets[0].labels["le"], "50")
        self.assertEqual(buckets[0].value, 3.0)
        self.assertEqual(buckets[2].labels["le"], "+Inf")
        self.assertEqual(series["sajtmaskin_phase_duration_ms_count"][0].value, 10.0)

    def test_inf_nan_and_timestamp_ignored(self) -> None:
        text = "\n".join(
            [
                "a +Inf",
                "b -Inf",
                "c NaN",
                "d Inf",
                # Prometheus optional timestamp after value — parser ignores it.
                "e 12 1710000000",
            ]
        )
        series = obs.parse_prometheus_text(text)
        self.assertEqual(series["a"][0].value, float("inf"))
        self.assertEqual(series["b"][0].value, float("-inf"))
        self.assertTrue(math.isnan(series["c"][0].value))
        self.assertEqual(series["d"][0].value, float("inf"))
        self.assertEqual(series["e"][0].value, 12.0)

    def test_skips_lines_with_non_numeric_value(self) -> None:
        series = obs.parse_prometheus_text("bad notanumber\nok 1\n")
        self.assertNotIn("bad", series)
        self.assertEqual(series["ok"][0].value, 1.0)

    def test_whitespace_around_line_tolerated(self) -> None:
        series = obs.parse_prometheus_text('  foo{bar="x"}  2.5  \n')
        self.assertEqual(series["foo"][0].value, 2.5)
        self.assertEqual(series["foo"][0].labels, {"bar": "x"})


class BucketPercentileTests(unittest.TestCase):
    """Histogram-hjälpare som parsern matar — icke-trivial edge-logik."""

    def test_bucket_pairs_sorts_and_drops_missing_le(self) -> None:
        samples = [
            obs.Sample("m", {"le": "100"}, 5.0),
            obs.Sample("m", {"le": "10"}, 1.0),
            obs.Sample("m", {}, 99.0),  # no le → drop
            obs.Sample("m", {"le": "+Inf"}, 7.0),
            obs.Sample("m", {"le": "bad"}, 3.0),  # unparseable → drop
        ]
        pairs = obs._bucket_pairs(samples)
        self.assertEqual(pairs, [(10.0, 1.0), (100.0, 5.0), (float("inf"), 7.0)])

    def test_percentile_empty_or_zero_total(self) -> None:
        self.assertIsNone(obs._percentile_from_buckets([], 0.5))
        self.assertIsNone(obs._percentile_from_buckets([(10.0, 0.0)], 0.5))

    def test_percentile_interpolates_within_bucket(self) -> None:
        # cumulative: 10@10, 20@20 → p50 target=10 → lands at first bucket edge.
        pairs = [(10.0, 10.0), (20.0, 20.0), (float("inf"), 20.0)]
        self.assertEqual(obs._percentile_from_buckets(pairs, 0.50), 10.0)
        # p75 target=15 → halfway between 10 and 20.
        self.assertEqual(obs._percentile_from_buckets(pairs, 0.75), 15.0)

    def test_percentile_inf_bucket_falls_back_to_prev_finite(self) -> None:
        pairs = [(50.0, 5.0), (float("inf"), 10.0)]
        # target for p95 = 9.5 → needs Inf bucket → prev_le 50.
        self.assertEqual(obs._percentile_from_buckets(pairs, 0.95), 50.0)


if __name__ == "__main__":
    unittest.main()
