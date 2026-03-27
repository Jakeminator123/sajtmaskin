# Handoff: Kontraktsförenkling och automatiska integrationer

**Mål:** **Färre** blockerande frågor i LLM-kedjan, **fler** säkra defaults för sandbox (Fidelity 2), och **automatisk** koppling av integrationer/env utan att störa codegen — i linje med [`.cursor/rules/integrations-policy.mdc`](../../.cursor/rules/integrations-policy.mdc).

**Prioritet:** Medel–hög — påverkar när `pre-generation-contract-gate` stoppar streamen.

**Kanoniska källor:**  
[`docs/schemas/integrations-and-data.md`](../schemas/integrations-and-data.md) (om aktuell) · [`src/lib/integrations/integration-manifest.ts`](../../src/lib/integrations/integration-manifest.ts) · [`config/env-policy.json`](../../config/env-policy.json)

---

## 1. Nuvarande beteende (kort)

- [`src/lib/gen/pre-generation-contracts.ts`](../../src/lib/gen/pre-generation-contracts.ts) — `inferPreGenerationContracts`, defaults (SQLite, Credentials, Stripe test, m.m.), `unresolvedDecisions`.
- [`src/lib/gen/contract-clarification.ts`](../../src/lib/gen/contract-clarification.ts) — prioritet: auth → payment → database → integration → **env**; `blocking: true`.
- [`src/lib/providers/own-engine/pre-generation-contract-gate.ts`](../../src/lib/providers/own-engine/pre-generation-contract-gate.ts) — SSE: `askClarifyingQuestion`, `awaitingInput`, stoppar generation tills svar finns.
- [`src/lib/gen/build-generated-site-env.ts`](../../src/lib/gen/build-generated-site-env.ts) · [`src/lib/project-env-vars.ts`](../../src/lib/project-env-vars.ts) — projekt-env till sandbox `.env.local`.
- [`src/lib/integrations/inject-integration-manifest.ts`](../../src/lib/integrations/inject-integration-manifest.ts) — manifest i `files_json` vid finalize.

**Problem:** Även med många defaults kan **`env`**-bucket eller andra `unresolvedDecisions` fortfarande **pausa** kedjan — motsvarar inte målet “inga frågor som skadar flödet”.

---

## 2. Princip: två nivåer av “kontrakt”

| Nivå | Syfte | UI / flöde |
|------|--------|------------|
| **Preview / sandbox (Fidelity 2)** | Ska alltid kunna köra `npm run dev` | **Inga** blockerande frågor — placeholders + `sajtmaskin.integration-manifest.json` + [`config/env-policy.json`](../../config/env-policy.json) |
| **Produktion / deploy (Fidelity 3)** | Riktiga nycklar och providers | Användarinställningar, projekt-env UI, eller separat “production checklist” **efter** preview |

Implementation ska **inte** kräva att användaren svarar på auth/database **före** första generation om målet är sandbox-preview.

---

## 3. Konkreta åtgärder

### 3.1 Töm `unresolvedDecisions` för första generation (eller gör env icke-blockerande)

- I `inferPreGenerationContracts`: **lägg inte** `env` i `unresolvedDecisions` för typiska landningssidor / när placeholders räcker (se befintliga “skip”-kommentarer i kod — utöka konsekvent).
- Alternativ: behåll spårning i telemetri men **gör inte** `buildContractClarificationQuestion` för env på första pass — användaren fyller projekt-env i dashboard senare.

### 3.2 `buildContractClarificationQuestion` — returnera `null` som default

- Endast om användaren explicit valt **“produktionsklar med X”** eller liknande flagga i UI — annars **inga** blocking-frågor.
- Om ni behåller en fråga: gör den **icke-blockerande** (varning i UI) eller flytta till **efter** första version.

**Fil:** [`src/lib/gen/contract-clarification.ts`](../../src/lib/gen/contract-clarification.ts).

### 3.3 Flytta “kontraktsfan-in” till `GenerationInputPackage`

- När [`llm-kedja-och-generationskvalitet.md`](llm-kedja-och-generationskvalitet.md) inför paketet: **confirmed contracts** + defaults ska ingå i paketet så codegen alltid ser samma sanning som finalize.

### 3.4 Integration manifest

- [`src/lib/integrations/inject-integration-manifest.ts`](../../src/lib/integrations/inject-integration-manifest.ts) + [`src/lib/gen/detect-integrations.ts`](../../src/lib/gen/detect-integrations.ts) (om används): säkerställ att **detekterad** stack (t.ex. Prisma, Stripe) får **korrekta** stubbar och env-namn enligt kanon — **inga** påhittade providernamn i copy (integrations-policy).

### 3.5 Sandbox `.env.local`

- Verifiera att [`buildSandboxEnvLocalContents`](../../src/lib/gen/sandbox-preview.ts) / [`buildGeneratedSiteEnv`](../../src/lib/gen/build-generated-site-env.ts) alltid sätter **tillräckliga** dummy-värden för `npm run dev` när integrationer infererats (jfr. [`docs/handoffs/scaffold-sandbox-findings-och-llm-uppfoljning.md`](scaffold-sandbox-findings-och-llm-uppfoljning.md) om DB-import vid test).

---

## 4. SSE och UX

- Om gate tas bort: uppdatera builder så **ingen** tom “awaiting input” för contracts vid standardflöde.
- Om ni behåller `awaitingInput` för **edge cases**: dokumentera att nästa [`POST .../stream`](../../src/app/api/v0/chats/[chatId]/stream/route.ts) **återinträder** i kedjan (redan så i nuvarande implementation).

---

## 5. Acceptanskriterier

- [ ] Ny användare med enkel prompt → **ingen** `pre_generation_contracts`-stop innan codegen (såvida inte explicit produktionsläge).
- [ ] Sandbox startar med infererade integrationer utan att användaren matat in nycklar.
- [ ] `sajtmaskin.integration-manifest.json` stämmer med faktisk kod och env-policy.
- [ ] Färre grenar i UI för “obligatoriska” val — mer defaults + efterhandsinställning.

---

## 6. Tester

- Uppdatera golden tests för [`pre-generation-contract-gate`](../../src/lib/providers/own-engine/pre-generation-contract-gate.golden.test.ts) om SSE ändras.
- Enhetstest: `inferPreGenerationContracts` + `buildContractClarificationQuestion` → `null` för representativa prompts.

---

## 7. Risker

- **För** aggressiv default kan generera kod som **ser** ut att prata med riktig DB — mitigering: tydliga kommentarer + testläge i env + manifest.
- Synka med juridik/copy om betalning/auth — använd **test keys** endast i manifest och dokumentera i [`docs/ENV.md`](../ENV.md).

---

*Handoff skapad för own-engine-upprustning. Se `llm-kedja-och-generationskvalitet.md` och `autofix-och-quality-gates.md`.*
