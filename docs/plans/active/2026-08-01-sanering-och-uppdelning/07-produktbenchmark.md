---
status: active
owner: unassigned
topic: Permanent produktbenchmark — 20–30 verkliga byggen som mäter preview-success, first-attempt-pass, repair-frekvens, tid till preview, kostnad per lyckad sajt och deploy-success. Viktigare för lansering/värdering än fler providers.
created: 2026-08-01
source: Master-planens steg 10. Metrik-listan från den äldre GPT-rapporten, oförändrad — datakällorna verifierade mot dagens telemetri-schema.
---

# Steg 10: produktbenchmark

## Varför

Repot har gott om *tekniska* kontroller (RenderGate, ReleaseGate, CI-lanes).
Det som saknas är en stående mätning av **produktutfall**: hur ofta en riktig
prompt blir en fungerande sajt, hur fort, och till vilken kostnad. Utan den
är varje pipeline-ändring en gissning om produktvärde.

## Form

- **Promptset:** 20–30 verkliga byggen — blanda scaffold-familjer
  (landing, dashboard, auth, ecommerce), språk och F2/F3. Frys seten i
  `src/lib/gen/eval/` (evalytan finns redan; `npm run scaffolds:eval` är
  närmaste släkting).
- **Körning:** schemalagd (veckovis räcker initialt) mot preview-miljön, inte
  prod-användare. Varje körning skriver en daterad resultatrad — trend, inte
  ögonblicksbild.
- **Datakällor som redan finns:** `generation_telemetry`
  (inkl. `files_revision`, preview-utfall), `engine_generation_logs`,
  deploy-raderna, `/api/metrics`-räknare.

## Metriker (per körning)

| Metrik | Definition |
|---|---|
| Preview-success | andel byggen som når fungerande preview |
| First-attempt-pass | andel som klarar första försöket utan repair |
| Repair-frekvens | genomsnittligt antal repair-pass per bygge |
| Tid till preview | p50/p95 från prompt till klar preview |
| Kostnad per lyckad sajt | modell- + infrastrukturkostnad / lyckade byggen |
| Deploy-success | andel F3-byggen som deployar grönt |
| Första-resultat-acceptans | (prod-mått, separat) andel användare som accepterar v1 utan follow-up |

## Ordningsregler

- Bygg benchmarken **efter** false-green-fixarna — annars mäter den ett grönt
  som ljuger. **Blockeraren är borta:** alla sex fixar levererades 2026-08-01
  (#712–#725, rad i [`../../avklarat/README.md`](../../avklarat/README.md)).
- Ingen ny signalkälla utan canonical owner: utfallsdefinitionerna ska läsas
  ur samma telemetri som appen redan skriver, inte en parallell bokföring.
- Resultatet redovisas i backoffice (befintlig telemetri-sida) — ingen ny yta.

## Klart-kriterium

Två på varandra följande schemalagda körningar med jämförbara resultatrader,
länkade från backoffice, och minst ett pipeline-beslut fattat på trenddata.
