# P13: CSV-export i Streamlit-dashboard

## Problem

`error-log.csv` skrivs av `generation-log-writer.ts` med historiska körningar
(tid, fas, modell, provider, problem, utfall), men varken Streamlit-dashboarden
(`config/dashboard/app.py`) eller Tkinter-dashboarden (`scripts/fly_vm/dashboard.py`)
visar denna data.

## Fix

I `config/dashboard/app.py`, LLM-sidan:

1. `pd.read_csv("logs/llm-segmentts-and-index/error-log.csv")`
2. Visa som filtrerbar tabell (st.dataframe) med kolumnfilter för severity, model, phase.
3. Eventuellt: tidslinjediagram över antal fel per dag/körning.

## Filer

- `config/dashboard/app.py` — lägg till CSV-visning på LLM-sidan.

## Status

**Klar.** LLM-sidan i Streamlit-dashboarden visar nu error-log.csv med
filtrering på severity/model/phase. Defensiv kolumnkontroll tillagd.

## Prioritet

Låg — nice-to-have för operativ insyn.
