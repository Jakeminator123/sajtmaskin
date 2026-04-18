# Fas 2 — Orkestrering och Build

Vad som händer från att Fas 1 levererar prompt + brief till att en version är sparad i databasen.

**Ordlista:** `docs/architecture/glossary.md`. **Kod är source of truth.**

---

## Orkestrering (`orchestrate.ts`)

### `prepareGenerationContext()` — huvudflödet

Samlar alla signaler till en komplett LLM-input i tre steg:

1. **`resolveOrchestrationBase()`** — deterministiska beslut
2. **`finalizeOrchestrationPrompts()`** — bygger system prompt
3. **`buildGenerationInputPackage()`** — slutpaket + debug-dump

### Signaler som samlas (steg 1)

| Signal | Källa | Deterministisk? |
|--------|-------|-----------------|
| Capabilities | `inferCapabilities(prompt)` — regex | Ja |
| Generation mode | `"init"` / `"followUp"` från `persistedScaffoldId` | Ja |
| Scaffold + variant | `matchScaffoldAuto()` eller `persistedScaffoldId` | Delvis (embedding = API) |
| Shadcn-exempel | `loadShadcnExamples()` + `fetchMissingRegistryExamples()` | Nätverksanrop |
| Community blocks | `fetchCommunityBlocks()` | Nätverksanrop |
| Capability hints | `buildCapabilityHints()` — markdown-tips | Ja |
| Route plan | `buildRoutePlan()` | Ja |
| Pre-generation contracts | `inferPreGenerationContracts()` | Ja |
| BuildSpec | `deriveBuildSpec()` | Ja |
| Orchestration contract | `buildOrchestrationContract()` | Ja |
| Scaffold-serialisering | `serializeScaffoldForPrompt()` med budget | Ja |

---

## BuildSpec (`build-spec.ts`)

En **härledd policy-bundle** som styr hela körningen.

### Nyckelparametrar

| Parameter | Möjliga värden | Vad det styr |
|-----------|---------------|--------------|
| `changeScope` | `copy`, `local-layout`, `page-addition`, `redesign`, `integration` | Hur stor ändring prompten begär |
| `qualityTarget` | `standard`, `premium`, `release-candidate` | Kvalitetskrav på output. `release-candidate` sätts numera bara när `previewPolicyOverride === "fidelity3"` (F3-trigger). |
| `contextPolicy` | `light`, `normal`, `heavy` | Token-budget (se nedan) |
| `previewPolicy` | `fidelity2`, `fidelity3` | F2 = design-loopen (default). F3 = "Bygg integrationer" — sätts via `DeriveBuildSpecParams.previewPolicyOverride`, triggas explicit av `POST /api/engine/chats/[chatId]/finalize-design`. |
| `verificationPolicy` | `fast`, `standard`, `strict` | Verifier-inställning |
| `routeRealization` | `null`, `primary-full-with-shells` | Om extra routes skjuts upp |
| `forbiddenPatterns` | Symboliska flaggor | T.ex. `unrequested_full_redesign` |

### Token-budgetar per contextPolicy

| Policy | scaffoldTokens | refsTokens | systemContextTokens |
|--------|---------------|------------|---------------------|
| `light` | 11 250 | 3 750 | 15 000 |
| `normal` | 18 000 | 9 000 | 40 000 |
| `heavy` | 25 000 | 12 500 | 50 000 |

---

## System Prompt (`system-prompt.ts`)

### Uppbyggnad

```
┌──── STATISK KÄRNA (prefix-cache) ────────────────────────┐
│  Core Rules (config/prompt-core/*.md)                     │
│  Laddas en gång per process via codegen-core-manifest.json│
└──────────────────────────────────────────────────────────┘
                    --- separator ---
┌──── DYNAMISK KONTEXT (per request) ─────────────────────┐
│  20+ markdown-block med ## rubriker, prioriterade        │
│  och prunade efter token-budget                          │
└──────────────────────────────────────────────────────────┘
```

