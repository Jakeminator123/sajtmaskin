"""
Repair-loop hardening dashboard — Phase 2 + 3 of cloud-varldsklass.

Shows the (now hardcoded) repair-loop feature state, error-log producer
status, and the last 20 prune / verifier-rerun telemetry events.

Source of truth: src/lib/config.ts FEATURES.{...}. The environment toggles
below were removed in omtag-04 (2026-04-23); change the constants in
config.ts to adjust behaviour.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext


REPAIR_LOOP_HARDCODED = (
    (
        "consistentRepairPassIndex",
        "Phase 2A — repairPassIndex propagation + pruneStaleVersionErrorLogs (SAJ-25)",
        "Stops the red 'Fel' badge on a clean follow-up by propagating repairPassIndex into finalize and pruning earlier-pass error-log rows when the latest pass is clean.",
        "true",
    ),
    (
        "verifierRerunAfterFix",
        "Phase 2B — verifier re-run after LLM-fixer",
        "After the verifier-fixer succeeds, re-run runVerifierPass once to confirm the fix actually addressed the blocking finding. Capped at 1 re-run + 30s timeout.",
        "true",
    ),
    (
        "skipDoubleValidateAndFixOnMerge",
        "Phase 2C — skip LLM-fixer escalation on merged-only syntax fail",
        "When stream-syntax already passed but merged-syntax fails, run only the deterministic mechanical autofix + esbuild revalidation. Saves an LLM-fixer call per follow-up.",
        "true",
    ),
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
        "NODE_ENV == development",
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
        "Flaggorna hårdkodades i omtag-04 (2026-04-23); ändra konstanterna "
        "i `src/lib/config.ts` för att justera beteendet."
    )

    st.subheader("Hardcoded feature state")
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
