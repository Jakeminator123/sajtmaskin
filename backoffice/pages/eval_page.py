"""Eval-sidan — ett läge, en knapp, canonical `npm run eval -- --json`.

Se `src/lib/gen/eval/README.md`. Inget eget Python-evalsystem.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext, read_json, resolve_command


ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")

_MODE_FREE = "Gratis (follow-up + scaffold, noll kostnad)"
_MODE_SMOKE = "Smoke (gratis + 3 codegen-prompts, kostar OPENAI-quota)"
_MODE_FULL = "Full (gratis + 18 codegen-prompts, kostar OPENAI-quota)"


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


def _parse_canonical_json(stdout: str) -> dict[str, Any] | None:
    text = _strip_ansi(stdout).strip()
    if not text:
        return None
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _canonical_command(mode: str) -> tuple[str, ...]:
    command = ("npm", "run", "--silent", "eval", "--", "--json")
    if mode == _MODE_SMOKE:
        return (*command, "--codegen")
    if mode == _MODE_FULL:
        return (*command, "--full")
    return command


def _run_canonical_eval(
    ctx: BackofficeContext,
    *,
    mode: str,
    timeout_s: int,
) -> dict[str, Any]:
    command = _canonical_command(mode)
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
            resolve_command(command),
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
        "canonical": _parse_canonical_json(stdout),
    }


def render(ctx: BackofficeContext) -> None:
    st.header("Eval")
    st.caption(
        "En canonical körväg: `npm run eval`. Follow-up och scaffold är interna "
        "delar, inte egna knappar. Docs: `src/lib/gen/eval/README.md`."
    )

    eval_data = read_json(ctx.eval_latest) if ctx.eval_latest.is_file() else None

    st.subheader("Senaste scaffold-lane")
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
            "Ingen scaffold-rapport ännu. Gratis-läget skriver "
            "`data/scaffold-eval/reports/scaffold-selection-latest.json`."
        )

    st.divider()
    st.subheader("Kör eval")
    mode = st.radio(
        "Läge",
        (_MODE_FREE, _MODE_SMOKE, _MODE_FULL),
        index=0,
        key="canonical_eval_mode",
    )
    paid = mode != _MODE_FREE
    default_timeout = 5 if not paid else (25 if mode == _MODE_SMOKE else 90)
    timeout_min = st.number_input(
        "Timeout (minuter)",
        min_value=2,
        max_value=180,
        value=default_timeout,
        step=1 if not paid else 5,
        key=f"canonical_eval_timeout_{mode}",
        help="Backoffice väntar synkront medan npm-kommandot kör.",
    )
    confirmed = True
    if paid:
        st.warning(
            "Smoke och full anropar LLM. Gratis-läget gör det inte. "
            "Baseline-grinden styrs inte härifrån."
        )
        confirmed = st.checkbox(
            "Jag vill köra den betalda codegen-lanen och förstår att det använder LLM-quota.",
            key="canonical_eval_paid_confirm",
        )

    if st.button("Kör eval", type="primary", disabled=paid and not confirmed, key="canonical_eval_run"):
        spinner = (
            "Kör npm run eval -- --json ..."
            if not paid
            else f"Kör npm run eval ({mode}) ... lämna fliken öppen."
        )
        with st.spinner(spinner):
            result = _run_canonical_eval(ctx, mode=mode, timeout_s=int(timeout_min * 60))
        st.session_state["canonical_eval_last_result"] = result
        st.rerun()

    last_result = st.session_state.get("canonical_eval_last_result")
    if isinstance(last_result, dict):
        code = last_result.get("exitCode")
        command_name = str(last_result.get("commandName") or "npm run eval -- --json")
        canonical = last_result.get("canonical")
        if isinstance(canonical, dict):
            outcome = str(canonical.get("outcome", "?"))
            lanes = canonical.get("lanes") if isinstance(canonical.get("lanes"), dict) else {}
            codegen = lanes.get("codegen") if isinstance(lanes.get("codegen"), dict) else {}
            codegen_label = str(codegen.get("outcome", "?"))
            if codegen.get("skipReason"):
                codegen_label += f" {codegen.get('skipReason')}"
            if codegen.get("forced"):
                codegen_label += " forced"
            st.markdown(
                f"**Utfall:** `{outcome}` · followup `{lanes.get('followup', {}).get('outcome', '?') if isinstance(lanes.get('followup'), dict) else '?'}` · "
                f"scaffold `{lanes.get('scaffold', {}).get('outcome', '?') if isinstance(lanes.get('scaffold'), dict) else '?'}` · "
                f"codegen `{codegen_label}`"
            )
        if code == 0:
            st.success(f"Senaste körning (`{command_name}`) passerade.")
        else:
            st.error(f"Senaste körning (`{command_name}`) avslutades med exit `{code}`.")
        st.caption(f"Körtid: {last_result.get('elapsedSec', '?')}s")
        with st.expander("Output-tail", expanded=False):
            st.code(str(last_result.get("outputTail", "")), language="text")

    latest_summary = _load_latest_codegen_summary(ctx)
    st.markdown("### Senaste codegen-lane")
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
            "Ingen codegen-summary ännu. Den skrivs bara när smoke eller full körs."
        )

    reports = _latest_eval_reports(ctx)
    st.markdown("### Exporterade codegen-rapporter")
    if reports:
        options = {p.relative_to(ctx.repo_root).as_posix(): p for p in reports[:20]}
        selected = st.selectbox("Rapport", list(options.keys()), key="codegen_eval_report_pick")
        picked = options[selected]
        st.caption(f"Senast ändrad: {datetime.fromtimestamp(picked.stat().st_mtime).isoformat()}")
        with st.expander("Visa rapport", expanded=False):
            st.markdown(picked.read_text(encoding="utf-8"))
    else:
        st.info("Inga explicita exporter hittades ännu under `docs/evals/`.")