### Dynamisk kontext — block i ordning

`buildDynamicContext()` bygger dessa block:

1. **Generation Mode** — `## Generation Mode: Follow-Up` (vid follow-up)
2. **Custom instructions + Build Intent**
3. **Generation Profile** — style pack, quality, forbidden patterns
4. **Scaffold Variant** — typografi, motif, theme tokens, guidance
5. **Design Priority** — hierarki: locked theme → brief → variant → scaffold CSS
6. **Structural References** — variant/capability file excerpts (bara init)
7. **Scaffold** — serialiserade filer (från `serialize.ts`)
8. **Scaffold Research Priorities** — checklist, upgrade targets, reference templates
9. **Your Toolkit** — shadcn-komponenter + capability hints + palett
10. **Route Plan** — planerade routes med shell-policy
11. **Pre-generation Contracts** — data mode, providers, env vars
12. **Project Context** — brief-härledda fält, pages, must-have/avoid
13. **Visual Identity + Design References**
14. **Coding Direction** — kommer från `prompt-core/03-visual-design.md` + `04-coding-direction.md` i Core Rules ovanför separator (sedan directive cascade togs bort 2026-04-18)
15. **Imagery + Media Catalog**
16. **Component References** — upp till 5 fenced shadcn-exempel
17. **SEO**

### Pruning

Hela dynamiska strängen splitas på `## `-rubriker. Varje block får en **prioritet** och en **required**-flagga från `CONTEXT_BLOCK_PRIORITY_RULES`. Required-block behålls alltid; resten fylls i prioritetsordning tills `systemContextTokens`-budgeten tar slut.

---

## Scaffold-serialisering (`serialize.ts`)

### Två lägen

| Läge | När | Vad LLM:en ser |
|------|-----|-----------------|
| `inspirational` | Init (default) | Filträd + korta layout/theme-excerpts + "designa fritt, kopiera inte" |
| `structural` | Follow-up / heavy context | Fullständigt filinnehåll (3–4 kritiska filer), budgeterat mot `maxChars` |

Lightweight structural (default): filträd + `selectCriticalScaffoldFiles()` (3 filer vid `light`, 4 annars), sorterade efter kritisk path-score justerat för route/capability-relevans.

---

## LLM-anropet (`engine.ts`)

`generateCode()` använder Vercel AI SDK `streamText`:

- **Modell**: OpenAI (default) eller Anthropic (om `modelId` börjar med `claude-`)
- **System**: Komplett system prompt från orkestrering
- **Messages**: Valfri chat-historik + user-meddelande
- **Thinking**: Om på → `providerOptions` med Anthropic `thinking: { type: "adaptive" }` eller OpenAI `reasoningEffort`
- **Tools/Steps**: Upp till 4 steg (tool use)

Returnerar `createCodeGenSSEStream()` → SSE-ström till klienten.

### SSE-events

| Event | Innehåll |
|-------|----------|
| `meta` | chatId, versionId |
| `progress` | phase: start → reasoning → awaiting-output → done |
| `thinking` | Reasoning-deltas (om thinking är på) |
| `content` | Kodtext-deltas |
| `tool-call` | Tool-anrop med args |
| `error` | Felmeddelande |
| `done` | Token-användning |

---

## Finalize (`finalize-version.ts`)

### Pipeline (efter att LLM-streamen avslutats)

Definierad i `finalize-pipeline-contract.ts`:

| Steg | Vad | Typ |
|------|-----|-----|
| 1. **url_expand** | Expandera förkortade URL:er (`{{MEDIA_N}}` → riktiga URL:er). Körs först så autofix ser riktiga import-paths. | Deterministisk |
| 2. **autofix** | ~24 mekaniska fixar (imports, JSX, fonts, metadata, etc.) | Deterministisk |
| 3. **validate_syntax** | esbuild-validering + ev. LLM-fixer-loop (max 180s) | Hybrid |
| 4. **materialize_images** | Byt placeholder-bilder mot Unsplash (6–8 st) | Nätverksanrop |
| 5. **verifier** | Read-only LLM-granskning: `blocking` / `quality` findings | LLM |
| 6. **parse_merge_preflight** | Parse → merge med befintliga filer → preflight-kontroller → persist | Deterministisk |

