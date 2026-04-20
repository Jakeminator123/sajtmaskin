"""Observability — codegen pipeline metrics.

Reads the Prometheus exposition format from ``/api/metrics`` (see
``src/app/api/metrics/route.ts``) and renders the ``sajtmaskin_*`` series as
P50/P95 latencies, per-phase histogram summaries, and counter tables.

The page is intentionally read-only and uses ``urllib`` from stdlib so it does
not pull a new Streamlit dependency. Responses are cached for 15 seconds via
``st.cache_data`` so reruns do not hammer the metrics endpoint.
"""

from __future__ import annotations

import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext, resolve_metrics_endpoint


# Histogram buckets that the runtime emits (see
# ``src/lib/observability/metrics.ts``). Keep this list aligned with the
# 12 phases observed by ``observePhase``; if the runtime adds a phase, extend
# this tuple so the per-phase summary surfaces it.
OBSERVED_PHASES: tuple[str, ...] = (
    "url_expand",
    "autofix",
    "validate_syntax",
    "materialize_images",
    "verifier",
    "parse_merge_preflight",
    "partial_file_repair",
    "persist",
    "preview_session",
    "server_verify",
    "repair_loop",
    "quality_gate",
)

PROMPT_TO_DONE_KINDS: tuple[str, ...] = ("init", "followup")
METRICS_PATH = "/api/metrics"
REQUEST_TIMEOUT_SECONDS = 10.0


# ---------------------------------------------------------------------------
# Prometheus parser
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Sample:
    name: str
    labels: dict[str, str]
    value: float


_LABEL_RE = re.compile(r'([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"')


