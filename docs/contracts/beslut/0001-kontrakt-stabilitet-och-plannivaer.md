# ADR 0001 — Kontraktslager, stabilitetstester och plan-nivåer
- Status: accepterad
- Datum: 2026-06-18

## Beslut
1. `schemas/` låser dataformat; planering är en **Cursor-regel** (`plan-lifecycle.mdc`), inte ett schema. `plan-file.schema.json` pensioneras vid städning.
2. "Regressionstester" → **stabilitetstester**: större buggar + UX-invarianter (t.ex. att åäö renderas i builder-chatten). Tre körlägen: lokalt, på PR, vid push.
3. LLM-evals **parkeras** (instabila just nu). Gaten är stabilitets-lane (Vitest) + senare runtime/UI-smoke — inte eval-baseline.
4. Plan-modell: nivå 1 master · nivå 2 områden (~8) · nivå 3 aktiviteter just-in-time.
5. Kontraktslager = 4 pelare (schemas/policies/regler/beslut); 3 finns redan, beslut är nytt.

## Varför
Källdokumenten (deep-research, cleanup-handoff, "Controlled Aggression") drev mot att kopiera Sajtbyggarens rigorösa governance. Vi vill ha Sajtmaskins fart + små hårda kontrakt, inte ett styrningslager.

## Inte detta
Ingen `governance/`-mapp, ingen ADR-stapel som merge-blocker, inga 1500-raders allowlists, ingen stor rewrite, ingen fysisk flytt av `docs/schemas/` nu.