### Autofix-detaljer

`runAutoFix()` kör upp till `DETERMINISTIC_AUTOFIX_MAX_PASSES` iterationer av ~24 fixar:

Imports (use-client, react, next/image, lokala symboler, cn-utility, lucide), font-hantering, metadata-konflikter, icon-fixer, tailwind arbitrary values, scroll-smooth, esbuild syntax-validering, JSX-kontroll, dependency-komplettering, basepath-fix, säkerhetskontroller.

Alla är **mekaniska** (regex/AST). Ingen LLM i autofix.

### LLM-fixer (separat)

`runLlmFixer()` — eskalerad reparation med dedikerad LLM. Körs bara via `validateAndFix()` om mekanisk autofix inte räckte, eller vid partial-file-reparation.

### Light vs Full finalize path

| Path | Villkor | Steg som hoppas över |
|------|---------|---------------------|
| **Full** (default) | Init eller komplex follow-up | Inga |
| **Light** | Follow-up + `verificationPolicy === "fast"` + `contextPolicy === "light"` + scope `copy`/`local-layout` | `materialize_images`, `verifier` |

### Persist

`addAssistantMessageAndCreateDraftVersion()` (init) eller `addAssistantMessageAndUpdateExistingVersion()` (follow-up med `targetVersionId`). Därefter orchestration snapshot-merge på chatten.

---

## Pre-generation Contracts (`pre-generation-contracts.ts`)

`inferPreGenerationContracts()` producerar:

- **dataMode**: `none` / `mocked` / `persisted` / `mixed`
- **providers**: `databaseProvider`, `authProvider`, `paymentProvider`
- **integrations[]**, **envVars[]**
- **unresolvedDecisions**, **confirmedAnswers**

Defaults: NextAuth Credentials om `needsAuth`; Stripe test-placeholders om betalning; SQLite om persistence. Blockerar aldrig preview.

---

## Init vs Follow-up

| | Init | Follow-up |
|---|---|---|
| Scaffold-serialisering | `inspirational` | `structural` |
| Variant structural files | Ja | Bara om `isFirstCodeGeneration` |
| Template guidance | Ja (om refs finns) | Bara om `isFirstCodeGeneration` |
| Route plan | Fri planering + ev. shell deferral | Shell preservation + frys |
| Finalize path | Full (typiskt) | Light möjlig för small copy/layout |
| Merge | Ren version | `mergeGeneratedProjectFiles` med `previousFiles` |

---

## Kodfiler

| Steg | Fil |
|------|-----|
| Orkestrering | `src/lib/gen/orchestrate.ts` |
| System prompt | `src/lib/gen/system-prompt.ts` |
| BuildSpec | `src/lib/gen/build-spec.ts` |
| LLM-anrop | `src/lib/gen/engine.ts` |
| SSE-formatering | `src/lib/gen/stream/stream-format.ts` |
| Scaffold-serialisering | `src/lib/gen/scaffolds/serialize.ts` |
| Finalize | `src/lib/gen/stream/finalize-version.ts` |
| Finalize-kontrakt | `src/lib/gen/stream/finalize-pipeline-contract.ts` |
| Autofix-pipeline | `src/lib/gen/autofix/pipeline.ts` |
| LLM-fixer | `src/lib/gen/autofix/llm-fixer.ts` |
| Syntax-validering | `src/lib/gen/autofix/validate-and-fix.ts` |
| Pre-gen contracts | `src/lib/gen/contract/pre-generation-contracts.ts` |
| Verifier | `src/lib/gen/verifier/` |
| Core Rules | `config/prompt-core/*.md` (5 filer inkl. visual-design + coding-direction) |
