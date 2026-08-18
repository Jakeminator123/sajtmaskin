# Loggbok — Dossier-/Byggblock-sanering (körning 2026-08-17)

Orkestrerad Cloud-körning av [`00-master-plan.md`](00-master-plan.md).
Branch: `cursor/dossier-ux-sanering-79ab` (från master `b1a75de8d`).
En PR för hela spåret; en commit per aktivitet.

Ägardirektiv för körningen (2026-08-17): fria händer inom planens ramar;
underagenter på Grok 4.6 high fast; provider vald → provider-specifik
integration, ingen provider → demo/mock som aldrig blockerar övriga steg.

## Framsteg

**Totalt: 100 % av körplanen. Merge-uppföljning pågår (2026-08-18).**

Körplan (B1–F1 + housekeeping): **100 %**.
Produktavsikt (UX/konsolidering): **~85 %**.
Full dossier-ombyggnad (feature surface + provideradapter): **ej i scope**.
Mergeberedskap: **väntar på push av master-synk + reviewer-fixar + ny CI**.

| Id | Aktivitet | Status | Commit |
|---|---|---|---|
| B1 | Providerval: negation/multi-hit/okänd provider | **Klar** | `dbb242358` |
| B2 | En F3-promptauktoritet (SM-005) | **Klar** | `512e7a9cd` |
| B3 | Plattforms-`process.env`-fallback bort | **Klar** | `dbb242358` |
| B4 | Copy-/docs-städ | **Klar** | `58d195a80` |
| B5 | F3-marker env-nycklar + detaljkort (SM-008/009) | **Klar** | se git |
| K1 | En nyckel-/statusyta | **Klar** | se git |
| K2 | Katalogklick stage:as | **Klar** | se git |
| M1 | F3-kick som systemhändelse (avgjord minimal form) | **Klar** | se git |
| U1 | Byggblock-ytans lyft (popover → Sheet) | **Klar** | se git |
| F1 | F2/F3-begreppsutfasning | **Klar** | se git |
| HK | Housekeeping-svep (docs/schema/backlog/beslut/städ) | **Klar** | se git |
| V | Slutverifiering + bugbot | **Klar** — 1 medium-fynd (prefix-match) fixat + rent återpass | se git |

## Beslut under körningen

| När | Vad | Grund |
|---|---|---|
| 2026-08-17 | En PR i stället för tre | Ägaren: «det kvittar»; aktiviteterna bygger på varandra |
| 2026-08-17 | Subagentmodell `cursor-grok-4.6-high-fast` | Ägarens rabatt; `xhigh-fast` fanns inte i sessionens modellista |
| 2026-08-17 | **M1 avgjort via /818** (3 vinklar, verifierade): INGEN ny serveroperation — förstärk befintlig ägare (`finalize-design` + `lifecycleStage`-meta + server-re-gate). Syntetiska användarbubblan renderas som systemhändelse via befintlig `prompt-source`-uiPart (samma mönster som autofix-prompter). Lila knappen behålls som ENDA explicita trigger (D4 = «bärande»; enda `F3_REBUILD`-lyssnaren, äger kostnad + gating). Ingen auto-start. | pipeline-rules (inga nya orkestreringssteg om ägaren kan stärkas); konsekvensvinkeln visade att knappbort river 412-retryn; MVP-bias |

## Anteckningar

- B1: orkestratorns granskning rättade en kant — tvetydig multi-hit efter
  negation föll tillbaka till defaulten ur hela poolen, så ett negerat
  default-syskon kunde vinna. Fallbacken tar nu icke-negerade poolen.
- B1: `providers` räknas som prompt-markör (clerk-auth saknar
  `relevanceKeywords`) — både för negation och positiv träff.
- B5: orkestratorn strök oanvänd hjälpare (`projectF3DetailCardLifecycle`)
  och pluggade `f3PriorRequestedEnvKeys` genom mellantypen
  `OwnEnginePipelineAndGenerationInput` (typecheck-fångst).
- Verifiering: typecheck, ESLint (0 fel), vitest 671 filer/7918 tester,
  backoffice 652 tester, ruff, docs:generate/check/links,
  dossiers:validate-all + capability-map — alla gröna. OBS: i Cloud-podden
  failar `stream/route.test.ts` m.fl. pga injicerad `REDIS_URL` (riktig
  Redis håller generation-locket mellan tester, TTL 12 min) — samma klass
  som runbookens kända secret-injektionsfel; grönt med env avslagen.
- E2E i browser: registrering → generation (Anthropic) → Byggblock-Sheet →
  K2-staging (AI-chatt «Egen sida», Clerk «Endast kontoindikator i
  headern») → placeringsvalet påverkade genererad kod (Konto-indikator i
  sajtheadern). Avbryt skickar inget. Video kunde inte sparas (pod saknar
  libavutil.so.58 i inspelningsdaemonens namespace) — skärmdumpar i PR:en.
- 2026-08-18: master inmergerad (`747be3c9c`, 0 bakom / 19 före). Reviewer-
  småfixar: «Lägg till» disabled under `saving`; «rekommenderad» → «krävs
  för live»; Avbryt-copy förklarar att sparade nycklar ligger kvar.
  `STAGING_BY_ID` har completeness-test mot runtime-registret. Bugbot på
  branch-diff: «Tillagt via chatten» kunde visas när `sendMessage` avvisades
  — `onRequestDossier` returnerar nu acceptans och stagingConfirmed sätts
  bara vid `started`/`settled`.
- Backoffice (Streamlit) hanterades i F1: kolumnen «Kräver F3» → «Kräver
  integrationsbygge» i `ui_overview.py` / `ui_system_map.py`. Ingen ny
  Streamlit-yta — bara copy-synk mot runtime.
- OpenAI-acceptans (nyckel in → ett integrationsbygge → riktigt chatt-
  svar) är **inte** E2E-kört i Cloud-podden: injicerad `OPENAI_API_KEY`
  har ingen quota (429). Codegen gick via Anthropic. Det är ett
  miljöblock, inte ett kodblock.
