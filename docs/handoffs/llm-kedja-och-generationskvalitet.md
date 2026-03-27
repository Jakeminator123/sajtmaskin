# Handoff: LLM-kedja och generationskvalitet (own-engine)

**Mål:** Göra own-engine-spåret till leverantör av **högkvalitativa** sidor — inte tunna scaffold-teman med kvarvarande hakparentes-placeholders — med tydlig **fan-in** av all kontext innan codegen och valfri **polish** efter första passet.

**Prioritet:** Hög — direkt produktvärde (Fidelity 2 i sandbox som “sanning”, scaffold som golv).

**Kanoniska källor:**  
[`docs/handoffs/scaffold-sandbox-findings-och-llm-uppfoljning.md`](scaffold-sandbox-findings-och-llm-uppfoljning.md) · [`docs/architecture/preview-deploy.md`](../architecture/preview-deploy.md) · [`config/prompt-static/`](../../config/prompt-static/) · [`docs/schemas/model-build-profiles.md`](../schemas/model-build-profiles.md) (om aktuell)

---

## 1. Nuvarande flöde (kort)

1. [`src/lib/gen/orchestrate.ts`](../../src/lib/gen/orchestrate.ts) — `resolveOrchestrationBase` (scaffold, capabilities, route plan, contracts) → `finalizeOrchestrationPrompts` → `engineSystemPrompt` + `v0EnrichmentContext`.
2. [`src/lib/gen/system-prompt.ts`](../../src/lib/gen/system-prompt.ts) — statisk kärna + `buildDynamicContext` (brief, scaffold, KB, template references, m.m.).
3. [`src/lib/gen/generation-pipeline.ts`](../../src/lib/gen/generation-pipeline.ts) → [`src/lib/gen/engine.ts`](../../src/lib/gen/engine.ts) — `streamText`, SSE ut.
4. [`src/lib/gen/stream/finalize-merge.ts`](../../src/lib/gen/stream/finalize-merge.ts) — merge modell + scaffold.
5. Preflight/sandbox — se `autofix-och-quality-gates.md`.

**Problem att lösa:** Parallella “försteg” (brief, route, contracts, scaffold) **måste** mynna ut i ett **enda** generation-underlag — annars halvagentiskt beteende (jfr. diskussion i [`docs/handoffs/bilder/konversation.txt`](bilder/konversation.txt)).

---

## 2. Leverans 1: Ett explicit `GenerationInputPackage` (fan-in)

**Syfte:** En typ + en serialiseringsfunktion som är **enda källan** till vad som matas in i dynamisk kontext och (valfritt) loggas spårbart.

**Föreslagna fält (minimum):**

| Fält | Källa i kod idag |
|------|------------------|
| `normalizedPrompt` / `userPrompt` | orchestration input |
| `brief` | brief pipeline |
| `designIntent` | utökad från brief + ev. `prompt-static` 04/11 |
| `routePlan` | [`src/lib/gen/route-plan.ts`](../../src/lib/gen/route-plan.ts) |
| `contracts` | `inferPreGenerationContracts` |
| `selectedScaffold` | registry + `serializeScaffoldForPrompt` |
| `scaffoldMode` | `detectScaffoldMode` i [`serialize.ts`](../../src/lib/gen/scaffolds/serialize.ts) |
| `capabilityHints` | `inferCapabilities` |
| `templateReferenceSnippets` | ranking i `buildDynamicContext` |
| `retrievalHits` | KB om aktiverat |

**Implementation:**

- Inför typ i t.ex. `src/lib/gen/generation-input-package.ts` (namn kan justeras).
- Låt `prepareGenerationContext` / `finalizeOrchestrationPrompts` **bygga** detta objekt först, sedan `buildSystemPrompt({ ... })` med **en** parameter som speglar paketet (undvik duplicerad logik mellan `dynamicOpts` och dump).
- Uppdatera [`src/lib/gen/prompt-dump.ts`](../../src/lib/gen/prompt-dump.ts) så dev-dump kan skriva **paketet** (JSON) + full prompt — lättare att debugga.

**Acceptans:** E2E-test eller etthetstest: samma prompt → samma paket-hash (minus tidsberoende).

---

## 3. Leverans 2: Scaffold-serialisering som “golv”, inte bara paths

**Fil:** [`src/lib/gen/scaffolds/serialize.ts`](../../src/lib/gen/scaffolds/serialize.ts)

