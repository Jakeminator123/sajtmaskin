"""Tester för samtidighetssidan: ren beräkning, hostläsning och rendering.

Ingen DB och ingen riktig preview-host: byggskriptet och hostanropet mockas,
och hostklienten testas mot en lokal HTTP-server.
"""

from __future__ import annotations

import json
import threading
import unittest
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

import pandas as pd

from backoffice import REPO_ROOT
from backoffice.concurrency import (
    HOUR_MS,
    LOCAL_TZ,
    MINUTE_MS,
    build_intervals,
    builds_per_local_day,
    concurrency_steps,
    local_day_bounds,
    max_per_bucket_from_samples,
    max_per_bucket_from_steps,
    to_local_naive,
    uniform_bounds,
)
from backoffice.pages import concurrency as page

T0 = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc).timestamp() * 1000


def _build(start_min: float, end_min: float, success: bool = True) -> dict:
    return {
        "endMs": T0 + end_min * MINUTE_MS,
        "durationMs": (end_min - start_min) * MINUTE_MS,
        "success": success,
    }


class IntervalTests(unittest.TestCase):
    def test_rows_without_duration_are_counted_not_placed(self) -> None:
        result = build_intervals(
            [
                _build(0, 5),
                {"endMs": T0, "durationMs": None, "success": True},
                {"endMs": T0, "durationMs": 0, "success": False},
            ]
        )
        self.assertEqual(result.intervals, [(T0, T0 + 5 * MINUTE_MS)])
        self.assertEqual(result.without_duration, 2)
        self.assertEqual(result.failed, 1)

    def test_overlap_counts_two_but_touching_builds_do_not(self) -> None:
        overlapping = concurrency_steps(build_intervals([_build(0, 10), _build(5, 15)]).intervals)
        self.assertEqual(max(level for _, level in overlapping), 2)
        touching = concurrency_steps(build_intervals([_build(0, 10), _build(10, 20)]).intervals)
        self.assertEqual(max(level for _, level in touching), 1)
        self.assertEqual(touching[-1][1], 0)

    def test_bucket_max_sees_short_spikes_and_carries_level(self) -> None:
        intervals = build_intervals(
            [_build(0, 30), _build(12, 13), _build(13.5, 14), _build(14.2, 14.4)]
        ).intervals
        steps = concurrency_steps(intervals)
        bounds = uniform_bounds(T0, T0 + 30 * MINUTE_MS, 10 * MINUTE_MS)
        # 0-10: ett bygge; 10-20: kort topp på två; 20-30: fortfarande bygget
        # som började i första hinken.
        self.assertEqual(max_per_bucket_from_steps(steps, bounds)[:3], [1, 2, 1])

    def test_step_exactly_on_a_bucket_edge_belongs_to_that_bucket(self) -> None:
        steps = concurrency_steps(build_intervals([_build(10, 20)]).intervals)
        bounds = uniform_bounds(T0, T0 + 30 * MINUTE_MS, 10 * MINUTE_MS)
        self.assertEqual(max_per_bucket_from_steps(steps, bounds)[:3], [0, 1, 0])


class SampleTests(unittest.TestCase):
    def test_empty_buckets_are_none_not_zero(self) -> None:
        bounds = uniform_bounds(T0, T0 + 3 * HOUR_MS, HOUR_MS)
        samples = [
            {"t": T0 + 1 * MINUTE_MS, "guests": 1},
            {"t": T0 + 30 * MINUTE_MS, "guests": 4},
            {"t": T0 + 2 * HOUR_MS, "guests": 0},
            {"t": T0 + 2 * HOUR_MS + MINUTE_MS, "guests": None},
        ]
        self.assertEqual(
            max_per_bucket_from_samples(samples, "guests", bounds)[:3], [4, None, 0]
        )


class LocalTimeTests(unittest.TestCase):
    def test_dst_end_day_is_25_hours(self) -> None:
        # Sommartiden slutar 2026-10-25 i Sverige.
        start = datetime(2026, 10, 25, 1, 0, tzinfo=timezone.utc).timestamp() * 1000
        days = local_day_bounds(start, start + HOUR_MS)
        self.assertEqual(days[0][0], date(2026, 10, 25))
        self.assertEqual(days[0][2] - days[0][1], 25 * HOUR_MS)

    def test_late_evening_utc_belongs_to_next_local_day(self) -> None:
        end = datetime(2026, 11, 10, 23, 30, tzinfo=timezone.utc).timestamp() * 1000
        self.assertEqual(builds_per_local_day([(end - MINUTE_MS, end)]), {date(2026, 11, 11): 1})
        self.assertEqual(to_local_naive(end), datetime(2026, 11, 11, 0, 30))


