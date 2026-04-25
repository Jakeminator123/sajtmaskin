# -*- coding: utf-8 -*-
"""LLM-flöde telemetri — aggregerade event-signaler från waves 1–7.

Läser ``logs/generationslogg/*/timeline.ndjson`` och aggregerar de nya
telemetri-events som introducerats i LLM-flöde-körplanen 2026-04-24:

  - ``llm_fixer_aborted``          (wave 1/5) — abort + duration + retry-signal
  - ``dossier_verbatim_restored``  (wave 6)   — säkerhetshygien: LLM korrumperade verbatim
  - ``llm_fixer_partial_response`` (wave 1/5) — excludedFiles per session
  - ``site.done`` → ``warmTscSkipped``        (wave 7)   — latency-vinst-mätning
  - ``site.done`` → ``f2TimeMs`` / ``f3TimeMs``           (wave 7)   — fas-uppdelad latens (TODO i källan)

Separat hantering (se respektive notering i sidans sektioner):
  - ``image_replaced_with_placeholder`` — skrivs via ``debugLog`` (console), ej i NDJSON.
    Kräver ``DEBUG=images`` + manuell logparsning.
  - ``dossier_stub_created`` — emitteras via ``engine_version_error_logs`` i DB
    under category ``merge:cross-file-stub``, ej som standalone devLog-event.

Alla värden är **observability** (signal), inte alarm. Sidan är read-only.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.observability_io import load_tail_ndjson
from backoffice.shared import BackofficeContext

_MAX_RUNS = 20
_MAX_ROWS_PER_RUN = 500


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------


def _iter_run_dirs(ctx: BackofficeContext) -> list[Path]:
    """Returnerar de senaste N run-mapparna under logs/generationslogg/, sorterade ny→gammal."""
    log_dir = ctx.repo_root / "logs" / "generationslogg"
    if not log_dir.is_dir():
        return []
    dirs = sorted(
        [p for p in log_dir.iterdir() if p.is_dir() and not p.name.startswith("_")],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return dirs[:_MAX_RUNS]


def _load_timeline_entries(run_dir: Path) -> list[dict[str, Any]]:
    """Ladda timeline.ndjson från en run-mapp. Returnerar raw stored-entries."""
    timeline = run_dir / "timeline.ndjson"
    return load_tail_ndjson(timeline, max_rows=_MAX_ROWS_PER_RUN)


def _collect_events_by_type(
    run_dirs: list[Path],
    event_type: str,
) -> list[dict[str, Any]]:
    """Aggregera alla entries med data.type == event_type över alla run-mappar."""
    results: list[dict[str, Any]] = []
    for run_dir in run_dirs:
        for entry in _load_timeline_entries(run_dir):
            data = entry.get("data", {})
            if isinstance(data, dict) and data.get("type") == event_type:
                enriched = dict(data)
                enriched["_ts"] = entry.get("ts", "")
                enriched["_run"] = run_dir.name
                enriched["_slug"] = entry.get("slug") or data.get("chatId", "")
                results.append(enriched)
    return results


def _collect_site_done(run_dirs: list[Path]) -> list[dict[str, Any]]:
    """Ladda site.done-events (inkl. warmTscSkipped + f2TimeMs/f3TimeMs)."""
    return _collect_events_by_type(run_dirs, "site.done")


def _rnum(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _fmt_ms(value: float | None) -> str:
    if value is None:
        return "—"
    if value >= 10_000:
        return f"{value / 1000:.1f} s"
    if value >= 1_000:
        return f"{value / 1000:.2f} s"
    return f"{value:.0f} ms"


def _pct(numerator: int, denominator: int) -> str:
    if denominator == 0:
        return "0 %"
    return f"{100 * numerator / denominator:.1f} %"


# ---------------------------------------------------------------------------
# Section renderers
# ---------------------------------------------------------------------------


def _render_llm_fixer_aborted(run_dirs: list[Path]) -> None:
    st.subheader("LLM Fixer — abort-events (`llm_fixer_aborted`)")
    st.caption(
        "Emitteras av `llm-fixer.ts` när ett `AbortError`/timeout inträffar under LLM-fix. "
        "Hög frekvens = fixer aborteras ofta p.g.a. timeout eller yttre avbrott."
    )
    events = _collect_events_by_type(run_dirs, "llm_fixer_aborted")
    if not events:
        st.info(
            "Inga `llm_fixer_aborted`-events hittade i de senaste körningarna. "
            "Events emitteras av `src/lib/gen/autofix/llm-fixer.ts` när `GENERATIONSLOGG=true`."
        )
        return

    col1, col2, col3 = st.columns(3)
    col1.metric("Totalt antal aborter", len(events))
    durations = [_rnum(e.get("durationMs")) for e in events if _rnum(e.get("durationMs")) is not None]
    if durations:
        avg_ms = sum(durations) / len(durations)
        col2.metric("Snitt duration", _fmt_ms(avg_ms))
        col3.metric("Max duration", _fmt_ms(max(durations)))

    rows = []
    for e in events:
        rows.append(
            {
                "Tid": e.get("_ts", "")[:19],
                "Run": e.get("_run", ""),
                "Slug / Chat": (e.get("_slug") or "")[:40],
                "durationMs": _fmt_ms(_rnum(e.get("durationMs"))),
                "errorsCount": e.get("errorsCount", "—"),
                "requiredFilesCount": e.get("requiredFilesCount", "—"),
            }
        )
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


def _render_dossier_verbatim_restored(run_dirs: list[Path]) -> None:
    st.subheader("Dossier verbatim-restore (`dossier_verbatim_restored`)")
    st.caption(
        "Emitteras av `verbatim-policy.ts` när LLM modifierade innehållet i en verbatim-fil "
        "och systemet tvingades återställa det. Signal: LLM ignorerade verbatim-kontraktet."
    )
    events = _collect_events_by_type(run_dirs, "dossier_verbatim_restored")
    if not events:
        st.info(
            "Inga `dossier_verbatim_restored`-events hittade. "
            "Emitteras av `src/lib/gen/dossiers/verbatim-policy.ts` när `GENERATIONSLOGG=true`."
        )
        return

    total_files = sum(
        e.get("count", 0) if isinstance(e.get("count"), int) else 0
        for e in events
    )
    col1, col2 = st.columns(2)
    col1.metric("Körningar med restore", len(events))
    col2.metric("Totalt återställda filer", total_files)

    rows = []
    for e in events:
        files_raw = e.get("files", [])
        dossier_ids = ", ".join(
            f.get("dossierId", "?")
            for f in (files_raw if isinstance(files_raw, list) else [])
        )
        reasons = ", ".join(
            f.get("reason", "?")
            for f in (files_raw if isinstance(files_raw, list) else [])
        )
        rows.append(
            {
                "Tid": e.get("_ts", "")[:19],
                "Run": e.get("_run", ""),
                "Chat": (e.get("chatId") or e.get("_slug") or "")[:36],
                "Antal filer": e.get("count", "—"),
                "Dossier-IDs": dossier_ids[:60] or "—",
                "Reasons": reasons[:80] or "—",
            }
        )
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


def _render_llm_fixer_partial_response(run_dirs: list[Path]) -> None:
    st.subheader("LLM Fixer — partiella svar (`llm_fixer_partial_response`)")
    st.caption(
        "Emitteras när LLM returnerade filer men en del var ofullständiga (truncated/noop). "
        "Hög `excludedFiles`-count = LLM genererade för många filer på en gång → shrink-signal."
    )
    events = _collect_events_by_type(run_dirs, "llm_fixer_partial_response")
    if not events:
        st.info(
            "Inga `llm_fixer_partial_response`-events hittade. "
            "Emitteras av `src/lib/gen/autofix/llm-fixer.ts` när `GENERATIONSLOGG=true`."
        )
        return

    total_excluded = 0
    for e in events:
        ef = e.get("excludedFiles", [])
        if isinstance(ef, list):
            total_excluded += len(ef)

    col1, col2 = st.columns(2)
    col1.metric("Körningar med partiellt svar", len(events))
    col2.metric("Totalt excludedFiles", total_excluded)

    rows = []
    for e in events:
        ef = e.get("excludedFiles", [])
        excluded_count = len(ef) if isinstance(ef, list) else 0
        attempted = e.get("totalFixedFilesAttempted", "—")
        rows.append(
            {
                "Tid": e.get("_ts", "")[:19],
                "Run": e.get("_run", ""),
                "excludedFiles": excluded_count,
                "totalFixedFilesAttempted": attempted,
            }
        )
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


def _render_warm_tsc_skipped(run_dirs: list[Path]) -> None:
    st.subheader("Warm-tsc hoppades över (`warmTscSkipped` i `site.done`)")
    st.caption(
        "Indikerar att tsc-valideringen hoppades över under validate-steget "
        "eftersom quality gate planerades köra det ändå. Skip-rate mäter latency-vinsten från wave 7."
    )
    events = _collect_site_done(run_dirs)
    if not events:
        st.info(
            "Inga `site.done`-events hittade. "
            "Emitteras av `generation-stream-post-finalize.ts` när `GENERATIONSLOGG=true`."
        )
        return

    skipped = [e for e in events if e.get("warmTscSkipped") is True]
    not_skipped = [e for e in events if e.get("warmTscSkipped") is False]
    total = len(events)

    col1, col2, col3 = st.columns(3)
    col1.metric("Totalt site.done", total)
    col2.metric("warmTscSkipped=true", len(skipped))
    col3.metric("Skip-rate", _pct(len(skipped), total))

    durations_skipped = [_rnum(e.get("durationMs")) for e in skipped if _rnum(e.get("durationMs")) is not None]
    durations_not = [_rnum(e.get("durationMs")) for e in not_skipped if _rnum(e.get("durationMs")) is not None]
    if durations_skipped or durations_not:
        st.markdown("**Genomsnittlig total durationMs per körnings-kategori**")
        diff_rows = []
        if durations_skipped:
            diff_rows.append(
                {"Kategori": "warmTscSkipped=true", "Snitt durationMs": _fmt_ms(sum(durations_skipped) / len(durations_skipped)), "Antal": len(durations_skipped)}
            )
        if durations_not:
            diff_rows.append(
                {"Kategori": "warmTscSkipped=false/null", "Snitt durationMs": _fmt_ms(sum(durations_not) / len(durations_not)), "Antal": len(durations_not)}
            )
        st.dataframe(pd.DataFrame(diff_rows), hide_index=True, use_container_width=True)


def _render_f2_f3_time(run_dirs: list[Path]) -> None:
    st.subheader("F2/F3-fasseparat latens (`f2TimeMs` / `f3TimeMs` i `site.done`)")
    st.caption(
        "Planerad fasuppdelning av total durationMs. "
        "**Obs:** `f2TimeMs` och `f3TimeMs` är null i källkoden idag — "
        "de är markerade som `TODO(F2/F3 telemetry split)` i `generation-stream-post-finalize.ts`. "
        "Sektionen visas när de börjar emitteras."
    )
    events = _collect_site_done(run_dirs)
    events_with_f2 = [e for e in events if _rnum(e.get("f2TimeMs")) is not None]
    events_with_f3 = [e for e in events if _rnum(e.get("f3TimeMs")) is not None]

    if not events_with_f2 and not events_with_f3:
        st.info(
            "`f2TimeMs` och `f3TimeMs` är ännu inte implementerade i källkoden "
            "(null i `site.done`-devLog). När de aktiveras visas P50/P95 här."
        )
        return

    f2_vals = [_rnum(e.get("f2TimeMs")) for e in events_with_f2]
    f3_vals = [_rnum(e.get("f3TimeMs")) for e in events_with_f3]

    col1, col2 = st.columns(2)
    if f2_vals:
        col1.metric("Snitt f2TimeMs", _fmt_ms(sum(f2_vals) / len(f2_vals)))  # type: ignore[arg-type]
    if f3_vals:
        col2.metric("Snitt f3TimeMs", _fmt_ms(sum(f3_vals) / len(f3_vals)))  # type: ignore[arg-type]


def _render_image_replaced(run_dirs: list[Path]) -> None:
    st.subheader("Bild ersatt med placeholder (`image_replaced_with_placeholder`)")
    st.caption(
        "**Loggas via `debugLog` (console), inte via `devLogAppend` → syns INTE i timeline.ndjson.** "
        "Kräver `DEBUG=images` i `.env.local` och manuell läsning av serverloggen. "
        "Schema: `docs/schemas/strict/image-replaced-with-placeholder.schema.json`."
    )
    st.info(
        "Sektionen kräver att `image_replaced_with_placeholder`-events porteras till "
        "`devLogAppend` i `src/lib/utils/image-validator.ts`. Tills dess: konsultera serverloggen."
    )
    _ = run_dirs  # används inte ännu


def _render_dossier_stubs(run_dirs: list[Path]) -> None:
    st.subheader("Cross-file stubs (`dossier_stub_created` / `crossFileStubs`)")
    st.caption(
        "Cross-file stubs emitteras via `engine_version_error_logs` i databasen "
        "under category `merge:cross-file-stub` — **inte** som standalone devLog-event. "
        "Schema: `docs/schemas/strict/dossier-stub-created.schema.json`. "
        "Backoffice-läsning kräver DB-fråga (se `Databashälsa`-sidan)."
    )
    # Om dossier_stub_created someday emitteras till devLog, läs det här:
    events = _collect_events_by_type(run_dirs, "dossier_stub_created")
    if events:
        st.success(f"{len(events)} `dossier_stub_created`-events hittade!")
        rows = []
        for e in events:
            rows.append(
                {
                    "Tid": e.get("_ts", "")[:19],
                    "Run": e.get("_run", ""),
                    "dossierId": e.get("dossierId", "—"),
                    "capability": e.get("capability", "—"),
                    "sourceFile": e.get("sourceFile", "—"),
                    "stubFile": e.get("stubFile", "—"),
                }
            )
        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
    else:
        st.info(
            "`dossier_stub_created` är ännu inte ett standalone devLog-event. "
            "Emitteras idag som `engine_version_error_logs`-warnings i DB. "
            "Konsultera `Databashälsa`-sidan för att se stub-varningar per version."
        )
    _ = run_dirs


# ---------------------------------------------------------------------------
# Page entrypoint
# ---------------------------------------------------------------------------


def render(ctx: BackofficeContext) -> None:
    st.header("LLM-flöde telemetri (waves 1–7)")
    st.caption(
        "Aggregerade observability-signaler från LLM-flöde-körplanens 7 waves (2026-04-24). "
        "Läser `logs/generationslogg/*/timeline.ndjson`. Kräver `GENERATIONSLOGG=true` i `.env.local`."
    )

    run_dirs = _iter_run_dirs(ctx)
    log_dir = ctx.repo_root / "logs" / "generationslogg"

    with st.sidebar:
        st.markdown("### Datakälla")
        st.code(f"logs/generationslogg/\n({len(run_dirs)} senaste körningar)", language="text")
        if not log_dir.is_dir():
            st.warning("`logs/generationslogg/` saknas — sätt `GENERATIONSLOGG=true`.")
        elif not run_dirs:
            st.warning("Inga körningar hittade i generationslogg-mappen.")
        else:
            st.caption(f"Senaste: `{run_dirs[0].name}`")

    if not log_dir.is_dir():
        st.warning(
            "`logs/generationslogg/` saknas. Sätt `GENERATIONSLOGG=true` i `.env.local` "
            "och kör en generate-session för att börja samla telemetri."
        )
        return

    if not run_dirs:
        st.info("Inga run-mappar hittade. Kör en generate-session först.")
        return

    st.info(
        f"Läser {len(run_dirs)} senaste körning(ar). "
        "Alla värden är aggregerade observability-signaler, inte alarm."
    )

    st.divider()
    _render_llm_fixer_aborted(run_dirs)

    st.divider()
    _render_dossier_verbatim_restored(run_dirs)

    st.divider()
    _render_llm_fixer_partial_response(run_dirs)

    st.divider()
    _render_warm_tsc_skipped(run_dirs)

    st.divider()
    _render_f2_f3_time(run_dirs)

    st.divider()
    _render_image_replaced(run_dirs)

    st.divider()
    _render_dossier_stubs(run_dirs)

    with st.expander("Om datakällan", expanded=False):
        st.markdown(
            """
**Var skrivs telemetrin?**

Events skrivs via `devLogAppend(target, {...})` i TypeScript-källan och hamnar i
`logs/generationslogg/<run>/timeline.ndjson` (en JSON-rad per entry). Kräver
`GENERATIONSLOGG=true` i `.env.local`.

**Format per rad:**
```json
{"ts": "ISO8601", "target": "in-progress|latest", "slug": "...", "summary": "...", "data": {"type": "event_type", ...}}
```

**Strict schemas:** `docs/schemas/strict/llm-fixer-aborted.schema.json` m.fl.

**Undantag:**
- `image_replaced_with_placeholder` → `debugLog` (console, ej NDJSON)
- `dossier_stub_created` → DB (`engine_version_error_logs` under `merge:cross-file-stub`)
"""
        )