**Problem:** Läget `inspirational` sparar tokens men riskerar att modellen **inte** ser tillräckligt för att ersätta placeholders och bygga ut.

**Riktlinjer:**

- **Minst:** För `inspirational`, inkludera alltid **full `globals.css`**, **layout.tsx**, **hero/page** för vald scaffold — inte bara path-lista.
- **Tydlig instruktion:** I serialiserad text — “ersätt alla `[placeholder]` med faktisk copy baserat på användarens prompt; inga hakparenteser i hero/CTA efter klar generation.”
- **En scaffold i taget:** Förbättra t.ex. `ecommerce` manifest (design tokens, färre tomma rutor) — höjer golvet för alla anrop (se scaffold-handoff).

**Acceptans:** Manuell granskning + ev. liten regex-check i test: inga `\[[^\]]+\]` kvar i `app/page.tsx` efter polish (valfritt).

---

## 4. Leverans 3: Deep Brief vs uppföljningar

**Syfte:** Första meddelandet ska kunna producera en **Deep Brief** (spec) som **låser** ton, målgrupp, sidor, och constraints — som sedan **återanvänds** i follow-ups utan att användaren upprepar sig.

**Konkret:**

- Om `promptOrchestration` / plan-läge redan har brief — **prioritera** brief-blocket i `buildDynamicContext` över rå prompt i follow-ups.
- Dokumentera i en kodkommentar: *Deep Brief = initierande spec; follow-ups = delta mot samma paket.*

**Filer:** [`src/lib/builder/promptOrchestration.ts`](../../src/lib/builder/promptOrchestration.ts), [`src/lib/gen/system-prompt.ts`](../../src/lib/gen/system-prompt.ts).

---

## 5. Leverans 4: Polish-pass (valfri andra LLM-runda)

**Syfte:** Efter första `CodeProject`-output, innan finalize merge eller direkt efter parse men före tung sandbox: köra en **kort** pass som bara:

- tar bort kvarvarande placeholders,
- harmoniserar typografi/spacing tokens,
- säkerställer CTA + nav/footer enligt `11-behavioral-rules`.

**Implementation:**

- Ny modul t.ex. `src/lib/gen/polish-pass.ts` (eller steg i `finalize-version.ts` bakom flagga `SAJTMASKIN_POLISH_PASS=1`).
- Använd **lägre** max tokens / snabbare modell från [`src/lib/models/`](../../src/lib/models/) — profil “polish” om den finns i schema.
- **Cap:** max 1 polish, timeout, avbryt om inget ändrats.

**Risk:** Dubbel kostnad — gate med feature flag och mätning.

---

## 6. Leverans 5: Städa `v0EnrichmentContext`

När V0-platform inte längre används:

- Ta bort `v0EnrichmentContext` från `finalizeOrchestrationPrompts` om inga konsumenter.
- Sök repo: `v0EnrichmentContext` — endast own-engine ska behöva `engineSystemPrompt`.

**Fil:** [`src/lib/gen/orchestrate.ts`](../../src/lib/gen/orchestrate.ts).

---

## 7. Token-budget och modellval

- Granska `ENGINE_MAX_OUTPUT_TOKENS` och default-modell i [`src/lib/gen/engine.ts`](../../src/lib/gen/engine.ts) och [`src/lib/models/selection.ts`](../../src/lib/models/selection.ts) (eller motsvarande).
- Dokumentera i PR: *stora flersidorsprojekt* kan behöva högre tak eller uppdelning — undvik “tyst trunkering”.

---

## 8. Acceptanskriterier

- [ ] Ett `GenerationInputPackage` (eller likvärdigt) byggs och loggas spårbart.
- [ ] Scaffold-text + prompts instruerar uttryckligen om **riktig copy** och **inga** bracket-placeholders i hero.
- [ ] (Valfritt) Polish-pass bakom flagga fungerar utan att bryta SSE/finalize.
- [ ] `v0EnrichmentContext` borttagen eller oanvänd när V0 är borta.

---

## 9. Tester

- Vitest för orchestration: snapshot av paketets nyckelord (utan embeddings).
- Golden tests för generation-stream om befintliga — uppdatera vid promptändring.

---

*Handoff skapad för own-engine-upprustning. Se `autofix-och-quality-gates.md` för reparationskedjan och `kontrakt-forenkling-och-integrationer.md` för kontraktsflödet.*