class DailyTableTests(unittest.TestCase):
    def test_threshold_marks_only_values_above_it(self) -> None:
        day_start = datetime(2026, 11, 10, 0, 0, tzinfo=LOCAL_TZ).timestamp() * 1000
        intervals = build_intervals(
            [
                {"endMs": day_start + 2 * HOUR_MS, "durationMs": HOUR_MS, "success": True}
                for _ in range(3)
            ]
        ).intervals
        steps = concurrency_steps(intervals)
        days = local_day_bounds(day_start, day_start + 2 * 24 * HOUR_MS - 1)
        samples = [{"t": day_start + 24 * HOUR_MS + MINUTE_MS, "guests": 5}]
        table = page.daily_table(days, steps, intervals, samples, "guests", 3, True)
        rows = {row["Dag"]: row for row in table.to_dict("records")}
        machine_col = "Max gästmaskiner igång (maskinläge)"
        self.assertEqual(rows["2026-11-10"]["Max samtidiga byggen"], 3)
        self.assertEqual(rows["2026-11-10"]["Klara byggen"], 3)
        self.assertEqual(rows["2026-11-10"]["Över tröskel"], "")
        self.assertTrue(pd.isna(rows["2026-11-10"][machine_col]))
        self.assertEqual(rows["2026-11-11"][machine_col], 5)
        self.assertEqual(rows["2026-11-11"]["Över tröskel"], "⚠ maskiner")
        lower = page.daily_table(days, steps, intervals, [], "guests", 2, True)
        by_day = {row["Dag"]: row for row in lower.to_dict("records")}
        self.assertEqual(by_day["2026-11-10"]["Över tröskel"], "⚠ byggen")


class _Handler(BaseHTTPRequestHandler):
    status = 200
    body: dict = {}
    seen_auth: list[str] = []

    def do_GET(self) -> None:  # noqa: N802
        type(self).seen_auth.append(self.headers.get("Authorization", ""))
        payload = json.dumps(type(self).body).encode()
        self.send_response(type(self).status)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args) -> None:
        return None


class HostClientTests(unittest.TestCase):
    def setUp(self) -> None:
        _Handler.seen_auth = []
        self.server = HTTPServer(("127.0.0.1", 0), _Handler)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def test_reads_samples_and_sends_bearer_key(self) -> None:
        _Handler.status = 200
        _Handler.body = {
            "ok": True,
            "isolation": {"mode": "machine", "configured": True},
            "intervalMs": 60000,
            "current": {"guests": 2},
            "samples": [{"t": T0, "guests": 2}],
            "writeErrors": 0,
            "lastError": None,
        }
        result = page._fetch_host_metrics(self.base, "secret-key-123", 24)
        self.assertTrue(result.ok)
        self.assertEqual(result.isolation_mode, "machine")
        self.assertEqual(result.samples, [{"t": T0, "guests": 2}])
        self.assertEqual(_Handler.seen_auth, ["Bearer secret-key-123"])

    def test_missing_endpoint_and_bad_key_are_explained_without_the_key(self) -> None:
        for status, needle in ((404, "deploya preview-host"), (401, "nekades")):
            _Handler.status = status
            _Handler.body = {"error": "x"}
            result = page._fetch_host_metrics(self.base, "secret-key-123", 24)
            self.assertFalse(result.ok)
            self.assertIn(needle, result.error or "")
            self.assertNotIn("secret-key-123", result.error or "")


def _render_for_test(repo_root: str) -> None:
    from pathlib import Path

    from backoffice.pages.concurrency import render
    from backoffice.shared import build_backoffice_context

    render(build_backoffice_context(Path(repo_root)))


class RenderTests(unittest.TestCase):
    def _run(self, builds, host, env):
        from streamlit.testing.v1 import AppTest

        with (
            mock.patch.object(page, "_cached_builds", return_value=builds),
            mock.patch.object(page, "_cached_host", return_value=host) as cached_host,
            mock.patch.dict("os.environ", env, clear=False),
        ):
            app = AppTest.from_function(_render_for_test, args=(str(REPO_ROOT),))
            app.run(timeout=30)
        return app, cached_host

    def test_renders_both_series_and_flags_peaks(self) -> None:
        now = T0 + 60 * MINUTE_MS
        builds = page.BuildPayload(
            ok=True,
            target="[DEV] fixture",
            now_ms=now,
            open_window_minutes=10,
            builds=[_build(0, 20) for _ in range(4)],
            open_starts=[{"startMs": now - MINUTE_MS, "event": "follow_up"}],
        )
        host = page.HostPayload(
            ok=True,
            host="preview.example.test",
            isolation_mode="machine",
            interval_ms=60000,
            current={"guests": 2, "runtimes": 2, "sessions": 3},
            samples=[{"t": T0 + 5 * MINUTE_MS, "guests": 2}],
        )
        app, _ = self._run(
            builds,
            host,
            {
                "SAJTMASKIN_PREVIEW_HOST_BASE_URL": "https://preview.example.test",
                "SAJTMASKIN_PREVIEW_HOST_API_KEY": "fixture-key",
            },
        )
        self.assertFalse(app.exception, app.exception)
        metrics = {m.label: m.value for m in app.metric}
        self.assertEqual(metrics["Byggen pågår nu (uppskattat)"], "1")
        self.assertEqual(metrics["Gästmaskiner igång (maskinläge)"], "2")
        captions = " ".join(c.value for c in app.caption)
        self.assertIn("topp 4", captions)
        self.assertNotIn("fixture-key", captions)
        table = app.dataframe[0].value
        self.assertIn("⚠ byggen", set(table["Över tröskel"]))

    def test_missing_host_config_still_shows_builds(self) -> None:
        builds = page.BuildPayload(ok=True, target="[DEV] fixture", now_ms=T0, builds=[])
        app, cached_host = self._run(
            builds,
            page.HostPayload(ok=True),
            {"SAJTMASKIN_PREVIEW_HOST_BASE_URL": "", "SAJTMASKIN_PREVIEW_HOST_API_KEY": ""},
        )
        self.assertFalse(app.exception, app.exception)
        cached_host.assert_not_called()
        infos = " ".join(i.value for i in app.info)
        self.assertIn("SAJTMASKIN_PREVIEW_HOST_BASE_URL", infos)


if __name__ == "__main__":
    unittest.main()
