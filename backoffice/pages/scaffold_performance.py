"""Scaffold Performance — visa per-scaffold telemetri från generation_telemetry.

Kör `node scripts/db/scaffold-scores.mjs --json` via subprocess och visar
resultatet som tabell. Read-only mot DB:n som `.env.local` pekar på.

Syftet är att ge operatören underlag för att fatta beslut om
`scaffold-scoring`-modulen (SAJ-55):
  - Wire upp `getScaffoldBoost` i matchern → självoptimerande scaffold-val.
  - Behåll som dashboard-data → bara observability.
  - Ta bort modulen + DB-kolumnerna → den används aldrig.

Panelen visar inte `compositeScore`-formulan från `scaffold-scoring.ts` —
bara råa counters — för att undvika drift mellan TS-runtime och Python.
Beslutsunderlaget är "presterar scaffolds tydligt olika?", inte exakta
score-värden.

SAJ-57: panelen visar en tydlig varning när `scaffold_retry_used = 0` på
alla scaffolds (vilket är fallet idag pga hardcodat false i
`persist-telemetry.ts`). Då är `retry_count`-kolumnen meningslös.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from typing import Any

import pandas as pd
import streamlit as st

from backoffice.shared import BackofficeContext


_SCRIPT_REL = "scripts/db/scaffold-scores.mjs"
_TIMEOUT_S = 60


@dataclass(frozen=True)
class ScoresPayload:
    lookback_days: int
    generated_at: str
    scaffolds: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    error: str | None = None


def _run_scaffold_scores(repo_root) -> ScoresPayload:
    script_path = repo_root / _SCRIPT_REL
    if not script_path.exists():
        return ScoresPayload(
            lookback_days=0,
            generated_at="",
            scaffolds=[],
            warnings=[],
            error=f"Script saknas: {script_path}",
        )
    try:
        result = subprocess.run(
            ["node", str(script_path), "--json"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return ScoresPayload(
            lookback_days=0,
            generated_at="",
            scaffolds=[],
            warnings=[],
            error=f"Script timeout efter {_TIMEOUT_S}s",
        )
    except FileNotFoundError:
        return ScoresPayload(
            lookback_days=0,
            generated_at="",
            scaffolds=[],
            warnings=[],
            error="`node` saknas på PATH",
        )

    stdout = (result.stdout or "").strip()
    if not stdout:
        return ScoresPayload(
            lookback_days=0,
            generated_at="",
            scaffolds=[],
            warnings=[],
            error=(result.stderr or "Tomt svar från script").strip(),
        )

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        return ScoresPayload(
            lookback_days=0,
            generated_at="",
            scaffolds=[],
            warnings=[],
            error=f"Kunde inte tolka JSON: {exc}",
        )

    if isinstance(data, dict) and data.get("error"):
        return ScoresPayload(
            lookback_days=0,
            generated_at="",
            scaffolds=[],
            warnings=[],
            error=str(data["error"]),
        )

    return ScoresPayload(
        lookback_days=int(data.get("lookbackDays", 30)),
        generated_at=str(data.get("generatedAt", "")),
        scaffolds=list(data.get("scaffolds", [])),
        warnings=list(data.get("warnings", [])),
    )


def _format_pct(value: Any) -> str:
    if value is None:
        return "—"
    try:
        return f"{float(value) * 100:.1f}%"
    except (TypeError, ValueError):
        return "—"


def _build_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(
        [
            {
                "Scaffold": r.get("scaffoldId", ""),
                "Total (confirmed)": r.get("total", 0),
                "Success": r.get("successCount", 0),
                "Success rate": _format_pct(r.get("successRate")),
                "Pending (no preview signal)": r.get("pendingCount", 0),
                "Retry count": r.get("retryCount", 0),
                "Retry rate": _format_pct(r.get("retryRate")),
                "Embedding share": _format_pct(r.get("embeddingShare")),
                "Feedback +": _format_pct(r.get("feedbackPositiveRate")),
                "Feedback total": r.get("feedbackTotal", 0),
                "Avg preflight errors": round(float(r.get("avgPreflightErrors", 0) or 0), 2),
            }
            for r in rows
        ]
    )
    return df


def render(ctx: BackofficeContext) -> None:
    st.title("Scaffold Performance")
    st.caption(
        "Per-scaffold telemetri från `generation_telemetry`. Underlag för beslut om "
        "`scaffold-scoring`-modulen (Linear: SAJ-55). Read-only mot DB:n som "
        "`.env.local` pekar på."
    )

    with st.spinner("Hämtar scaffold-telemetri ..."):
        payload = _run_scaffold_scores(ctx.repo_root)

    if payload.error:
        st.error(f"Kunde inte hämta data: {payload.error}")
        st.caption(
            "Tips: kontrollera att `.env.local` har `POSTGRES_URL` och att "
            "`node scripts/db/scaffold-scores.mjs` kan köras lokalt."
        )
        return

    if payload.warnings:
        for warning in payload.warnings:
            severity = (warning.get("severity") or "").lower()
            message = warning.get("message", "")
            wid = warning.get("id", "")
            label = f"**{wid}** — {message}" if wid else message
            if severity == "high":
                st.error(label)
            else:
                st.warning(label)

    col1, col2, col3 = st.columns(3)
    col1.metric("Scaffolds med data", len(payload.scaffolds))
    col2.metric("Lookback", f"{payload.lookback_days} dagar")
    col3.metric("Senast hämtad", payload.generated_at[:19].replace("T", " ") if payload.generated_at else "—")

    if not payload.scaffolds:
        st.info(
            "Ingen scaffold-telemetri inom fönstret. Antingen är detta en färsk DB, "
            "eller så har inga generationer körts mot scaffolds de senaste "
            f"{payload.lookback_days} dagarna."
        )
        st.divider()
        _render_decision_section(payload)
        return

    df = _build_dataframe(payload.scaffolds)
    st.subheader("Per-scaffold")
    st.dataframe(df, hide_index=True, use_container_width=True)

    st.divider()
    _render_decision_section(payload)


def _render_decision_section(payload: ScoresPayload) -> None:
    st.subheader("Beslutsunderlag — SAJ-55")
    st.markdown(
        """
