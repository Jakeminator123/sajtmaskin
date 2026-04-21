"""Pipeline Health — kör underhållsskript och se status per skript.

Samlar de npm-skript som inte är automatiserade i dev-loopen (baseline-deps-
verifiering, embeddings-uppdatering, dossier-rebuild, shadcn-sync) på en plats
så man slipper komma ihåg terminalkommandon.

Status persisteras i `data/backoffice/pipeline-health-state.json` så panelen
överlever Streamlit-omstart och berättar när varje skript senast kördes och om
det lyckades.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import streamlit as st

from backoffice.shared import BackofficeContext


@dataclass(frozen=True)
class HealthScript:
    id: str
    label: str
    command: tuple[str, ...]
    description: str
    cost: str
    requires_api: bool
    tags: tuple[str, ...] = field(default_factory=tuple)
    # Freshness-detection: när källfiler är nyare än output_path räknas skriptet
    # som "STALE" och kan auto-fixas via "Fixa stale"-knappen. Båda måste vara
    # angivna för att checken ska aktiveras.
    output_path: str | None = None
    source_globs: tuple[str, ...] = field(default_factory=tuple)


# Underhållsskript som inte ingår i `npm run dev`-flödet och därför lätt glöms.
SCRIPTS: tuple[HealthScript, ...] = (
    HealthScript(
        id="baseline-deps-verify",
        label="Baseline deps · verifiera npm-registry",
        command=("npm", "run", "baseline-deps:verify"),
        description=(
            "Kollar att alla pin i scaffold-baseline (`src/lib/gen/export/project-scaffold.ts` "
            "PACKAGE_JSON) faktiskt finns på npm-registry. Fångar phantom-versioner."
        ),
        cost="fast",
        requires_api=False,
        tags=("deps",),
    ),
    HealthScript(
        id="baseline-deps-tree",
        label="Baseline deps · peer-tree",
        command=("npm", "run", "baseline-deps:tree"),
        description="Validerar peer-dependency-trädet för scaffold-baseline.",
        cost="fast",
        requires_api=False,
        tags=("deps",),
    ),
    HealthScript(
        id="shadcn-sync",
        label="shadcn · sync mot registry",
        command=("npm", "run", "shadcn:sync"),
        description=(
            "Synkar mot shadcn-registry (HTTP). Säkerställer att speglade komponenter "
            "matchar uppströms versioner."
        ),
        cost="medium",
        requires_api=False,
        tags=("ui",),
    ),
    HealthScript(
        id="scaffolds-variant-embeddings",
        label="Scaffolds · variant-embeddings",
        command=("npm", "run", "scaffolds:variant-embeddings"),
        description=(
            "Genererar embeddings för scaffold-varianter via OpenAI. "
            "Kör efter att variant-prompts/patterns ändrats."
        ),
        cost="expensive",
        requires_api=True,
        tags=("embeddings",),
        output_path="config/scaffold-variants/_index/variant-embeddings.json",
        source_globs=("config/scaffold-variants/*/*.json",),
    ),
    HealthScript(
        id="dossiers-embeddings",
        label="Dossiers · embeddings",
        command=("npm", "run", "dossiers:embeddings"),
        description=(
            "Genererar dossier-embeddings via OpenAI. Behövs efter att nya dossiers "
            "tagits in eller efter dossier-rebuild."
        ),
        cost="expensive",
        requires_api=True,
        tags=("embeddings", "dossiers"),
        output_path="data/dossiers/_index/dossier-embeddings.json",
        source_globs=("data/dossiers/_index/master.json",),
    ),
    HealthScript(
        id="templates-embeddings",
        label="Templates · embeddings",
        command=("npm", "run", "templates:embeddings"),
        description="Genererar template-embeddings via OpenAI.",
        cost="expensive",
        requires_api=True,
        tags=("embeddings", "templates"),
    ),
    # Dossier v2 (2026-04-20): no rebuild/full-pipeline scripts. The runtime
    # walks data/dossiers/{hard,soft}/ directly. To curate a new dossier from
    # a template-references repo, use the Dossiers page (AI-kuration tab) or
    # `npm run dossiers:curate -- --reference=<id> --class=<hard|soft> --id=<new-id>`.
)


# Hård övre gräns per körning så Streamlit inte hänger sig oändligt.
_DEFAULT_TIMEOUT_S = 30 * 60

_STATE_FILE_REL = Path("data") / "backoffice" / "pipeline-health-state.json"

_COST_LABELS = {
    "fast": "snabb",
    "medium": "medel",
    "expensive": "dyr",
}


def _state_path(ctx: BackofficeContext) -> Path:
    return ctx.repo_root / _STATE_FILE_REL


def _load_state(ctx: BackofficeContext) -> dict[str, Any]:
    p = _state_path(ctx)
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_state(ctx: BackofficeContext, state: dict[str, Any]) -> None:
    p = _state_path(ctx)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _resolve_command(command: tuple[str, ...]) -> list[str]:
    """Resolva första argumentet via PATH (PATHEXT på Windows).

    Utan detta kraschar `subprocess.run([...npm...], shell=False)` på Windows
    med FileNotFoundError eftersom `npm` är en `.cmd`-shim. `shutil.which`
    respekterar PATHEXT och hittar `npm.cmd`/`npm.exe` automatiskt.
    Faller tillbaka till originalkommandot om PATH-lookup misslyckas så
    felet ändå rapporteras (snarare än att vi tyst byter binär).
    """
    if not command:
        return []
    resolved = shutil.which(command[0])
    if not resolved:
        return list(command)
    return [resolved, *command[1:]]


def _run_script(ctx: BackofficeContext, script: HealthScript) -> dict[str, Any]:
    started_iso = datetime.now(timezone.utc).isoformat()
    started = time.time()
    stdout = ""
    stderr = ""
    exit_code: int = -99
    try:
        proc = subprocess.run(
            _resolve_command(script.command),
            cwd=str(ctx.repo_root),
            capture_output=True,
            text=True,
            timeout=_DEFAULT_TIMEOUT_S,
            check=False,
            shell=False,
        )
        exit_code = proc.returncode
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
    except subprocess.TimeoutExpired as exc:
        exit_code = -1
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = (
            (exc.stderr if isinstance(exc.stderr, str) else "")
            + f"\n[backoffice] Timed out after {_DEFAULT_TIMEOUT_S}s"
        )
    except FileNotFoundError as exc:
        exit_code = -2
        stderr = f"Saknar binär ({script.command[0]}): {exc}"
    except Exception as exc:  # pragma: no cover - defensive UI helper
        exit_code = -3
        stderr = f"Oväntat fel: {exc}"

    elapsed = time.time() - started
    return {
        "scriptId": script.id,
        "command": " ".join(script.command),
        "exitCode": int(exit_code),
        "elapsedSec": round(elapsed, 2),
        "startedAt": started_iso,
        "finishedAt": datetime.now(timezone.utc).isoformat(),
        "stdoutTail": stdout[-4000:],
        "stderrTail": stderr[-4000:],
    }


def _status_text(result: dict[str, Any] | None) -> str:
    if result is None:
        return "—"
    code = result.get("exitCode")
    if code == 0:
        return "OK"
    if code in (-1,):
        return "TIMEOUT"
    if code in (-2,):
        return "MISSING-BIN"
    return "FAIL"


@dataclass(frozen=True)
class StaleInfo:
    is_stale: bool
    output_exists: bool
    output_mtime: float | None
    newest_source_path: str | None
    newest_source_mtime: float | None
    sources_checked: int

    @property
    def reason(self) -> str:
        if not self.output_exists:
            return "Output-fil saknas — har aldrig genererats."
        if self.is_stale and self.newest_source_path:
            from datetime import datetime as _dt, timezone as _tz

            def _fmt(ts: float | None) -> str:
                if ts is None:
                    return "?"
                return _dt.fromtimestamp(ts, tz=_tz.utc).isoformat(timespec="seconds")

            return (
                f"`{self.newest_source_path}` ({_fmt(self.newest_source_mtime)}) "
                f"är nyare än output ({_fmt(self.output_mtime)})."
            )
        return ""


def _collect_known_output_paths(ctx: BackofficeContext) -> set[Path]:
    """Resolverade absolut-paths för alla scripts output_path.

    Används för att exkludera *andra scripts* output från source-globs så vi
    inte jämför en pipeline-fil mot derivat av sig själv (t.ex. embeddings
    som plockar upp en sibling `_index/`-fil). Vi exkluderar dock INTE syskon
    i samma mapp som inte är registrerade outputs — det skulle felaktigt
    göra checken tyst för scripts vars källor lever i samma mapp som deras
    output (se `dossiers-embeddings` med `master.json` i `_index/`).
    """
    out: set[Path] = set()
    for s in SCRIPTS:
        if not s.output_path:
            continue
        try:
            out.add((ctx.repo_root / s.output_path).resolve())
        except OSError:
            continue
    return out


def _check_staleness(ctx: BackofficeContext, script: HealthScript) -> StaleInfo | None:
    """Returnerar None när skriptet inte deklarerat output_path + source_globs."""
    if not script.output_path or not script.source_globs:
        return None
    output_abs = (ctx.repo_root / script.output_path).resolve()
    output_mtime = output_abs.stat().st_mtime if output_abs.is_file() else None
    known_outputs = _collect_known_output_paths(ctx)

    newest_path: str | None = None
    newest_mtime: float | None = None
    sources_checked = 0
    for pattern in script.source_globs:
        for match in ctx.repo_root.glob(pattern):
            if not match.is_file():
                continue
            try:
                resolved = match.resolve()
            except OSError:
                continue
            if resolved == output_abs:
                continue
            if resolved in known_outputs:
                continue
            sources_checked += 1
            mtime = resolved.stat().st_mtime
            if newest_mtime is None or mtime > newest_mtime:
                newest_mtime = mtime
                newest_path = str(resolved.relative_to(ctx.repo_root)).replace("\\", "/")

    if output_mtime is None:
        # Output saknas helt → räknas som stale så fort minst en källa finns.
        return StaleInfo(
            is_stale=sources_checked > 0,
            output_exists=False,
            output_mtime=None,
            newest_source_path=newest_path,
            newest_source_mtime=newest_mtime,
            sources_checked=sources_checked,
        )

    is_stale = newest_mtime is not None and newest_mtime > output_mtime
    return StaleInfo(
        is_stale=is_stale,
        output_exists=True,
        output_mtime=output_mtime,
        newest_source_path=newest_path,
        newest_source_mtime=newest_mtime,
        sources_checked=sources_checked,
    )


def _combined_status(result: dict[str, Any] | None, stale: StaleInfo | None) -> str:
    base = _status_text(result)
    if stale and stale.is_stale:
        # STALE övertrumfar OK eftersom det signalerar att output inte längre
        # speglar källorna. FAIL/TIMEOUT är fortfarande viktigare att synliggöra.
        if base in ("OK", "—"):
            return "STALE"
        return f"{base}+STALE"
    return base


def _format_age(iso_ts: str | None) -> str:
    if not iso_ts:
        return "aldrig"
    try:
        dt = datetime.fromisoformat(iso_ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - dt
        secs = int(delta.total_seconds())
        if secs < 60:
            return f"{secs}s sedan"
        if secs < 3600:
            return f"{secs // 60}m sedan"
        if secs < 86400:
            return f"{secs // 3600}h sedan"
        return f"{secs // 86400}d sedan"
    except Exception:
        return iso_ts


def _run_batch(
    ctx: BackofficeContext,
    state: dict[str, Any],
    scripts: list[HealthScript],
) -> None:
    progress = st.progress(0.0, text=f"Förbereder {len(scripts)} skript...")
    for idx, script in enumerate(scripts, start=1):
        progress.progress(
            (idx - 1) / max(len(scripts), 1),
            text=f"Kör {idx}/{len(scripts)}: {script.label}",
        )
        with st.spinner(f"Kör {script.label}..."):
            state[script.id] = _run_script(ctx, script)
            _save_state(ctx, state)
    progress.progress(1.0, text=f"Färdig: {len(scripts)} skript körda.")


def render(ctx: BackofficeContext) -> None:
    st.markdown(
        "Kör underhållsskript som **inte** ingår i `npm run dev`-flödet. "
        "Status persisteras i `data/backoffice/pipeline-health-state.json` så "
        "du ser när varje skript senast kördes och om det lyckades."
    )

    state = _load_state(ctx)

    fast_scripts = [s for s in SCRIPTS if s.cost == "fast"]
    medium_scripts = [s for s in SCRIPTS if s.cost == "medium"]
    cheap_scripts = fast_scripts + medium_scripts
    all_scripts = list(SCRIPTS)

    # Räkna ut staleness en gång och dela mellan tabell, banner och per-skript-vy
    # så vi inte glob:ar samma filer flera gånger per render.
    stale_info: dict[str, StaleInfo | None] = {
        s.id: _check_staleness(ctx, s) for s in SCRIPTS
    }
    stale_scripts = [s for s in SCRIPTS if (stale_info[s.id] and stale_info[s.id].is_stale)]

    if stale_scripts:
        lines = ["**Stale output upptäckt — re-genering rekommenderas:**"]
        for s in stale_scripts:
            info = stale_info[s.id]
            assert info is not None
            lines.append(f"- **{s.label}** — {info.reason}")
        st.warning("\n".join(lines))
        if st.button(
            f"Fixa stale ({len(stale_scripts)} skript)",
            type="primary",
            key="pipeline-health-fix-stale",
            help="Kör endast de skript där källfilerna är nyare än output.",
        ):
            _run_batch(ctx, state, stale_scripts)
            st.rerun()

    st.subheader("Status översikt")
    rows: list[dict[str, str]] = []
    for s in SCRIPTS:
        result = state.get(s.id)
        info = stale_info[s.id]
        rows.append(
            {
                "Skript": s.label,
                "Status": _combined_status(result, info),
                "Kostnad": _COST_LABELS[s.cost],
                "API": "OpenAI" if s.requires_api else "—",
                "Senast körd": _format_age((result or {}).get("finishedAt")),
                "Senaste körtid": (
                    f"{result['elapsedSec']}s"
                    if result and "elapsedSec" in result
                    else "—"
                ),
                "Exit": (
                    str(result["exitCode"])
                    if result and "exitCode" in result
                    else "—"
                ),
            }
        )
    st.dataframe(rows, width="stretch", hide_index=True)

    ok_count = sum(1 for s in SCRIPTS if (state.get(s.id) or {}).get("exitCode") == 0)
    fail_count = sum(
        1 for s in SCRIPTS
        if state.get(s.id) is not None
        and (state.get(s.id) or {}).get("exitCode") != 0
    )
    never_count = len(SCRIPTS) - ok_count - fail_count
    cols = st.columns(4)
    cols[0].metric("OK", ok_count)
    cols[1].metric("FAIL", fail_count)
    cols[2].metric("Aldrig kört", never_count)
    cols[3].metric("STALE", len(stale_scripts))

    st.divider()

    st.subheader("Snabbåtgärder")
    st.caption(
        "Embeddings-skript kostar OpenAI-tokens och tar minuter. "
        "Kör helst en grupp i taget."
    )
    col_a, col_b, col_c = st.columns(3)
    with col_a:
        if st.button(
            "Kör snabba (utan API)",
            type="primary",
            help=", ".join(s.id for s in fast_scripts),
        ):
            _run_batch(ctx, state, fast_scripts)
            st.rerun()
    with col_b:
        if st.button(
            "Kör allt utom embeddings",
            help=", ".join(s.id for s in cheap_scripts),
        ):
            _run_batch(ctx, state, cheap_scripts)
            st.rerun()
    with col_c:
        if st.button(
            "Kör ALLT (inkl. embeddings)",
            help="Inkluderar OpenAI-embeddings — dyrt och kan ta tiotals minuter",
        ):
            _run_batch(ctx, state, all_scripts)
            st.rerun()

    st.divider()

    st.subheader("Per skript")
    for script in SCRIPTS:
        result = state.get(script.id)
        info = stale_info[script.id]
        status = _combined_status(result, info)
        title = f"[{status}] {script.label}"
        with st.expander(title, expanded=False):
            st.caption(script.description)
            st.code(" ".join(script.command), language="bash")
            if info and info.is_stale:
                st.warning(f"STALE: {info.reason}")
            elif info and info.output_exists and info.sources_checked > 0:
                st.caption(
                    f"Freshness OK — output speglar {info.sources_checked} källfil(er)."
                )

            meta_cols = st.columns([1, 1, 1, 2])
            meta_cols[0].metric("Status", status)
            meta_cols[1].metric(
                "Exit",
                str((result or {}).get("exitCode", "—")),
            )
            meta_cols[2].metric(
                "Körtid",
                f"{(result or {}).get('elapsedSec', 0)}s" if result else "—",
            )
            meta_cols[3].metric(
                "Senast",
                _format_age((result or {}).get("finishedAt")),
            )

            run_col, clear_col = st.columns([1, 1])
            with run_col:
                if st.button("Kör nu", key=f"pipeline-health-run-{script.id}"):
                    with st.spinner(f"Kör {script.label}..."):
                        state[script.id] = _run_script(ctx, script)
                        _save_state(ctx, state)
                    st.rerun()
            with clear_col:
                if result is not None and st.button(
                    "Rensa status",
                    key=f"pipeline-health-clear-{script.id}",
                ):
                    state.pop(script.id, None)
                    _save_state(ctx, state)
                    st.rerun()

            if result is None:
                st.info("Aldrig körd från denna panel.")
                continue

            if result.get("exitCode") == 0:
                st.success(f"Lyckades på {result.get('elapsedSec')}s.")
            else:
                st.error(
                    f"Misslyckades (exit {result.get('exitCode')}) efter "
                    f"{result.get('elapsedSec')}s."
                )

            stdout_tail = (result.get("stdoutTail") or "").strip()
            stderr_tail = (result.get("stderrTail") or "").strip()

            if stdout_tail:
                with st.expander("stdout (sista ~4000 tecken)", expanded=False):
                    st.code(stdout_tail, language="text")
            if stderr_tail:
                with st.expander(
                    "stderr (sista ~4000 tecken)",
                    expanded=result.get("exitCode") != 0,
                ):
                    st.code(stderr_tail, language="text")