def _parse_labels(label_text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for match in _LABEL_RE.finditer(label_text):
        raw = match.group(2)
        # Prometheus exposition escapes \\, \" and \n; un-escape them.
        out[match.group(1)] = (
            raw.replace(r"\\", "\\").replace(r"\"", '"').replace(r"\n", "\n")
        )
    return out


def parse_prometheus_text(text: str) -> dict[str, list[Sample]]:
    """Parse Prometheus 0.0.4 exposition format into ``{metric_name: [Sample]}``.

    Comment lines (``# HELP`` / ``# TYPE``) and blank lines are skipped. The
    parser is intentionally minimal — it covers what ``prom-client`` emits for
    the metrics this page renders and ignores exemplars/timestamps.
    """

    series: dict[str, list[Sample]] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if "{" in line:
            name_end = line.index("{")
            name = line[:name_end].strip()
            label_close = line.rindex("}")
            label_text = line[name_end + 1 : label_close]
            rest = line[label_close + 1 :].strip()
            labels = _parse_labels(label_text)
        else:
            name, _, rest = line.partition(" ")
            name = name.strip()
            rest = rest.strip()
            labels = {}

        value_token = rest.split()[0] if rest else ""
        try:
            if value_token in ("+Inf", "Inf"):
                value = float("inf")
            elif value_token == "-Inf":
                value = float("-inf")
            elif value_token == "NaN":
                value = float("nan")
            else:
                value = float(value_token)
        except ValueError:
            continue

        series.setdefault(name, []).append(
            Sample(name=name, labels=labels, value=value)
        )

    return series


# ---------------------------------------------------------------------------
# HTTP fetch (cached)
# ---------------------------------------------------------------------------


@st.cache_data(ttl=15, show_spinner=False)
def _fetch_metrics(url: str, token: str) -> tuple[int, str]:
    """Returns ``(status_code, body)`` for the given URL + bearer token.

    Cached for 15 s. Network errors are flattened into a synthetic 599 so the
    UI layer can render a single error path. ``token`` is part of the cache
    key on purpose so rotating it forces a fresh fetch.
    """

    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "text/plain",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return exc.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 599, f"transport_error: {exc}"


# ---------------------------------------------------------------------------
# Histogram helpers
# ---------------------------------------------------------------------------


def _samples_by_name(series: dict[str, list[Sample]], name: str) -> list[Sample]:
    return series.get(name, [])


def _filter_labels(samples: list[Sample], **expected: str) -> list[Sample]:
    out: list[Sample] = []
    for sample in samples:
        if all(sample.labels.get(k) == v for k, v in expected.items()):
            out.append(sample)
    return out


def _bucket_pairs(samples: list[Sample]) -> list[tuple[float, float]]:
    """Returns ``[(le, cumulative_count), ...]`` sorted by ``le`` ascending.

    Bucket samples without an ``le`` label (shouldn't happen in valid
    exposition output) are dropped.
    """

    pairs: list[tuple[float, float]] = []
    for sample in samples:
        le_raw = sample.labels.get("le")
        if le_raw is None:
            continue
        try:
            le = float("inf") if le_raw in ("+Inf", "Inf") else float(le_raw)
        except ValueError:
            continue
        pairs.append((le, sample.value))
    pairs.sort(key=lambda item: item[0])
    return pairs


def _percentile_from_buckets(
    pairs: list[tuple[float, float]],
    percentile: float,
) -> float | None:
    """Linear-interpolation percentile estimate from cumulative bucket counts.

    Mirrors ``prometheus_client``'s ``histogram_quantile`` semantics for the
    common case (positive values, monotonically non-decreasing buckets).
    Returns ``None`` if the histogram is empty.
    """

    if not pairs:
        return None
    total = pairs[-1][1]
    if total <= 0:
        return None

    target = total * percentile
    prev_le = 0.0
    prev_count = 0.0
    for le, count in pairs:
        if count >= target:
            if le == float("inf"):
                # No upper bound — fall back to the last finite bucket edge.
                return prev_le if prev_le > 0 else None
            bucket_count = count - prev_count
            if bucket_count <= 0:
                return le
            fraction = (target - prev_count) / bucket_count
            lower = prev_le if prev_count > 0 else 0.0
            return lower + (le - lower) * fraction
        prev_le = le
        prev_count = count
    return pairs[-1][0]


def _phase_summary(
    series: dict[str, list[Sample]],
    phase: str,
) -> dict[str, Any]:
    bucket = _filter_labels(
        _samples_by_name(series, "sajtmaskin_phase_duration_ms_bucket"),
        phase=phase,
    )
    sum_samples = _filter_labels(
        _samples_by_name(series, "sajtmaskin_phase_duration_ms_sum"),
        phase=phase,
    )
    count_samples = _filter_labels(
        _samples_by_name(series, "sajtmaskin_phase_duration_ms_count"),
        phase=phase,
    )

    pairs = _bucket_pairs(bucket)
    total = count_samples[0].value if count_samples else 0.0
    summed = sum_samples[0].value if sum_samples else 0.0
    mean_ms = summed / total if total > 0 else None
    return {
        "phase": phase,
        "count": int(total),
        "mean_ms": mean_ms,
        "p50_ms": _percentile_from_buckets(pairs, 0.50),
        "p95_ms": _percentile_from_buckets(pairs, 0.95),
    }


def _prompt_to_done_percentile(
    series: dict[str, list[Sample]],
    kind: str,
    percentile: float,
) -> float | None:
    samples = _filter_labels(
        _samples_by_name(series, "sajtmaskin_prompt_to_done_ms_bucket"),
        kind=kind,
    )
    return _percentile_from_buckets(_bucket_pairs(samples), percentile)


# ---------------------------------------------------------------------------
# Counter table helpers
# ---------------------------------------------------------------------------


def _counter_dataframe(
    series: dict[str, list[Sample]],
    metric_name: str,
    label_columns: tuple[str, ...],
) -> pd.DataFrame:
    rows = []
    for sample in _samples_by_name(series, metric_name):
        row: dict[str, Any] = {col: sample.labels.get(col, "") for col in label_columns}
        row["value"] = int(sample.value) if sample.value.is_integer() else sample.value
        rows.append(row)
    if not rows:
        return pd.DataFrame(columns=[*label_columns, "value"])
    df = pd.DataFrame(rows)
    return df.sort_values("value", ascending=False, kind="mergesort").reset_index(
        drop=True
    )


def _format_ms(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 10_000:
        return f"{value / 1000:.1f} s"
    if value >= 1_000:
        return f"{value / 1000:.2f} s"
    return f"{value:.0f} ms"


# ---------------------------------------------------------------------------
# Page entrypoint
# ---------------------------------------------------------------------------


def render(ctx: BackofficeContext) -> None:
    del ctx  # ctx unused; metrics live on the runtime server, not on disk

    st.title("Observability — codegen pipeline metrics")
    st.caption(
        "Live snapshot of the `sajtmaskin_*` Prometheus series exposed by "
        "`/api/metrics`. Updates are cached for 15 seconds; press Refresh to "
        "force a fetch."
    )

    base_url, token = resolve_metrics_endpoint()
    metrics_url = f"{base_url}{METRICS_PATH}"

    with st.sidebar:
        st.markdown("### Metrics endpoint")
        st.code(metrics_url, language="text")
        st.caption(
            "Token source: `SAJTMASKIN_METRICS_TOKEN`. Override the base URL with "
            "`SAJTMASKIN_METRICS_BASE_URL` or `SAJTMASKIN_BASE_URL`."
        )

    status_cols = st.columns([3, 1])
    status_cols[0].markdown(f"**Endpoint:** `{metrics_url}`")
    status_cols[1].markdown(
        f"**Token:** {'set' if token else '_unset_'}"
    )

    if not token:
        st.warning(
            "SAJTMASKIN_METRICS_TOKEN not set — set it in `.env.local` to enable "
            "this page."
        )
        return

    if st.button("Refresh now", help="Clears the 15 s cache and refetches"):
        st.cache_data.clear()
        st.rerun()

    status, body = _fetch_metrics(metrics_url, token)

    if status == 503:
        st.warning(
            "Metrics route disabled (SAJTMASKIN_METRICS_TOKEN not set on the "
            "server)."
        )
        return
    if status == 401:
        st.error(
            "Token rejected — check that the local token matches the server "
            "token."
        )
        return
    if status == 599:
        st.error(f"Could not reach metrics endpoint: {body}")
        return
    if status != 200:
        st.error(f"Unexpected status {status} from `{metrics_url}`")
        with st.expander("Response body", expanded=False):
            st.code(body or "(empty)", language="text")
        return

    series = parse_prometheus_text(body)
    sajtmaskin_series = {
        name: samples for name, samples in series.items() if name.startswith("sajtmaskin_")
    }

    if not sajtmaskin_series:
        st.info(
            "Metrics endpoint reachable, but no `sajtmaskin_*` series have been "
            "emitted yet. Trigger a generation/preview run to populate them."
        )
        with st.expander("Raw response (truncated)", expanded=False):
            st.code(body[:4000], language="text")
        return

    # ------------------------------------------------------------------
    # Prompt-to-done P50/P95
    # ------------------------------------------------------------------

    st.subheader("Prompt-to-done latency")
    cards = st.columns(4)
    cards[0].metric(
        "P50 init",
        _format_ms(_prompt_to_done_percentile(sajtmaskin_series, "init", 0.50)),
    )
    cards[1].metric(
        "P95 init",
        _format_ms(_prompt_to_done_percentile(sajtmaskin_series, "init", 0.95)),
    )
    cards[2].metric(
        "P50 followup",
        _format_ms(_prompt_to_done_percentile(sajtmaskin_series, "followup", 0.50)),
    )
    cards[3].metric(
        "P95 followup",
        _format_ms(_prompt_to_done_percentile(sajtmaskin_series, "followup", 0.95)),
    )
    st.caption(
        "Estimated from `sajtmaskin_prompt_to_done_ms_bucket` via linear "
        "interpolation within the bucket containing the percentile."
    )

    # ------------------------------------------------------------------
    # Per-phase histogram summary
    # ------------------------------------------------------------------

    st.subheader("Per-phase duration summary")
    phase_rows = [_phase_summary(sajtmaskin_series, phase) for phase in OBSERVED_PHASES]
    phase_df = pd.DataFrame(
        [
            {
                "Phase": row["phase"],
                "Count": row["count"],
                "Mean": _format_ms(row["mean_ms"]),
                "P50": _format_ms(row["p50_ms"]),
                "P95": _format_ms(row["p95_ms"]),
            }
            for row in phase_rows
        ]
    )
    st.dataframe(phase_df, hide_index=True, width="stretch")

    if all(row["count"] == 0 for row in phase_rows):
        st.caption(
            "No phase observations yet — `observePhase()` writes here once the "
            "first generation completes."
        )

    # ------------------------------------------------------------------
    # Counter tables
    # ------------------------------------------------------------------

    st.subheader("Fixer calls")
    fixer_df = _counter_dataframe(
        sajtmaskin_series,
        "sajtmaskin_fixer_call_total",
        ("fixer", "outcome"),
    )
    if fixer_df.empty:
        st.caption("No fixer calls observed yet.")
    else:
        st.dataframe(fixer_df, hide_index=True, width="stretch")

    st.subheader("Verifier blocking findings")
    verifier_df = _counter_dataframe(
        sajtmaskin_series,
        "sajtmaskin_verifier_blocking_total",
        ("finding_id",),
    )
    if verifier_df.empty:
        st.caption("No blocking verifier findings observed yet.")
    else:
        st.dataframe(verifier_df, hide_index=True, width="stretch")

    st.subheader("Early-stop reasons")
    early_stop_df = _counter_dataframe(
        sajtmaskin_series,
        "sajtmaskin_early_stop_total",
        ("reason", "phase"),
    )
    if early_stop_df.empty:
        st.caption("No early-stop events observed yet.")
    else:
        st.dataframe(early_stop_df, hide_index=True, width="stretch")

    # ------------------------------------------------------------------
    # Partial-file repair outcomes
    # ------------------------------------------------------------------

    st.subheader("Partial-file repair outcomes")
    repair_samples = _samples_by_name(
        sajtmaskin_series, "sajtmaskin_partial_file_repair_total"
    )
    if not repair_samples:
        st.caption("No partial-file repair attempts observed yet.")
    else:
        outcome_totals: dict[str, float] = {}
        for sample in repair_samples:
            outcome = sample.labels.get("outcome", "unknown")
            outcome_totals[outcome] = outcome_totals.get(outcome, 0.0) + sample.value

        priority = ("success", "fail", "skip")
        ordered = [o for o in priority if o in outcome_totals] + [
            o for o in outcome_totals if o not in priority
        ]
        repair_cols = st.columns(max(len(ordered), 1))
        for col, outcome in zip(repair_cols, ordered, strict=False):
            value = outcome_totals[outcome]
            label = outcome.capitalize() if outcome else "Unknown"
            display = int(value) if float(value).is_integer() else value
            col.metric(label, display)

        st.bar_chart(
            pd.DataFrame(
                {"outcome": ordered, "value": [outcome_totals[o] for o in ordered]}
            ).set_index("outcome")
        )

    # ------------------------------------------------------------------
    # Raw exposition (debug)
    # ------------------------------------------------------------------

    with st.expander("Raw `sajtmaskin_*` series (debug)", expanded=False):
        debug_rows = []
        for name in sorted(sajtmaskin_series):
            for sample in sajtmaskin_series[name]:
                debug_rows.append(
                    {
                        "metric": name,
                        "labels": ", ".join(
                            f"{k}={v}" for k, v in sorted(sample.labels.items())
                        ),
                        "value": sample.value,
                    }
                )
        if debug_rows:
            st.dataframe(pd.DataFrame(debug_rows), hide_index=True, width="stretch")
        else:
            st.caption("No samples to display.")
