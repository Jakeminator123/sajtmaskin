# -*- coding: utf-8 -*-
"""LLM-flöde telemetri — aggregerade event-signaler från waves 1–7.

Läser ``logs/generationslogg/*/timeline.ndjson`` och aggregerar de nya
telemetri-events som introducerats i LLM-flöde-körplanen 2026-04-24:

  - ``llm_fixer_aborted``          (wave 1/5) — abort + duration + retry-signal
  - ``dossier_verbatim_restored``  (wave 6)   — säkerhetshygien: LLM korrumperade verbatim
  - ``llm_fixer_partial_response`` (wave 1/5) — excludedFiles per session
  - ``llm_repair_gate.deduped``     (fas 5)    — RepairGate ledger-dedupe av upprepat repairförsök
  - ``site.done`` → ``warmTscSkipped``        (wave 7)   — latency-vinst-mätning
  - ``site.done`` → ``warmTsc``/``warmEslint`` (P0 obs.) — körde vs tyst skip (cache_cold m.m.)
  - ``site.done`` → ``f2TimeMs`` / ``f3TimeMs``           (wave 7)   — fas-uppdelad latens (TODO i källan)
  - ``site.aborted``               (P0 2026-04-26) — stream-/transport-/provider-abort innan version
  - ``orchestration.simple_website_path`` (2026-04-29) — snabb init-lane enabled/reason

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
from backoffice.shared import BackofficeContext, load_latest_prompt_size_metrics

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
    st.subheader("RepairGate — abort-events (`llm_fixer_aborted`)")
    st.caption(
        "Emitteras av `llm-fixer.ts` (kod-legacy bakom RepairGate) när ett "
        "`AbortError`/timeout inträffar under LLM-repair. Hög frekvens = "
        "RepairGate aborteras ofta p.g.a. timeout eller yttre avbrott."
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


def _render_site_aborted(run_dirs: list[Path]) -> None:
    st.subheader("Stream-aborter (`site.aborted`)")
    st.caption(
        "Emitteras när en generation/repair-stream rivs **innan en version skapats** — "
        "transport-disconnect, provider-abort, stream_closed_without_done, eller staleness-inferred. "
        "Skiljer sig från `site.done` (lyckad finalize) och `site.failed` (verifier-rejected real content). "
        "Schema: `docs/schemas/strict/site-aborted.schema.json`."
    )
    events = _collect_events_by_type(run_dirs, "site.aborted")
    if not events:
        st.info(
            "Inga `site.aborted`-events hittade i de senaste körningarna. "
            "Emitteras av `stream-format.ts` + `prompt-to-done-stream.ts` + "
            "`generation-log-writer.resolveStatusDetails` (lazy staleness)."
        )
        return

    versionless = [e for e in events if not e.get("versionId")]
    has_version = [e for e in events if e.get("versionId")]
    elapsed = [_rnum(e.get("elapsedMs")) for e in events if _rnum(e.get("elapsedMs")) is not None]

    col1, col2, col3 = st.columns(3)
    col1.metric("Totalt aborts", len(events))
    col2.metric("Versionless (kan inte repairas)", len(versionless))
    col3.metric("Med version (repair-able)", len(has_version))

    if elapsed:
        col4, col5 = st.columns(2)
        col4.metric("Snitt elapsedMs", _fmt_ms(sum(elapsed) / len(elapsed)))  # type: ignore[arg-type]
        col5.metric("Max elapsedMs", _fmt_ms(max(elapsed)))

    reason_counts: dict[str, int] = {}
    for e in events:
        reason = str(e.get("reason", "unknown"))
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
    if reason_counts:
        st.markdown("**Fördelning per `reason`**")
        reason_rows = [
            {"Reason": r, "Antal": c, "Andel": _pct(c, len(events))}
            for r, c in sorted(reason_counts.items(), key=lambda x: -x[1])
        ]
        st.dataframe(pd.DataFrame(reason_rows), hide_index=True, use_container_width=True)

    rows = []
    for e in events:
        version_id = e.get("versionId")
        rows.append(
            {
                "Tid": e.get("_ts", "")[:19],
                "Run": e.get("_run", ""),
                "Chat": (e.get("chatId") or e.get("_slug") or "")[:36],
                "Reason": e.get("reason", "—"),
                "Kind": e.get("kind", "—"),
                "Versionless": "ja" if not version_id else "nej",
                "elapsedMs": _fmt_ms(_rnum(e.get("elapsedMs"))),
            }
        )
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)

    if versionless:
        st.warning(
            f"{len(versionless)} versionless-abort(er) — chatten saknar version och kan **inte** repairas. "
            "UI ska visa 'Starta om generation', inte 'Försök reparera preview'. "
            "Server-409 blockar `followup_general` mot dessa chats."
        )


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
    st.subheader("RepairGate — partiella svar (`llm_fixer_partial_response`)")
    st.caption(
        "Emitteras när RepairGate returnerade filer men en del var ofullständiga (truncated/noop). "
        "Hög `excludedFiles`-count = modellen genererade för många filer på en gång → shrink-signal."
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


def _render_llm_repair_gate_deduped(run_dirs: list[Path]) -> None:
    st.subheader("RepairGate — dedupe (`llm_repair_gate.deduped`)")
    st.caption(
        "Emitteras när `RepairLedger` stoppar ett upprepat RepairGate-försök "
        "med samma scope/contentHash/diagnosticFingerprint/requiredFiles. "
        "Schema: `docs/schemas/strict/llm-repair-gate-deduped.schema.json`."
    )
    events = _collect_events_by_type(run_dirs, "llm_repair_gate.deduped")
    if not events:
        st.info("Inga `llm_repair_gate.deduped`-events hittade i de senaste körningarna.")
        return

    col1, col2, col3 = st.columns(3)
    col1.metric("Dedupade repairförsök", len(events))
    phases = {str(e.get("phase", "unknown")) for e in events}
    scopes = {str(e.get("scopeId", "unknown")) for e in events}
    col2.metric("Phases", len(phases))
    col3.metric("Scopes", len(scopes))

    rows = []
    for event in events[:100]:
        rows.append(
            {
                "Tid": event.get("_ts", "")[:19],
                "Run": event.get("_run", ""),
                "Chat": (event.get("chatId") or event.get("_slug") or "")[:36],
                "Phase": event.get("phase", "—"),
                "Scope": event.get("scopeId", "—"),
                "Attempts": event.get("attempts", "—"),
                "Last outcome": event.get("lastOutcome", "—"),
                "Required files": ", ".join(event.get("requiredFiles") or []),
            }
        )
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


def _warm_pass_status(block: Any) -> str:
    """Klassificera ett warmTsc/warmEslint-block till en läsbar status."""
    if not isinstance(block, dict):
        return "saknas (äldre event)"
    if block.get("ran") is True:
        return "körde"
    skipped = block.get("skipped") or "okänd"
    if skipped == "cache_cold" and block.get("enabled") is True:
        return "skippad: cache_cold (FLAGGA PÅ — falsk trygghet!)"
    return f"skippad: {skipped}"


def _render_warm_pass_block(events: list[dict[str, Any]], key: str, title: str) -> None:
    """Aggregera ran/skipped-kategorier för ett warm-pass-fält i site.done."""
    st.markdown(f"**{title}**")
    counts: dict[str, int] = {}
    for event in events:
        status = _warm_pass_status(event.get(key))
        counts[status] = counts.get(status, 0) + 1
    rows = [
        {"Status": status, "Antal": count, "Andel": _pct(count, len(events))}
        for status, count in sorted(counts.items(), key=lambda kv: -kv[1])
    ]
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)

    flagged = [
        e for e in events
        if isinstance(e.get(key), dict)
        and e[key].get("enabled") is True
        and e[key].get("ran") is False
        and e[key].get("skipped") == "cache_cold"
    ]
    if flagged:
        scaffolds = sorted({str((e[key] or {}).get("scaffoldId") or "okänd") for e in flagged})
        st.warning(
            f"{len(flagged)} finalize(s) hade flaggan PÅ men kall warm-cache "
            f"(scaffolds: {', '.join(scaffolds)}). Passet skippades fail-open — "
            "kör `npm run provision:warm-cache` (se docs/howto/warm-cache-setup.md)."
        )


def _render_warm_passes(run_dirs: list[Path]) -> None:
    st.subheader("Pre-VM warm-pass status (`warmTsc` / `warmEslint` i `site.done`)")
    st.caption(
        "P0-observability: visar per finalize om warm-tsc/warm-eslint faktiskt KÖRDE, "
        "eller skippades — och varför (`cache_cold` = flagga på men cache oprovisionerad, "
        "`feature_flag_disabled` = medvetet av, `quality_gate_planned` = latensvinst wave 7). "
        "Källa: `buildWarmPassTelemetry` i `finalize-version/runner.ts`."
    )
    events = _collect_site_done(run_dirs)
    if not events:
        st.info(
            "Inga `site.done`-events hittade. "
            "Emitteras av `generation-stream-post-finalize.ts` när `GENERATIONSLOGG=true`."
        )
        return

    _render_warm_pass_block(events, "warmTsc", "Warm-tsc (pre-VM typecheck)")
    _render_warm_pass_block(events, "warmEslint", "Warm-eslint (pre-VM lint)")

    # Legacy wave-7-mätning: skip-rate för quality_gate_planned-optimeringen.
    skipped = [e for e in events if e.get("warmTscSkipped") is True]
    not_skipped = [e for e in events if e.get("warmTscSkipped") is False]
    total = len(events)

    st.markdown("**Wave 7 latensvinst (`warmTscSkipped`, legacy-fält)**")
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


def _render_prompt_size(ctx: BackofficeContext) -> None:
    st.subheader("Senaste prompt-storlek (`promptSize` i `generation-input-package.json`)")
    st.caption(
        "Aggregerade chars/tokens från senaste orchestration-dynamic prompt-dump. "
        "Visas när `SAJTMASKIN_PROMPT_DUMP=true` har skrivit "
        "`data/prompt-dumps/orchestration-dynamic/generation-input-package.json`. "
        "Källa: `prepareGenerationContext` → `buildPromptSizeMetrics`. "
        "Follow-ups kan kompaktera variant/toolkit/route-plan när BuildSpec finns, "
        "contextPolicy inte är heavy och ändringen inte är clear-redesign."
    )
    snapshot = load_latest_prompt_size_metrics(ctx.repo_root)
    if not snapshot:
        st.info(
            "Ingen `promptSize`-data hittad. Sätt `SAJTMASKIN_PROMPT_DUMP=true` i "
            "`.env.local` och kör en generation för att populera dump-filen."
        )
        return

    prompt_size = snapshot["promptSize"]
    total = prompt_size.get("total", {}) or {}
    static_core = prompt_size.get("staticCore", {}) or {}
    separator = prompt_size.get("separator", {}) or {}
    dynamic_context = prompt_size.get("dynamicContext", {}) or {}
    dynamic_budget = prompt_size.get("dynamicBudget", {}) or {}
    blocks = prompt_size.get("blocks", {}) or {}

    cap_meta = []
    if snapshot.get("scaffoldId"):
        cap_meta.append(f"scaffold `{snapshot['scaffoldId']}`")
    if snapshot.get("variantId"):
        cap_meta.append(f"variant `{snapshot['variantId']}`")
    if snapshot.get("dumpedAtUtc"):
        cap_meta.append(f"dumpedAt `{snapshot['dumpedAtUtc'][:19]}Z`")
    if cap_meta:
        st.caption("Kontext: " + " · ".join(cap_meta))

    col1, col2, col3 = st.columns(3)
    col1.metric(
        "Total prompt",
        f"{int(total.get('chars', 0)):,} chars",
        f"~{int(total.get('estimatedTokens', 0)):,} tokens",
    )
    col2.metric(
        "Static core",
        f"{int(static_core.get('chars', 0)):,} chars",
        f"~{int(static_core.get('estimatedTokens', 0)):,} tokens",
    )
    col3.metric(
        "Dynamic context",
        f"{int(dynamic_context.get('chars', 0)):,} chars",
        f"~{int(dynamic_context.get('estimatedTokens', 0)):,} tokens",
    )

    col4, col5, col6 = st.columns(3)
    col4.metric("Budget tokens", f"{int(dynamic_budget.get('budgetTokens', 0)):,}")
    col5.metric("Used tokens", f"{int(dynamic_budget.get('usedTokens', 0)):,}")
    col6.metric(
        "Dropped blocks",
        int(dynamic_budget.get("droppedBlocks", 0)),
        f"of {int(blocks.get('total', 0))}",
    )

    col7, col8, col9 = st.columns(3)
    col7.metric(
        "Separator",
        f"{int(separator.get('chars', 0)):,} chars",
        f"~{int(separator.get('estimatedTokens', 0)):,} tokens",
    )
    col8.metric("Kept blocks", int(dynamic_budget.get("keptBlocks", blocks.get("kept", 0) or 0)))
    col9.metric("All blocks", int(blocks.get("total", 0)))

    dropped_keys = dynamic_budget.get("droppedBlockKeys")
    if isinstance(dropped_keys, list) and dropped_keys:
        with st.expander("Droppade dynamic blocks", expanded=False):
            st.code("\n".join(str(key) for key in dropped_keys[:80]), language="text")

    with st.expander("Promptdump-kontext", expanded=False):
        st.markdown(f"- `lineageHash`: `{snapshot.get('lineageHash') or '—'}`")
        st.markdown(f"- `scaffoldId`: `{snapshot.get('scaffoldId') or '—'}`")
        st.markdown(f"- `variantId`: `{snapshot.get('variantId') or '—'}`")
        st.markdown(f"- `dumpPath`: `{snapshot.get('dumpPath', '?')}`")
        st.caption(
            "Full blocklista finns i `dynamicContextBlocks` i generation-input-package.json; "
            "Backoffice visar bara summering + största block för att undvika långsam UI-render."
        )

    largest = blocks.get("largest")
    if isinstance(largest, list) and largest:
        rows = []
        for entry in largest:
            if not isinstance(entry, dict):
                continue
            rows.append(
                {
                    "Block": entry.get("title") or entry.get("key") or "—",
                    "Chars": int(entry.get("chars", 0)),
                    "Tokens": int(entry.get("estimatedTokens", 0)),
                    "Priority": entry.get("priority", "—"),
                    "Required": "ja" if entry.get("required") else "nej",
                    "Kept": "ja" if entry.get("kept") else "nej",
                }
            )
        if rows:
            st.markdown("**Topp dynamic blocks (största först)**")
            st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)

    st.caption(f"Källfil: `{snapshot.get('dumpPath', '?')}`")


def _render_simple_website_path(run_dirs: list[Path]) -> None:
    st.subheader("Simple Website Path (`orchestration.simple_website_path`)")
    st.caption(
        "Konservativ init-lane som kan hoppa Server Auto-Brief, externa/UI Recipes "
        "och dossier selection för korta website/template-prompts utan heavy signals."
    )
    events = _collect_events_by_type(run_dirs, "orchestration.simple_website_path")
    if not events:
        st.info("Inga `orchestration.simple_website_path`-events hittade i de senaste körningarna.")
        return

    enabled = [e for e in events if e.get("enabled") is True]
    col1, col2, col3 = st.columns(3)
    col1.metric("Events", len(events))
    col2.metric("Enabled", len(enabled), _pct(len(enabled), len(events)))
    col3.metric("Disabled", len(events) - len(enabled))

    reason_counts: dict[str, int] = {}
    for event in events:
        reason = str(event.get("reason", "unknown"))
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
    st.dataframe(
        pd.DataFrame(
            [
                {"Reason": reason, "Antal": count, "Andel": _pct(count, len(events))}
                for reason, count in sorted(reason_counts.items(), key=lambda item: -item[1])
            ]
        ),
        hide_index=True,
        use_container_width=True,
    )

    rows = [
        {
            "Tid": event.get("_ts", "")[:19],
            "Run": event.get("_run", ""),
            "Enabled": "ja" if event.get("enabled") is True else "nej",
            "Reason": event.get("reason", "—"),
            "Scaffold": event.get("scaffoldId", "—"),
        }
        for event in events[:50]
    ]
    st.markdown("**Senaste events**")
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


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


def _render_degradations(run_dirs: list[Path]) -> None:
    st.subheader("Advisory / degradations (`version.degraded.*`)")
    st.caption(
        'Emitteras av `event-bus` när pipelinen lyckas men "ÅN ENDAST DEGRADERAT" '
        "— t.ex. server-verify hoppades p.g.a. policy, eller CapabilitySmoke "
        "(kod: F2 product-postcheck) "
        "fick aldrig en tillåten preview-URL. Speglas till devLog som "
        "`type: 'version.degraded.<kind>'` av `event-bus-subscribers.installDefaultSubscribers()`. "
        "Surfaces så att 'grön status' inte döljer att en kontroll aldrig kördes. "
        "Källa: `src/lib/logging/event-bus-types.ts` (`VersionDegradationKind`)."
    )

    kinds = [
        "verifier_skipped_safe_fixes_only",
        "verifier_skipped_by_policy",
        "product_postcheck_skipped",
        "product_postcheck_blocked",
    ]
    all_events: list[dict[str, Any]] = []
    for kind in kinds:
        all_events.extend(_collect_events_by_type(run_dirs, f"version.degraded.{kind}"))

    if not all_events:
        st.info(
            "Inga `version.degraded.*`-events hittade i de senaste körningarna. "
            "Antingen kördes alla quality-gates utan skip, eller så går NDJSON-mirror "
            "inte igenom (kontrollera `GENERATIONSLOGG=true`)."
        )
        return

    counts = {k: 0 for k in kinds}
    for ev in all_events:
        kind = ev.get("kind") or ev.get("type", "").removeprefix("version.degraded.")
        if kind in counts:
            counts[kind] += 1

    cols = st.columns(len(kinds))
    for col, kind in zip(cols, kinds):
        col.metric(kind, counts.get(kind, 0))

    rows = []
    for ev in all_events:
        rows.append(
            {
                "Tid": ev.get("_ts", "")[:19],
                "Run": ev.get("_run", ""),
                "Slug / Chat": (ev.get("_slug") or "")[:40],
                "kind": ev.get("kind") or ev.get("type", "").removeprefix("version.degraded."),
                "message": (ev.get("message") or "")[:80],
                "versionId": (ev.get("versionId") or "")[:12],
            }
        )
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


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
    _render_prompt_size(ctx)

    st.divider()
    _render_simple_website_path(run_dirs)

    st.divider()
    _render_site_aborted(run_dirs)

    st.divider()
    _render_llm_fixer_aborted(run_dirs)

    st.divider()
    _render_dossier_verbatim_restored(run_dirs)

    st.divider()
    _render_llm_fixer_partial_response(run_dirs)

    st.divider()
    _render_llm_repair_gate_deduped(run_dirs)

    st.divider()
    _render_warm_passes(run_dirs)

    st.divider()
    _render_f2_f3_time(run_dirs)

    st.divider()
    _render_image_replaced(run_dirs)

    st.divider()
    _render_dossier_stubs(run_dirs)

    st.divider()
    _render_degradations(run_dirs)

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

**Strict schemas:** `docs/schemas/strict/llm-fixer-aborted.schema.json`, `site-aborted.schema.json` m.fl.

**Undantag:**
- `image_replaced_with_placeholder` → `debugLog` (console, ej NDJSON)
- `dossier_stub_created` → DB (`engine_version_error_logs` under `merge:cross-file-stub`)
"""
        )
