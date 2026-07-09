"""Generation Cost — prissätt loggad token-användning i USD/SEK.

Kör `node scripts/db/generation-cost.mjs --json` via subprocess (read-only) och
prissätter token-volymerna med `config/ai_models/pricing.json`. Samma mönster som
`scaffold_performance.py` / `generation_history.py` — backoffice har ingen egen
Postgres-driver.

Ärlighet (visas som varningar i UI:t):
  - Input prissätts OCACHAT (cached_tokens loggas inte) => övre gräns på input.
  - `engine_generation_logs` = codegen/finalize-strömmen; brief/verifier/repair-LLM
    loggas inte alla där => total är en undre gräns för hela pipelinen.
  - Priser i `pricing.json` är en ögonblicksbild — verifiera mot leverantören.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext

_SCRIPT_REL = "scripts/db/generation-cost.mjs"
_TIMEOUT_S = 90

_ENV_CHOICES = {
    "Dev (.env.local)": ".env.local",
    "Prod (.env.vercel.production.pulled)": ".env.vercel.production.pulled",
}


@dataclass(frozen=True)
class CostPayload:
    ok: bool
    generated_at: str = ""
    env_path: str = ""
    target: str = ""
    is_prod_like: bool = False
    window_days: int = 0
    source_table: str = ""
    usd_to_sek: float | None = None
    totals: dict[str, Any] = field(default_factory=dict)
    by_model: list[dict[str, Any]] = field(default_factory=list)
    by_day: list[dict[str, Any]] = field(default_factory=list)
    unpriced: list[str] = field(default_factory=list)
    caveats: list[str] = field(default_factory=list)
    error: str | None = None


def _run_cost(repo_root, env_file: str, days: int, allow_insecure: bool) -> CostPayload:
    script_path = repo_root / _SCRIPT_REL
    if not script_path.exists():
        return CostPayload(ok=False, error=f"Script saknas: {script_path}")

    args = ["node", str(script_path), "--json", f"--env={env_file}", f"--days={int(days)}"]
    if allow_insecure:
        args.append("--allow-insecure-ssl")

    try:
        result = subprocess.run(
            args,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return CostPayload(ok=False, error=f"Script timeout efter {_TIMEOUT_S}s")
    except FileNotFoundError:
        return CostPayload(ok=False, error="`node` saknas på PATH")

    stdout = (result.stdout or "").strip()
    if not stdout:
        return CostPayload(ok=False, error=(result.stderr or "Tomt svar från script").strip())

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return CostPayload(ok=False, error=f"Kunde inte tolka JSON: {exc}")

    if not data.get("ok"):
        return CostPayload(ok=False, error=str(data.get("error", "Okänt fel")))

    fx = data.get("fx") or {}
    return CostPayload(
        ok=True,
        generated_at=str(data.get("generatedAt", "")),
        env_path=str(data.get("envPath", "")),
        target=str(data.get("target", "")),
        is_prod_like=bool(data.get("isProdLike", False)),
        window_days=int(data.get("windowDays", 0)),
        source_table=str(data.get("sourceTable", "")),
        usd_to_sek=(float(fx["usdToSek"]) if fx.get("usdToSek") is not None else None),
        totals=dict(data.get("totals", {})),
        by_model=list(data.get("byModel", [])),
        by_day=list(data.get("byDay", [])),
        unpriced=list(data.get("unpricedModels", [])),
        caveats=list(data.get("caveats", [])),
    )


def _fmt_usd(value: Any) -> str:
    try:
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return "—"


def _fmt_sek(value: Any, rate: float | None) -> str:
    if rate is None or value is None:
        return "—"
    try:
        return f"{float(value) * rate:,.0f} kr"
    except (TypeError, ValueError):
        return "—"


def _fmt_tok(value: Any) -> str:
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return "0"


def _build_model_df(rows: list[dict[str, Any]], rate: float | None) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame()
    out = []
    for r in rows:
        total_usd = r.get("totalUsd", 0)
        out.append(
            {
                "Modell (loggad)": r.get("model", ""),
                "Prisad som": (r.get("label") or r.get("matched") or "—")
                + (" (est.)" if r.get("estimated") else ""),
                "Genereringar": r.get("rows", 0),
                "Input-tokens": _fmt_tok(r.get("promptTokens")),
                "Output-tokens": _fmt_tok(r.get("completionTokens")),
                "Input $": _fmt_usd(r.get("inputUsd")),
                "Output $": _fmt_usd(r.get("outputUsd")),
                "Total $": _fmt_usd(total_usd),
                "Total kr": _fmt_sek(total_usd, rate),
                "_sort": float(total_usd or 0),
            }
        )
    df = pd.DataFrame(out).sort_values("_sort", ascending=False).drop(columns=["_sort"])
    return df


def _build_day_df(rows: list[dict[str, Any]], rate: float | None) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    grouped = (
        df.groupby("day", as_index=False)
        .agg(
            promptTokens=("promptTokens", "sum"),
            completionTokens=("completionTokens", "sum"),
            totalUsd=("totalUsd", "sum"),
        )
        .sort_values("day", ascending=False)
    )
    grouped["Total $"] = grouped["totalUsd"].map(_fmt_usd)
    grouped["Total kr"] = grouped["totalUsd"].map(lambda v: _fmt_sek(v, rate))
    grouped["Input-tokens"] = grouped["promptTokens"].map(_fmt_tok)
    grouped["Output-tokens"] = grouped["completionTokens"].map(_fmt_tok)
    grouped = grouped.rename(columns={"day": "Dag"})
    return grouped[["Dag", "Input-tokens", "Output-tokens", "Total $", "Total kr"]]


def render(ctx: BackofficeContext) -> None:
    st.title("Generation Cost")
    st.caption(
        "Prissätter loggad token-användning i USD/SEK via `config/ai_models/pricing.json`. "
        "Read-only mot DB:n som vald env-fil pekar på (`scripts/db/generation-cost.mjs`)."
    )

    col_a, col_b, col_c = st.columns([2, 1, 1])
    env_label = col_a.selectbox("Databas (env-fil)", list(_ENV_CHOICES.keys()), index=0)
    env_file = _ENV_CHOICES[env_label]
    days = col_b.slider("Fönster (dagar)", min_value=1, max_value=90, value=30)
    allow_insecure = col_c.checkbox("Tillåt osäker SSL", value=(env_file != ".env.local"))

    with st.spinner("Hämtar och prissätter token-användning ..."):
        payload = _run_cost(ctx.repo_root, env_file, days, allow_insecure)

    if not payload.ok:
        st.error(f"Kunde inte hämta data: {payload.error}")
        st.caption(
            "Tips: kontrollera att vald env-fil har `POSTGRES_URL` och att "
            "`node scripts/db/generation-cost.mjs --json` kan köras lokalt. "
            "För prod-snapshot: `npm run env:pull:prod-snapshot`."
        )
        return

    if payload.is_prod_like:
        st.warning(f"PROD-lik databas: `{payload.target}` — läsning only, inga writes.")
    else:
        st.info(f"Databas: `{payload.target}`")

    rate = payload.usd_to_sek
    rate = st.number_input(
        "USD → SEK (justerbar, ej live-kurs)",
        min_value=1.0,
        max_value=20.0,
        value=float(rate) if rate else 10.5,
        step=0.1,
        help="Ändra för att prisa om allt i SEK. Standardvärde kommer från pricing.json fx.usdToSek.",
    )

    totals = payload.totals or {}
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total kostnad (USD)", _fmt_usd(totals.get("totalUsd")))
    c2.metric("Total kostnad (SEK)", _fmt_sek(totals.get("totalUsd"), rate))
    c3.metric("Input-tokens", _fmt_tok(totals.get("promptTokens")))
    c4.metric("Output-tokens", _fmt_tok(totals.get("completionTokens")))

    c5, c6, c7 = st.columns(3)
    c5.metric("Varav input-kostnad", _fmt_usd(totals.get("inputUsd")))
    c6.metric("Varav output-kostnad", _fmt_usd(totals.get("outputUsd")))
    c7.metric("Genereringar", totals.get("rows", 0))

    for caveat in payload.caveats:
        st.warning(caveat)

    if payload.unpriced:
        st.error(
            "Oprissatta modeller (ingen matchning i pricing.json — kostnad ej räknad): "
            + ", ".join(payload.unpriced)
        )

    st.subheader("Per modell")
    model_df = _build_model_df(payload.by_model, rate)
    if model_df.empty:
        st.info(
            f"Ingen token-data i `{payload.source_table}` de senaste {payload.window_days} dagarna."
        )
    else:
        st.dataframe(model_df, hide_index=True, use_container_width=True)

    st.subheader("Per dag")
    day_df = _build_day_df(payload.by_day, rate)
    if day_df.empty:
        st.caption("Ingen dagsuppdelad data att visa.")
    else:
        st.dataframe(day_df, hide_index=True, use_container_width=True)
        chart_df = pd.DataFrame(payload.by_day)
        if not chart_df.empty:
            daily = chart_df.groupby("day", as_index=True)["totalUsd"].sum().sort_index()
            st.line_chart(daily, y_label="USD / dag")

    st.divider()
    st.caption(
        f"Källa: `{payload.source_table}` · Prislista verifierad: "
        f"{payload.generated_at[:10]} · Redigera priser i `config/ai_models/pricing.json`."
    )
