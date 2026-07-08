"""
Repair-loop hardening dashboard — Phase 2 + 3 of cloud-varldsklass.

Shows the (still-tunable) repair-loop feature state, error-log producer
status, and the last 20 prune / verifier-rerun telemetry events.

Source of truth: src/lib/config.ts FEATURES.{...}.

Phase 2A/2B/2C feature flags (consistentRepairPassIndex,
verifierRerunAfterFix, skipDoubleValidateAndFixOnMerge) were removed
from FEATURES on 2026-04-28 (LLM-flow simplification långbänk) — the
behaviour they gated is now unconditional code in verifier-phase.ts,
finalize-preflight.ts, and persist-side-effects.ts. The environment
toggles for those flags were already removed in omtag-04 (2026-04-23).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext


# Phases 2A–2C were inlined 2026-04-28 (no longer FEATURES entries);
# only the still-tunable phases are listed here. The history rows below
# stay so readers can map repair-loop telemetry back to the phase that
# produced it.
REPAIR_LOOP_INLINED_HISTORY = (
    (
        "Phase 2A — repairPassIndex propagation + pruneStaleVersionErrorLogs (SAJ-25)",
        "Stops stale diagnostics from keeping a clean follow-up red by propagating repairPassIndex into finalize and pruning earlier-pass error-log rows when the latest pass has no preflight/syntax blockers. Verifier-only findings stay on the latest pass but no longer keep older rows active. Inlined 2026-04-28 (was FEATURES.consistentRepairPassIndex).",
    ),
    (
        "Phase 2B — verifier re-run after RepairGate",
        "After RepairGate succeeds, re-run runVerifierPass once to confirm the fix actually addressed the Blocker finding. Capped at 1 re-run + 30s timeout. Inlined 2026-04-28 (was FEATURES.verifierRerunAfterFix).",
    ),
    (
        "Phase 2C — skip RepairGate escalation on merged-only syntax fail",
        "When stream-syntax already passed but merged-syntax fails, run only Normalize + esbuild revalidation. Saves a RepairGate call per follow-up. Inlined 2026-04-28 (was FEATURES.skipDoubleValidateAndFixOnMerge).",
    ),
)


REPAIR_LOOP_HARDCODED = (
    (
        "recurringPatternsInMainPrompt",
        "Phase 2D — recurring failures block in main system-prompt",
        "Inject `### Recurring failures on this site` into the system-prompt for follow-ups so the codegen LLM sees what it just got wrong.",
        "NODE_ENV == development",
    ),
    (
        "useErrorLogRag",
        "Phase 3 — vector RAG over error-log + auto-ingest",
        "Producer writes NDJSON, indexer rebuilds TF-IDF snapshot, retriever surfaces `### Lessons from similar past builds` in system-prompt. Auto-rebuilt at npm run dev|build|start.",
        'NODE_ENV != "test" (on in BOTH dev and prod, not dev-only)',
    ),
)


def _read_recent_devlog_lines(repo_root: Path, limit: int = 20) -> list[dict[str, Any]]:
    """Return the most recent dev-log JSON events relevant to repair-loop telemetry."""
    log_path = repo_root / "logs" / "sajtmaskin-local.log"
    if not log_path.exists():
        return []
    interesting_types = {
        "version_error_log_pruned",
        "version_error_log_pruned.error",
        "verifier_rerun_after_fix",
        "verifier_rerun_after_fix.error",
        "merged-syntax.mechanical-only.result",
    }
    events: list[dict[str, Any]] = []
    try:
        # Tail-load: walk the file from the end. For simplicity we read all
        # of it (dev-log is typically < 5 MB) and filter.
        with log_path.open("r", encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    obj = json.loads(raw)
                except Exception:
                    continue
                evt_type = obj.get("type") if isinstance(obj, dict) else None
                if evt_type in interesting_types:
                    events.append(obj)
    except Exception:
        return []
    return list(reversed(events[-limit:]))


def _read_error_log_meta(repo_root: Path) -> dict[str, Any] | None:
    meta_path = repo_root / "data" / "observability" / "error-log-tfidf-meta.json"
    if not meta_path.exists():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def render(ctx: BackofficeContext) -> None:
    st.header("Repair loop — hardcoded state + telemetri")
    st.caption(
        "Source of truth: `src/lib/config.ts` → `FEATURES`. "
        "Phases 2A/2B/2C inlinades 2026-04-28 — beteendet är ovillkorligt i "
        "`verifier-phase.ts`, `finalize-preflight.ts` och `persist-side-effects.ts`. "
        "För Phase 2D + Phase 3 (kvar i FEATURES): ändra konstanterna i `src/lib/config.ts`."
    )

    st.subheader("Inlined unconditional behaviour (post-2026-04-28)")
    for label, helptext in REPAIR_LOOP_INLINED_HISTORY:
        st.markdown(f"**{label}**")
        st.caption(helptext)
        st.code("// inlined — no FEATURES toggle", language="typescript")

    st.subheader("Tunable feature state")
    for feature_key, label, helptext, value in REPAIR_LOOP_HARDCODED:
        st.markdown(f"**{label}**")
        st.caption(helptext)
        st.code(f"FEATURES.{feature_key} = {value}", language="typescript")

    st.divider()
    st.subheader("Error-log RAG indexer (Phase 3.2)")
    meta = _read_error_log_meta(ctx.repo_root)
    if meta is None:
        st.info(
            "Ingen indexerings-meta hittad. Indexern körs vid `npm run dev|build|start` — "
            "om hooken inte hunnit köra ännu, kör manuellt:\n\n"
            "    npm run rag:error-log:reindex"
        )
    else:
        st.json(meta)

    st.divider()
    st.subheader("Senaste 20 repair-loop-telemetri-events")
    events = _read_recent_devlog_lines(ctx.repo_root, limit=20)
    if not events:
        st.caption(
            "Inga events hittade i `logs/sajtmaskin-local.log` än. "
            "Kör en generering med en flagga aktiverad och kom tillbaka."
        )
    else:
        st.dataframe(
            events,
            use_container_width=True,
            hide_index=True,
        )
