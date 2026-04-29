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
    report_path = _write_eval_gate_report(
        ctx,
        command=command,
        report_slug=report_slug,
        title=title,
        exit_code=exit_code,
        elapsed_sec=elapsed_sec,
        output=output,
        started_at=started_at,
    )
    return {
        "exitCode": exit_code,
        "elapsedSec": round(elapsed_sec, 1),
        "reportPath": report_path,
        "outputTail": _strip_ansi(output)[-6000:],
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
        "Båda lever i `src/lib/gen/eval/`; gate-läget jämför mot `eval-baseline.json`. "
        "Backoffice-knapparna sparar rapporter under `docs/evals/`."
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
        "`eval:smoke` är snabbare men fortfarande LLM-quota. `eval:gate` är dyr/långsam "
        "och kan ta 45+ minuter på stora outputs. Knapparna uppdaterar aldrig "
        "`eval-baseline.json`; de sparar bara rapporter."
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
    run_col1, run_col2 = st.columns(2)
    with run_col1:
        if st.button(
            "Kör eval:smoke (3 prompts)",
            disabled=not confirmed,
            key="codegen_eval_smoke_run",
        ):
            with st.spinner("Kör npm run eval:smoke ... lämna fliken öppen."):
                result = _run_eval_smoke(ctx, timeout_s=int(timeout_min * 60))
            st.session_state["codegen_eval_gate_last_result"] = result
            st.rerun()
    with run_col2:
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
        report_path = last_result.get("reportPath")
        rel_report = (
            report_path.relative_to(ctx.repo_root).as_posix()
            if isinstance(report_path, Path)
            else str(report_path)
        )
        if code == 0:
            st.success(f"Senaste eval:gate passerade. Rapport: `{rel_report}`")
        else:
            st.error(f"Senaste eval:gate failade med exit code `{code}`. Rapport: `{rel_report}`")
        st.caption(f"Körtid: {last_result.get('elapsedSec', '?')}s")
        with st.expander("Output-tail", expanded=False):
            st.code(str(last_result.get("outputTail", "")), language="text")

    reports = _latest_eval_reports(ctx)
    st.markdown("### Sparade codegen-eval-rapporter")
    if reports:
        options = {p.relative_to(ctx.repo_root).as_posix(): p for p in reports[:20]}
        selected = st.selectbox("Rapport", list(options.keys()), key="codegen_eval_report_pick")
        picked = options[selected]
        st.caption(f"Senast ändrad: {datetime.fromtimestamp(picked.stat().st_mtime).isoformat()}")
        with st.expander("Visa rapport", expanded=False):
            st.markdown(picked.read_text(encoding="utf-8"))
    else:
        st.info("Inga rapporter hittades ännu under `docs/evals/`.")
