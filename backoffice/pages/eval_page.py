"""Eval-sidan — visar scaffold-selection-eval + codegen-eval-baseline-status.

Två separata eval-system speglas här (se `src/lib/gen/eval/README.md` för
fullständig förklaring av kostnad/användning).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext, read_json


ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def _resolve_command(command: tuple[str, ...]) -> list[str]:
    if not command:
        return []
    resolved = shutil.which(command[0])
    return [resolved, *command[1:]] if resolved else list(command)


def _load_env_file(path: Path, env: dict[str, str]) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in env:
            continue
        env[key] = value.strip().strip('"').strip("'")


def _strip_ansi(value: str) -> str:
    return ANSI_RE.sub("", value)


def _eval_reports_dir(ctx: BackofficeContext) -> Path:
    return ctx.repo_root / "docs" / "evals"


def _latest_eval_reports(ctx: BackofficeContext) -> list[Path]:
    reports_dir = _eval_reports_dir(ctx)
    if not reports_dir.is_dir():
        return []
    return sorted(reports_dir.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)


def _eval_runs_dir(ctx: BackofficeContext) -> Path:
    return ctx.repo_root / "data" / "eval-runs"


def _latest_codegen_summary_path(ctx: BackofficeContext) -> Path:
    return _eval_runs_dir(ctx) / "latest" / "summary.json"


def _latest_codegen_summary_markdown_path(ctx: BackofficeContext) -> Path:
    return _eval_runs_dir(ctx) / "latest" / "summary.md"


def _load_latest_codegen_summary(ctx: BackofficeContext) -> dict[str, Any] | None:
    path = _latest_codegen_summary_path(ctx)
    if not path.is_file():
        return None
    data = read_json(path)
    return data if isinstance(data, dict) else None


def _fmt_pct(value: Any) -> str:
    return f"{value * 100:.1f}%" if isinstance(value, (int, float)) else "?"


def _artifact_path(ctx: BackofficeContext, relative_path: Any) -> Path | None:
    if not relative_path:
        return None
    candidate = (ctx.repo_root / str(relative_path)).resolve()
    try:
        candidate.relative_to(ctx.repo_root.resolve())
    except ValueError:
        return None
    return candidate


def _read_artifact_json(ctx: BackofficeContext, relative_path: Any, filename: str) -> Any:
    artifact_dir = _artifact_path(ctx, relative_path)
    if not artifact_dir:
        return None
    target = artifact_dir / filename
    return read_json(target) if target.is_file() else None


def _prompt_issue_summary(ctx: BackofficeContext, row: dict[str, Any]) -> str:
    checks = _read_artifact_json(ctx, row.get("artifactDir"), "checks.json")
    if isinstance(checks, list):
        failed = [
            f"{check.get('name')}: {check.get('message')}"
            for check in checks
            if isinstance(check, dict) and not check.get("passed", True)
        ]
        if failed:
            return "; ".join(failed[:3])
    blockers = row.get("blockingChecks") or []
    preflight = row.get("preflight") or {}
    reason = preflight.get("previewBlockingReason") if isinstance(preflight, dict) else None
    parts = [", ".join(blockers)] if blockers else []
    if reason:
        parts.append(str(reason))
    return " · ".join(parts) if parts else "Ingen tydlig rotorsak i metadata."


def _build_eval_suggestions(summary_data: dict[str, Any]) -> list[str]:
    prompts = summary_data.get("prompts", [])
    if not isinstance(prompts, list):
        return []

    blocker_counts: dict[str, int] = {}
    syntax_failures = 0
    prompt_outliers: list[str] = []
    dropped_blocks: list[str] = []
    scaffold_gaps: list[str] = []

    for row in prompts:
        if not isinstance(row, dict):
            continue
        for blocker in row.get("blockingChecks") or []:
            blocker_counts[str(blocker)] = blocker_counts.get(str(blocker), 0) + 1
            if blocker == "syntax":
                syntax_failures += 1
        prompt_size = row.get("promptSize") or {}
        total_chars = prompt_size.get("totalChars", 0) if isinstance(prompt_size, dict) else 0
        if isinstance(total_chars, (int, float)) and total_chars > 75_000:
            prompt_outliers.append(str(row.get("promptId", "?")))
        dropped = prompt_size.get("droppedBlocks", 0) if isinstance(prompt_size, dict) else 0
        if isinstance(dropped, (int, float)) and dropped > 0:
            dropped_blocks.append(f"{row.get('promptId', '?')} ({int(dropped)})")
        if not row.get("scaffoldId"):
            scaffold_gaps.append(str(row.get("promptId", "?")))

    suggestions: list[str] = []
    if blocker_counts:
        top = ", ".join(
            f"{name} ({count})"
            for name, count in sorted(blocker_counts.items(), key=lambda item: item[1], reverse=True)[:5]
        )
        suggestions.append(f"Prioritera blockerande checks: {top}.")
    if syntax_failures:
        suggestions.append("Syntaxfel finns: jämför raw/fixed/merged/canonical-filer för de failande promptarna.")
    if prompt_outliers:
        suggestions.append(f"Prompt-size outliers över 75k chars: {', '.join(prompt_outliers)}.")
    if dropped_blocks:
        suggestions.append(f"Dynamic context tappade block: {', '.join(dropped_blocks[:5])}.")
    if scaffold_gaps:
        suggestions.append(f"Saknar scaffold-signal: {', '.join(scaffold_gaps)}.")
    if not suggestions:
        suggestions.append("Inga tydliga röda flaggor i senaste summary.")
    return suggestions


def _export_latest_eval_summary(ctx: BackofficeContext) -> Path | None:
    source = _latest_codegen_summary_markdown_path(ctx)
    if not source.is_file():
        return None
    reports_dir = _eval_reports_dir(ctx)
    reports_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d-%H%M%S")
    target = reports_dir / f"{stamp}-codegen-eval-summary.md"
    target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
    return target


def _write_eval_gate_report(
    ctx: BackofficeContext,
    *,
    command: tuple[str, ...],
    report_slug: str,
    title: str,
    exit_code: int,
    elapsed_sec: float,
    output: str,
    started_at: datetime,
) -> Path:
    reports_dir = _eval_reports_dir(ctx)
    reports_dir.mkdir(parents=True, exist_ok=True)
    # Second-level granularity prevents silent overwrite when two runs land
    # in the same minute (e.g. fast-failing binary-missing + immediate retry,
    # double-click on the gate button, parallel operators).
    stamp = started_at.astimezone().strftime("%Y-%m-%d-%H%M%S")
    report_path = reports_dir / f"{stamp}-{report_slug}.md"
    status = "PASS" if exit_code == 0 else "FAIL"
    cleaned_output = _strip_ansi(output).strip()
    report_path.write_text(
        "\n".join(
            [
                f"# {title} - {stamp}",
                "",
                f"- Command: `{' '.join(command)}`",
                f"- Exit code: `{exit_code}`",
                f"- Gate result: `{status}`",
                f"- Runtime: `{elapsed_sec:.1f}s`",
                f"- Started: `{started_at.isoformat()}`",
                "- Baseline update: not performed by this backoffice gate runner",
                "",
                "## Output",
                "",
                "```text",
                cleaned_output,
                "```",
                "",
            ]
        ),
        encoding="utf-8",
        newline="\n",
    )
    return report_path


def _run_eval_command(
    ctx: BackofficeContext,
    *,
    command: tuple[str, ...],
    timeout_s: int,
    report_slug: str,
    title: str,
) -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    started = time.time()
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    _load_env_file(ctx.env_local, env)

    stdout = ""
    stderr = ""
    exit_code = -99
    try:
        proc = subprocess.run(
            _resolve_command(command),
            cwd=str(ctx.repo_root),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
            shell=False,
            env=env,
        )
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        exit_code = proc.returncode
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = (exc.stderr if isinstance(exc.stderr, str) else "") + (
            f"\n[backoffice] Timed out after {timeout_s}s"
        )
        exit_code = -1
    except FileNotFoundError as exc:
        stderr = f"Saknar binär ({command[0]}): {exc}"
        exit_code = -2
    except Exception as exc:  # pragma: no cover - defensive UI helper
        stderr = f"Oväntat fel: {exc}"
        exit_code = -3

    elapsed_sec = time.time() - started
    output = "\n".join(part for part in [stdout, stderr] if part)
    summary_path = _latest_codegen_summary_path(ctx)
    return {
        "commandName": " ".join(command),
        "exitCode": exit_code,
        "elapsedSec": round(elapsed_sec, 1),
        "summaryPath": summary_path if summary_path.is_file() else None,
        "outputTail": _strip_ansi(output)[-6000:],
        "startedAt": started_at.isoformat(),
        "title": title,
        "reportSlug": report_slug,
    }


def _run_eval_gate(ctx: BackofficeContext, *, timeout_s: int) -> dict[str, Any]:
    return _run_eval_command(
        ctx,
        command=("npm", "run", "eval:gate"),
        timeout_s=timeout_s,
        report_slug="codegen-eval-gate",
        title="Codegen eval gate",
    )


def _run_eval_smoke(ctx: BackofficeContext, *, timeout_s: int) -> dict[str, Any]:
    return _run_eval_command(
        ctx,
        command=("npm", "run", "eval:smoke"),
        timeout_s=timeout_s,
        report_slug="codegen-eval-smoke",
        title="Codegen eval smoke",
    )


def _run_eval_weird_smoke(ctx: BackofficeContext, *, timeout_s: int) -> dict[str, Any]:
    return _run_eval_command(
        ctx,
        command=("npm", "run", "eval:weird-smoke"),
        timeout_s=timeout_s,
        report_slug="codegen-eval-weird-smoke",
        title="Codegen eval weird smoke",
    )


def _run_eval_weird_smoke_dump(ctx: BackofficeContext, *, timeout_s: int) -> dict[str, Any]:
    return _run_eval_command(
        ctx,
        command=("npm", "run", "eval:weird-smoke:dump"),
        timeout_s=timeout_s,
        report_slug="codegen-eval-weird-smoke-dump",
        title="Codegen eval weird smoke dump",
    )


def _run_eval_followup(ctx: BackofficeContext, *, timeout_s: int) -> dict[str, Any]:
    return _run_eval_command(
        ctx,
        command=("npm", "run", "eval:followup"),
        timeout_s=timeout_s,
        report_slug="codegen-eval-followup",
        title="Codegen eval follow-up context",
    )


def render(ctx: BackofficeContext) -> None:
    st.header("Scaffold Selection Eval")
    st.caption(
        "Mäter att `matchScaffoldAuto()` väljer rätt scaffold för en given prompt. "
        "Kör `npm run scaffolds:eval` för att uppdatera datan (~10 sek, billigt). "
        "Detta är **inte** codegen-eval — för det, se `npm run eval:gate` och "
        "`src/lib/gen/eval/README.md`."
    )

    eval_data = read_json(ctx.eval_latest) if ctx.eval_latest.is_file() else None

    if eval_data and isinstance(eval_data, dict):
        results = eval_data.get("results", [])
        summary = eval_data.get("summary", {})
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Total cases", summary.get("total", len(results)))
        col2.metric(
            "Keyword Top-1",
            f"{summary.get('keywordTop1Accuracy', 0):.1f}%"
            if isinstance(summary.get("keywordTop1Accuracy"), (int, float))
            else "?",
        )
        col3.metric(
            "Semantic Top-1",
            f"{summary.get('semanticTop1Accuracy', 0):.1f}%"
            if isinstance(summary.get("semanticTop1Accuracy"), (int, float))
            else "?",
        )
        col4.metric(
            "Semantic Top-3",
            f"{summary.get('semanticTop3Accuracy', 0):.1f}%"
            if isinstance(summary.get("semanticTop3Accuracy"), (int, float))
            else "?",
        )
        if results:
            rows = []
            for r in results:
                rows.append(
                    {
                        "id": r.get("id", ""),
                        "expected": r.get("expected", ""),
                        "keyword": r.get("keywordTop1", ""),
                        "semantic": r.get("semanticTop1", ""),
                        "kw_ok": r.get("keywordTop1Correct", False),
                        "sem_ok": r.get("semanticTop1Correct", False),
                        "method": r.get("semanticMethod", ""),
                        "confidence": r.get("semanticConfidence", ""),
                    }
                )
            st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
    else:
        st.info(
            "Ingen scaffold-eval-rapport hittades. Kör `npm run scaffolds:eval` lokalt "
            "för att generera `data/scaffold-eval/reports/scaffold-selection-latest.json`."
        )

    st.divider()
    st.subheader("Codegen-eval (separat system)")
    st.caption(
        "Codegen-evalen mäter hela LLM-pipelinen för 15 fasta prompts (~15 min, "
        "kostar OPENAI-quota). `eval:smoke` kör 3 prompts och visar prompt/preflight-telemetri. "
        "`eval:followup` mäter follow-up-context och promptstorlek utan LLM-codegen. "
        "Båda lever i `src/lib/gen/eval/`; gate-läget jämför mot `eval-baseline.json`. "
        "Backoffice-knapparna läser senaste strukturerade summary från `data/eval-runs/latest/`. "
        "`Surface/Final` betyder LLM-genererad app-yta / komplett körbart Next-projekt."
    )
    baseline_path = ctx.repo_root / "src" / "lib" / "gen" / "eval" / "eval-baseline.json"
    if baseline_path.is_file():
        try:
            baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
            summary = baseline.get("summary", {})
            bc1, bc2, bc3, bc4 = st.columns(4)
            bc1.metric("Baseline-modell", baseline.get("model", "?"))
            bc2.metric("Total prompts", summary.get("total", "?"))
            bc3.metric("Passed", summary.get("passed", "?"))
            bc4.metric(
                "Avg score",
                f"{summary.get('avgScore', 0) * 100:.1f}%"
                if isinstance(summary.get("avgScore"), (int, float))
                else "?",
            )
            ts = baseline.get("timestamp", "")
            st.caption(
                f"Baseline-tidsstämpel: `{ts[:19].replace('T', ' ') if ts else 'okänd'}` · "
                "Uppdateras via `npm run eval:baseline` lokalt eller veckovis CI "
                "(`.github/workflows/eval-baseline-update.yml`)."
            )
        except Exception as exc:
            st.warning(f"Kunde inte läsa codegen-eval-baseline: {exc}")
    else:
        st.info(
            "Ingen `eval-baseline.json` hittad. Kör `npm run eval:baseline` lokalt en gång "
            "för att skapa den (kostar OPENAI-quota för 15 prompts)."
        )

    st.markdown("### Kör codegen-eval")
    st.warning(
        "`eval:smoke` och `eval:weird-smoke` använder LLM-quota. `eval:gate` är dyr/långsam "
        "och kan ta 45+ minuter på stora outputs. Knapparna uppdaterar aldrig "
        "`eval-baseline.json`; de skriver strukturerad metadata till `data/eval-runs/latest/`."
    )
    timeout_min = st.number_input(
        "Timeout (minuter)",
        min_value=20,
        max_value=180,
        value=90,
        step=10,
        help="Backoffice väntar synkront medan npm-kommandot kör.",
    )
    confirmed = st.checkbox(
        "Jag vill köra codegen-eval och förstår att det använder LLM-quota.",
        key="codegen_eval_gate_confirm",
    )
    run_col1, run_col2, run_col3, run_col4, run_col5 = st.columns(5)
    with run_col1:
        if st.button(
            "Smoke (3 standard)",
            disabled=not confirmed,
            key="codegen_eval_smoke_run",
        ):
            with st.spinner("Kör npm run eval:smoke ... lämna fliken öppen."):
                result = _run_eval_smoke(ctx, timeout_s=int(timeout_min * 60))
            st.session_state["codegen_eval_gate_last_result"] = result
            st.rerun()
    with run_col2:
        if st.button(
            "Weird smoke (3 nya)",
            disabled=not confirmed,
            key="codegen_eval_weird_smoke_run",
        ):
            with st.spinner("Kör npm run eval:weird-smoke ... lämna fliken öppen."):
                result = _run_eval_weird_smoke(ctx, timeout_s=int(timeout_min * 60))
            st.session_state["codegen_eval_gate_last_result"] = result
            st.rerun()
    with run_col3:
        if st.button(
            "Weird smoke + dump failed files",
            disabled=not confirmed,
            key="codegen_eval_weird_smoke_dump_run",
        ):
            with st.spinner("Kör npm run eval:weird-smoke:dump ... lämna fliken öppen."):
                result = _run_eval_weird_smoke_dump(ctx, timeout_s=int(timeout_min * 60))
            st.session_state["codegen_eval_gate_last_result"] = result
            st.rerun()
    with run_col4:
        if st.button(
            "Kör eval:followup (ingen LLM-kostnad)",
            disabled=not confirmed,
            key="codegen_eval_followup_run",
        ):
            with st.spinner("Kör npm run eval:followup ..."):
                result = _run_eval_followup(ctx, timeout_s=int(timeout_min * 60))
            st.session_state["codegen_eval_gate_last_result"] = result
            st.rerun()
    with run_col5:
        if st.button(
            "Kör eval:gate (15 prompts)",
            type="primary",
            disabled=not confirmed,
            key="codegen_eval_gate_run",
        ):
            with st.spinner("Kör npm run eval:gate ... lämna fliken öppen."):
                result = _run_eval_gate(ctx, timeout_s=int(timeout_min * 60))
            st.session_state["codegen_eval_gate_last_result"] = result
            st.rerun()

    last_result = st.session_state.get("codegen_eval_gate_last_result")
    if isinstance(last_result, dict):
        code = last_result.get("exitCode")
        command_name = str(last_result.get("commandName") or "npm run eval:gate")
        summary_path = last_result.get("summaryPath")
        rel_summary = (
            summary_path.relative_to(ctx.repo_root).as_posix()
            if isinstance(summary_path, Path)
            else "data/eval-runs/latest/summary.json"
        )
        if code == 0:
            st.success(f"Senaste körning (`{command_name}`) passerade. Summary: `{rel_summary}`")
        else:
            st.error(
                f"Senaste körning (`{command_name}`) failade med exit code `{code}`. Summary: `{rel_summary}`"
            )
        st.caption(f"Körtid: {last_result.get('elapsedSec', '?')}s")
        with st.expander("Output-tail", expanded=False):
            st.code(str(last_result.get("outputTail", "")), language="text")

    latest_summary = _load_latest_codegen_summary(ctx)
    st.markdown("### Senaste codegen-eval-resultat")
    if latest_summary:
        summary = latest_summary.get("summary", {})
        prompts = latest_summary.get("prompts", [])
        col1, col2, col3, col4, col5 = st.columns(5)
        col1.metric("Total", summary.get("total", "?"))
        col2.metric("Passed", summary.get("passed", "?"))
        col3.metric("Avg score", _fmt_pct(summary.get("avgScore")))
        col4.metric("Blocking failures", summary.get("blockingFailures", "?"))
        col5.metric("Avg time", f"{summary.get('avgTimeMs', '?')} ms")
        st.caption(
            f"Run: `{latest_summary.get('runId', '?')}` · "
            f"modell `{latest_summary.get('model', '?')}` · "
            f"timestamp `{latest_summary.get('timestamp', '?')}`"
        )

        if isinstance(prompts, list) and prompts:
            rows = []
            for row in prompts:
                if not isinstance(row, dict):
                    continue
                prompt_size = row.get("promptSize") or {}
                preflight = row.get("preflight") or {}
                rows.append(
                    {
                        "id": row.get("promptId", ""),
                        "score": _fmt_pct(row.get("totalScore")),
                        "pass": row.get("passed", False),
                        "scaffold": row.get("scaffoldId") or "",
                        "variant": row.get("variantId") or "",
                        "prompt_tokens": prompt_size.get("totalEstimatedTokens", "")
                        if isinstance(prompt_size, dict)
                        else "",
                        "preflight": (
                            f"{preflight.get('errors', 0)}E/{preflight.get('warnings', 0)}W"
                            if isinstance(preflight, dict)
                            else ""
                        ),
                        "blockers": ", ".join(row.get("blockingChecks") or []),
                        "files_dumped": row.get("filesDumped", False),
                    }
                )
            st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)

            failed_prompts = [row for row in prompts if isinstance(row, dict) and not row.get("passed")]
            for row in failed_prompts:
                with st.expander(f"Fail: {row.get('promptId', '?')}", expanded=False):
                    st.markdown(f"**Sannolik rotorsak:** {_prompt_issue_summary(ctx, row)}")
                    artifact_dir = row.get("artifactDir")
                    if artifact_dir:
                        st.caption(f"Artefakter: `{artifact_dir}`")
                        artifact_path = _artifact_path(ctx, artifact_dir)
                        if artifact_path:
                            for name in [
                                "raw-files",
                                "fixed-files",
                                "merged-files",
                                "canonical-runtime-files",
                            ]:
                                target = artifact_path / name
                                if target.exists():
                                    st.code(target.relative_to(ctx.repo_root).as_posix(), language="text")
                    else:
                        st.caption("Ingen per-prompt artefaktmapp hittad för denna rad.")

            st.markdown("### Vad ska ses över?")
            for suggestion in _build_eval_suggestions(latest_summary):
                st.write(f"- {suggestion}")

        if st.button("Exportera latest summary.md till docs/evals", key="codegen_eval_export_latest"):
            exported = _export_latest_eval_summary(ctx)
            if exported:
                st.success(f"Exporterade `{exported.relative_to(ctx.repo_root).as_posix()}`")
            else:
                st.warning("Ingen `data/eval-runs/latest/summary.md` finns att exportera.")
    else:
        st.info(
            "Ingen strukturerad codegen-eval-summary hittades. Kör en knapp ovan eller "
            "`npm run eval:weird-smoke` lokalt."
        )

    reports = _latest_eval_reports(ctx)
    st.markdown("### Exporterade codegen-eval-rapporter")
    if reports:
        options = {p.relative_to(ctx.repo_root).as_posix(): p for p in reports[:20]}
        selected = st.selectbox("Rapport", list(options.keys()), key="codegen_eval_report_pick")
        picked = options[selected]
        st.caption(f"Senast ändrad: {datetime.fromtimestamp(picked.stat().st_mtime).isoformat()}")
        with st.expander("Visa rapport", expanded=False):
            st.markdown(picked.read_text(encoding="utf-8"))
    else:
        st.info("Inga explicita exporter hittades ännu under `docs/evals/`.")
