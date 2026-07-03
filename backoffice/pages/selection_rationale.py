# -*- coding: utf-8 -*-
"""Selection Rationale — read-only "varför valdes detta?"-lins (Backoffice 2.0 fas 4).

Den här vyn svarar på EN fråga för de senaste genereringarna: **varför** valdes
just den scaffolden / varianten / dossiern (och modellen/tiern)? Allt byggs av
EXISTERANDE trace-signaler — ingen ny runtime-kod, inga skrivningar, inga
hemligheter.

Två filbaserade källor (komplement, inte duplikat, av `LLM-flöde telemetri`):

  1. **Prompt-dump** `data/prompt-dumps/orchestration-dynamic/generation-input-package.json`
     (skrivs när ``SAJTMASKIN_PROMPT_DUMP=true``). Bär den RIKASTE
     selection-rationalen: hela ``scaffoldSelection``-metan
     (``selectionMethod``/``selectionConfidence``/``embeddingOverrideReason``/
     ``topCandidates``/``keywordScores``/``briefContextApplied`` m.fl. — se
     ``ScaffoldSelectionMeta`` i ``src/lib/gen/scaffolds/matcher.ts``), vald
     ``scaffoldId``/``variantId`` samt ``buildSpec`` (buildIntent/qualityTarget/
     changeScope/previewPolicy/contextPolicy/stylePack). Endast SENASTE körningen
     (filen skrivs över per generation).

  2. **Generationslogg** ``logs/generationslogg/<run>/`` (``meta.json`` +
     ``timeline.ndjson``, skrivs när ``GENERATIONSLOGG=true``). Bär per körning:
     ``modelId``, ``buildIntent``, ``buildMethod``, ``serverVerify.qualityTarget``,
     samt skannas för ``scaffoldId``/``resolvedTier`` och fil-tillgängliga
     drift-liknande events (``scaffold-retry.suggested``).

  3. **DB-telemetri** ``generation_telemetry.meta.selectedDossierIds`` via
     ``scripts/db/generation-history.mjs --json``. Dossier-valen persisteras i
     DB, inte i fil-loggarna.

VIKTIG SIGNAL-NOT (annars luras operatören): console-signalerna
``dossiers_selected`` / ``dossier_capability_unresolved`` och dossierns
``SelectedDossier.reason`` hamnar fortfarande inte i fil-loggarna. Vyn läser
de persisterade dossier-ID:na från DB när ``POSTGRES_URL`` finns och säger
tydligt när DB saknas.
(De gamla ``scaffold_drift`` / ``variant_drift``-signalerna togs bort som död
kod — brief-schemat producerade aldrig de nominerings-fält de byggde på.)

READ-ONLY by design: inga knappar som muterar, inga env-VÄRDEN läses/visas.
För full tidslinje per körning: se sidan ``LLM-flöde telemetri``.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.observability_io import load_tail_ndjson
from backoffice.shared import BackofficeContext, read_json, render_where_panel

PAGE_NAME = "Selection Rationale (read-only)"

_MAX_RUNS = 20
_MAX_ROWS_PER_RUN = 500
_DUMP_REL = "data/prompt-dumps/orchestration-dynamic/generation-input-package.json"
_HISTORY_SCRIPT_REL = "scripts/db/generation-history.mjs"
_DB_TIMEOUT_S = 60


# ---------------------------------------------------------------------------
# Data helpers (all read-only, all defensive)
# ---------------------------------------------------------------------------


def _iter_run_dirs(ctx: BackofficeContext) -> list[Path]:
    """De senaste N run-mapparna under logs/generationslogg/, ny→gammal."""
    log_dir = ctx.repo_root / "logs" / "generationslogg"
    if not log_dir.is_dir():
        return []
    dirs = sorted(
        [p for p in log_dir.iterdir() if p.is_dir() and not p.name.startswith("_")],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return dirs[:_MAX_RUNS]


def _read_run_meta(run_dir: Path) -> dict[str, Any]:
    """Läs meta.json från en run-mapp. Returnerar {} vid saknad/trasig fil."""
    meta_path = run_dir / "meta.json"
    if not meta_path.is_file():
        return {}
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _scan_timeline_signals(run_dir: Path) -> dict[str, Any]:
    """Skanna timeline.ndjson efter selection-relaterade fält som inte finns i
    meta.json: senaste ``scaffoldId``/``resolvedTier``/``serializeMode``/
    ``styleDirection`` samt fil-tillgängliga ``scaffold-retry.suggested``-events.

    Drift-/dossier-events finns INTE här (de är console.info) — vi letar inte
    efter dem och låtsas inte att de saknas av misstag.
    """
    entries = load_tail_ndjson(run_dir / "timeline.ndjson", max_rows=_MAX_ROWS_PER_RUN)
    scaffold_id: str | None = None
    resolved_tier: str | None = None
    serialize_mode: str | None = None
    style_direction: str | None = None
    model_id: str | None = None
    retries: list[dict[str, Any]] = []

    for entry in entries:
        data = entry.get("data", {})
        if not isinstance(data, dict):
            continue
        for key, setter in (
            ("scaffoldId", "scaffold_id"),
            ("resolvedTier", "resolved_tier"),
            ("serializeMode", "serialize_mode"),
            ("styleDirection", "style_direction"),
            ("modelId", "model_id"),
        ):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                if setter == "scaffold_id":
                    scaffold_id = val.strip()
                elif setter == "resolved_tier":
                    resolved_tier = val.strip()
                elif setter == "serialize_mode":
                    serialize_mode = val.strip()
                elif setter == "style_direction":
                    style_direction = val.strip()
                elif setter == "model_id":
                    model_id = val.strip()
        if data.get("type") == "scaffold-retry.suggested":
            retries.append(
                {
                    "ts": str(entry.get("ts", ""))[:19],
                    "from": data.get("currentScaffoldId") or "—",
                    "to": data.get("suggestedScaffoldId") or "—",
                    "failureType": data.get("failureType") or "—",
                    "confidence": data.get("confidence") or "—",
                }
            )

    return {
        "scaffoldId": scaffold_id,
        "resolvedTier": resolved_tier,
        "serializeMode": serialize_mode,
        "styleDirection": style_direction,
        "modelId": model_id,
        "scaffoldRetries": retries,
    }


def _load_orchestration_dump(repo_root: Path) -> dict[str, Any] | None:
    """Läs senaste ``generation-input-package.json`` (prompt-dump).

    Returnerar ``None`` när dumpen saknas/är oläsbar — den finns bara när
    ``SAJTMASKIN_PROMPT_DUMP=true`` satt under senaste generationen.
    """
    dump_path = repo_root / Path(_DUMP_REL)
    if not dump_path.is_file():
        return None
    try:
        payload = json.loads(dump_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    try:
        from datetime import datetime, timezone

        mtime = datetime.fromtimestamp(dump_path.stat().st_mtime, tz=timezone.utc)
        dumped_at = mtime.isoformat()
    except OSError:
        dumped_at = None
    return {"payload": payload, "dumpedAtUtc": dumped_at}


def _load_recent_generation_telemetry(repo_root: Path, limit: int = 100) -> dict[str, Any]:
    """Läs senaste generation_telemetry-rader via befintligt Node-script.

    Backoffice har ingen egen Postgres-driver; detta speglar Generation History
    och Scaffold Performance: read-only subprocess mot DB:n som `.env.local`
    pekar på. Returnerar alltid dict med antingen `rows` eller `error`.
    """
    script_path = repo_root / _HISTORY_SCRIPT_REL
    if not script_path.exists():
        return {"error": f"Script saknas: {script_path}"}
    try:
        result = subprocess.run(
            ["node", str(script_path), "--json", f"--limit={limit}"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_DB_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"error": f"Script timeout efter {_DB_TIMEOUT_S}s"}
    except FileNotFoundError:
        return {"error": "`node` saknas på PATH"}

    stdout = (result.stdout or "").strip()
    if not stdout:
        return {"error": (result.stderr or "Tomt svar från script").strip()}
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return {"error": f"Kunde inte tolka JSON från generation-history: {exc}"}
    return data if isinstance(data, dict) else {"error": "Oväntat DB-svarsformat."}


def _selected_dossier_ids(meta: Any) -> list[str]:
    if not isinstance(meta, dict):
        return []
    raw = meta.get("selectedDossierIds")
    if not isinstance(raw, list):
        return []
    return [str(item).strip() for item in raw if str(item).strip()]


def _txt(value: Any) -> str:
    if value is None:
        return "—"
    text = str(value).strip()
    return text if text else "—"


# ---------------------------------------------------------------------------
# Section renderers
# ---------------------------------------------------------------------------


def _render_scaffold_dump_panel(dump: dict[str, Any] | None) -> None:
    st.subheader("Scaffold-/variantval (senaste prompt-dump)")
    st.caption(
        "Den rikaste selection-rationalen. Läses från "
        f"`{_DUMP_REL}` — skrivs av `writeOrchestrationDynamicDump` "
        "(`src/lib/gen/orchestrate/generation-package.ts`) endast när "
        "`SAJTMASKIN_PROMPT_DUMP=true`. Visar bara SENASTE körningen (filen "
        "skrivs över per generation)."
    )
    if dump is None:
        st.info(
            "Ingen orchestration-prompt-dump hittades. Sätt "
            "`SAJTMASKIN_PROMPT_DUMP=true` i `.env.local` och kör en generation "
            "för att fylla denna vy. Kolumnstrukturen nedan visas ändå."
        )
        # Visa kolumnstrukturen även utan data så vyn är förutsägbar.
        st.markdown(
            "**Förväntade fält:** `scaffoldId` · `selectionMethod` "
            "(keyword/embedding/manual/persisted/default/off) · `selectionConfidence` · "
            "`embeddingOverrideReason` · `briefContextApplied` · `topCandidates` · "
            "`keywordScores` · `variantId` · `buildSpec` (buildIntent/qualityTarget/…)."
        )
        return

    payload = dump.get("payload") or {}
    selection = payload.get("scaffoldSelection") or {}
    if not isinstance(selection, dict):
        selection = {}
    build_spec = payload.get("buildSpec") or {}
    if not isinstance(build_spec, dict):
        build_spec = {}

    if dump.get("dumpedAtUtc"):
        st.caption(f"Dumpad: `{dump['dumpedAtUtc'][:19]}Z` · `lineageHash`: `{_txt(payload.get('lineageHash'))}`")

    c1, c2, c3 = st.columns(3)
    c1.metric("Vald scaffold", _txt(payload.get("scaffoldId") or selection.get("selectedScaffold")))
    c2.metric("selectionMethod", _txt(selection.get("selectionMethod")))
    c3.metric("selectionConfidence", _txt(selection.get("selectionConfidence")))

    c4, c5, c6 = st.columns(3)
    c4.metric("Vald variant", _txt(payload.get("variantId")))
    c5.metric("scaffoldMode", _txt(payload.get("scaffoldMode")))
    c6.metric("briefContextApplied", "ja" if selection.get("briefContextApplied") else "nej")

    # Override / semantic-fallback skäl (varför embedding/keyword vann eller föll).
    override_reason = selection.get("embeddingOverrideReason")
    semantic_unavailable = selection.get("semanticUnavailableReason")
    if override_reason or semantic_unavailable:
        if override_reason:
            st.markdown(f"**embeddingOverrideReason:** `{_txt(override_reason)}`")
        if semantic_unavailable:
            st.markdown(f"**semanticUnavailableReason:** `{_txt(semantic_unavailable)}`")
    embed_bits = []
    if "embeddingAvailable" in selection:
        embed_bits.append(f"embeddingAvailable={selection.get('embeddingAvailable')}")
    if "embeddingFailed" in selection:
        embed_bits.append(f"embeddingFailed={selection.get('embeddingFailed')}")
    embed_top = selection.get("embeddingTopResult")
    if isinstance(embed_top, dict) and embed_top.get("id"):
        embed_bits.append(f"embeddingTop={embed_top.get('id')} ({embed_top.get('score')})")
    if embed_bits:
        st.caption("Embedding: " + " · ".join(str(b) for b in embed_bits))

    # Topp-kandidater (varför just denna scaffold vann över de andra).
    candidates = selection.get("topCandidates")
    if isinstance(candidates, list) and candidates:
        rows = [
            {
                "id": c.get("id", "—"),
                "score": c.get("score", "—"),
                "source": c.get("source", "—"),
            }
            for c in candidates
            if isinstance(c, dict)
        ]
        if rows:
            st.markdown("**Topp-kandidater** (högst score vann)")
            st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)

    keyword_scores = selection.get("keywordScores")
    if isinstance(keyword_scores, dict) and keyword_scores:
        kw_rows = sorted(
            (
                {"scaffold": k, "keywordScore": v}
                for k, v in keyword_scores.items()
                if isinstance(v, (int, float))
            ),
            key=lambda r: -float(r["keywordScore"]),
        )[:15]
        if kw_rows:
            with st.expander("Keyword-scores (topp 15)", expanded=False):
                st.dataframe(pd.DataFrame(kw_rows), hide_index=True, use_container_width=True)

    # buildSpec → modell/tier-relaterad rationale (qualityTarget styr build-modell).
    if build_spec:
        st.markdown("**buildSpec** (intent/quality/policy som styr modell-tier och bygge)")
        bs_rows = [
            {"fält": key, "värde": _txt(build_spec.get(key))}
            for key in (
                "buildIntent",
                "generationMode",
                "changeScope",
                "qualityTarget",
                "previewPolicy",
                "verificationPolicy",
                "contextPolicy",
                "scaffoldId",
                "stylePack",
            )
            if key in build_spec
        ]
        if bs_rows:
            st.dataframe(pd.DataFrame(bs_rows), hide_index=True, use_container_width=True)


def _render_run_picker(ctx: BackofficeContext, run_dirs: list[Path]) -> None:
    st.subheader("Per körning: modell/tier + scaffold (generationslogg)")
    st.caption(
        "Läser `logs/generationslogg/<run>/meta.json` + `timeline.ndjson`. "
        "`modelId`/`buildIntent`/`buildMethod`/`qualityTarget` kommer från `meta.json`; "
        "`scaffoldId`/`resolvedTier` skannas ur timeline-events. (De gamla "
        "`scaffold_drift`/`variant_drift`-driftsignalerna är borttagna som död kod.)"
    )
    if not run_dirs:
        st.info(
            "Inga generationsloggar hittades — kör en generation för att fylla "
            "denna vy. Kräver `GENERATIONSLOGG=true` i `.env.local`."
        )
        return

    options = [p.name for p in run_dirs]
    picked = st.selectbox("Körning", options, key="selrat_run_pick")
    picked_dir = next((p for p in run_dirs if p.name == picked), run_dirs[0])

    meta = _read_run_meta(picked_dir)
    signals = _scan_timeline_signals(picked_dir)
    server_verify = meta.get("serverVerify") if isinstance(meta.get("serverVerify"), dict) else {}

    model_id = meta.get("modelId") or signals.get("modelId")

    c1, c2, c3 = st.columns(3)
    c1.metric("Modell", _txt(model_id))
    c2.metric("resolvedTier", _txt(signals.get("resolvedTier")))
    c3.metric("scaffoldId", _txt(signals.get("scaffoldId")))

    c4, c5, c6 = st.columns(3)
    c4.metric("buildIntent", _txt(meta.get("buildIntent")))
    c5.metric("buildMethod", _txt(meta.get("buildMethod")))
    c6.metric("qualityTarget", _txt((server_verify or {}).get("qualityTarget")))

    detail_rows = [
        {"fält": "status", "värde": _txt(meta.get("status"))},
        {"fält": "statusReason", "värde": _txt(meta.get("statusReason"))},
        {"fält": "generationKind", "värde": _txt(meta.get("generationKind"))},
        {"fält": "promptStrategy", "värde": _txt(meta.get("promptStrategy"))},
        {"fält": "promptType", "värde": _txt(meta.get("promptType"))},
        {"fält": "promptSource", "värde": _txt(meta.get("promptSource"))},
        {"fält": "serializeMode", "värde": _txt(signals.get("serializeMode"))},
        {"fält": "styleDirection", "värde": _txt(signals.get("styleDirection"))},
        {"fält": "chatId", "värde": _txt(meta.get("chatId"))},
        {"fält": "versionId", "värde": _txt(meta.get("versionId"))},
    ]
    with st.expander("Kontext för körningen", expanded=False):
        st.dataframe(pd.DataFrame(detail_rows), hide_index=True, use_container_width=True)

    retries = signals.get("scaffoldRetries") or []
    if retries:
        st.markdown("**Scaffold-retry-förslag** (`scaffold-retry.suggested` — drift-liknande, fil-tillgänglig)")
        st.dataframe(pd.DataFrame(retries), hide_index=True, use_container_width=True)
    else:
        st.caption("Inga `scaffold-retry.suggested`-events i denna körning.")


def _render_recent_runs_table(run_dirs: list[Path]) -> None:
    st.subheader("Kompakt översikt (senaste körningar)")
    if not run_dirs:
        st.info("Inga körningar att visa.")
        return
    rows = []
    for run_dir in run_dirs:
        meta = _read_run_meta(run_dir)
        signals = _scan_timeline_signals(run_dir)
        server_verify = meta.get("serverVerify") if isinstance(meta.get("serverVerify"), dict) else {}
        rows.append(
            {
                "Run": run_dir.name,
                "Status": _txt(meta.get("status")),
                "scaffoldId": _txt(signals.get("scaffoldId")),
                "Modell": _txt(meta.get("modelId") or signals.get("modelId")),
                "Tier": _txt(signals.get("resolvedTier")),
                "buildIntent": _txt(meta.get("buildIntent")),
                "buildMethod": _txt(meta.get("buildMethod")),
                "qualityTarget": _txt((server_verify or {}).get("qualityTarget")),
                "Retries": len(signals.get("scaffoldRetries") or []),
            }
        )
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)


def _render_dossier_note(ctx: BackofficeContext) -> None:
    st.subheader("Dossier-val (DB-telemetri, ej fil-loggar)")
    st.caption(
        "Dossier-ID:n persisteras i `generation_telemetry.meta.selectedDossierIds` "
        "av finalize-telemetrin. Console-eventen `[orchestrate] dossiers_selected` "
        "och `dossier_capability_unresolved` finns fortfarande bara i serverloggen; "
        "fil-loggarna (`logs/generationslogg`) bär inte dossier-rationalen."
    )
    payload = _load_recent_generation_telemetry(ctx.repo_root, limit=100)
    if payload.get("error"):
        st.info(
            "Kunde inte läsa DB-telemetri för dossier-val: "
            f"{payload['error']}. Sätt `POSTGRES_URL` i `.env.local` eller använd "
            "Generation History när DB är tillgänglig."
        )
        return

    rows = payload.get("rows") or []
    if not isinstance(rows, list) or not rows:
        st.info("Inga generation_telemetry-rader hittades i DB-fönstret.")
        return

    detail_rows = []
    counts: dict[str, int] = {}
    rows_with_dossiers = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        dossier_ids = _selected_dossier_ids(row.get("meta"))
        if not dossier_ids:
            continue
        rows_with_dossiers += 1
        for dossier_id in dossier_ids:
            counts[dossier_id] = counts.get(dossier_id, 0) + 1
        detail_rows.append(
            {
                "Tid": _txt(row.get("created_at"))[:19],
                "Projekt": _txt(row.get("project_name")),
                "Chatt": _txt(row.get("chat_title") or row.get("chat_id"))[:36],
                "Version": _txt(row.get("version_number")),
                "Stage": _txt(row.get("lifecycle_stage")),
                "Scaffold": _txt(row.get("scaffold_id")),
                "Dossiers": ", ".join(dossier_ids),
            }
        )

    col1, col2, col3 = st.columns(3)
    col1.metric("DB-rader lästa", len(rows))
    col2.metric("Rader med dossier-val", rows_with_dossiers)
    col3.metric("Unika dossiers", len(counts))

    if not detail_rows:
        st.info(
            "Inga `meta.selectedDossierIds` hittades i de senaste DB-raderna. "
            "Tomma dossier-listor skrivs medvetet inte till meta."
        )
        return

    st.markdown("**Dossier-användning (senaste DB-raderna)**")
    count_rows = [
        {"Dossier": dossier_id, "Antal": count}
        for dossier_id, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]
    st.dataframe(pd.DataFrame(count_rows), hide_index=True, use_container_width=True)

    st.markdown("**Senaste rader med dossier-val**")
    st.dataframe(pd.DataFrame(detail_rows[:100]), hide_index=True, use_container_width=True)


# ---------------------------------------------------------------------------
# Page entrypoint
# ---------------------------------------------------------------------------


def render(ctx: BackofficeContext) -> None:
    domain_map = (
        read_json(ctx.domain_map_json) if ctx.domain_map_json.is_file() else {"pages": {}}
    )
    st.header("Selection Rationale — varför valdes detta? (read-only)")
    render_where_panel(PAGE_NAME, domain_map)

    st.caption(
        "Fokuserad lins som svarar på **varför** en scaffold/variant/dossier "
        "(och modell/tier) valdes för de senaste genereringarna — byggd av "
        "EXISTERANDE trace-signaler. Vyn är **read-only**: inga värden/secrets "
        "läses eller visas, inga muterande knappar. För full tidslinje per "
        "körning, se sidan **LLM-flöde telemetri** (denna sida duplicerar inte "
        "den — den kompletterar)."
    )
    st.warning(
        "**Signal-not:** dossier-signalerna `dossiers_selected` / "
        "`dossier_capability_unresolved` emitteras som "
        "`console.info` (ej i fil-loggar), medan valda dossier-ID:n finns i "
        "`generation_telemetry.meta.selectedDossierIds` när DB är tillgänglig. "
        "Den rikaste fil-källan är "
        "prompt-dumpens `scaffoldSelection`-meta; per körning kompletterar "
        "generationsloggen med modell/tier/scaffold. Det som inte finns i fil "
        "visas som tom struktur, inte som krasch."
    )

    run_dirs = _iter_run_dirs(ctx)
    dump = _load_orchestration_dump(ctx.repo_root)

    with st.sidebar:
        st.markdown("### Datakällor (read-only)")
        st.code(
            "data/prompt-dumps/orchestration-dynamic/\n"
            "  generation-input-package.json\n"
            f"logs/generationslogg/ ({len(run_dirs)} körningar)",
            language="text",
        )
        st.caption(
            "Prompt-dump: " + ("hittad" if dump else "saknas (SAJTMASKIN_PROMPT_DUMP)")
        )

    st.divider()
    _render_scaffold_dump_panel(dump)

    st.divider()
    _render_run_picker(ctx, run_dirs)

    st.divider()
    _render_recent_runs_table(run_dirs)

    st.divider()
    _render_dossier_note(ctx)

    st.divider()
    st.caption(
        "Källor (read-only): scaffold-selection-meta `src/lib/gen/scaffolds/matcher.ts` "
        "(`ScaffoldSelectionMeta`) + orkestrering `src/lib/gen/orchestrate.ts` · "
        "dossier-val `src/lib/gen/dossiers/select.ts` · modell-trace "
        "`src/lib/models/trace.ts` · prompt-dump `src/lib/gen/orchestrate/generation-package.ts` · "
        "logg-skrivare `src/lib/logging/generation-log-writer.ts` · DB-läsning "
        "`scripts/db/generation-history.mjs`. "
        "Full tidslinje: sidan **LLM-flöde telemetri**. "
        "Signalkontrakt: `docs/schemas/orchestration-signal-contract.md`."
    )