`scaffold-scoring`-modulen (`src/lib/gen/scaffolds/scaffold-scoring.ts`) har
**noll call-sites** i koden idag. Tre vägar framåt:

1. **Wire upp** `getScaffoldBoost` i matchern (`matchScaffoldAuto`) som tie-breaker
   vid close calls → självoptimerande scaffold-val. Kräver att retry-data är
   meningsfull (se SAJ-57).
2. **Behåll som dashboard-data** — den här panelen är redan en konsument; ingen
   runtime-koppling behövs.
3. **Ta bort modulen** + DB-kolumnerna `scaffold_selection_method`,
   `scaffold_retry_used` om datan inte är meningsfull.

Beslutskriterier från denna panel:

- Skiljer sig **success rate** tydligt mellan scaffolds (>10 procentenheter)?
  → starkt argument för (1).
- Är **embedding share** olika och korrelerar med success rate?
  → embedding-vägen är värd att optimera mot.
- Är **retry rate** alltid 0?
  → SAJ-57 måste fixas innan scoring kan vara meningsfull. Inte börja med (1).
- Är allt uniformt eller volymen för låg (< 20 generationer per scaffold)?
  → vänta med beslut, eller välj (3).
        """
    )

    if any(s.get("retryCount", 0) > 0 for s in payload.scaffolds):
        st.success(
            "Retry-data ser ut att flöda — SAJ-57 kanske har lösts. Verifiera i koden."
        )
    elif payload.scaffolds:
        st.warning(
            "Retry-data är 0 överallt → SAJ-57 är fortfarande aktivt. "
            "Wire INTE upp scoring-modulen i matchern förrän SAJ-57 fixats — "
            "`retryRate` skulle alltid bli 0 och påverka `compositeScore` felaktigt."
        )
