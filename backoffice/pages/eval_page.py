"""Eval-sidan — visar scaffold-selection-eval + codegen-eval-baseline-status.

Två separata eval-system speglas här (se `src/lib/gen/eval/README.md` för
fullständig förklaring av kostnad/användning).
"""

from __future__ import annotations

import json

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext, read_json


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
        "kostar OPENAI-quota). Den lever i `src/lib/gen/eval/` och kör mot `eval-baseline.json`."
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
