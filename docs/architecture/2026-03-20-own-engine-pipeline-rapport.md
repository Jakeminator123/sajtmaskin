# Own-engine pipeline — granskningsrapport

> Datum: 2026-03-20  
> Omfattning: stream-integritet, trunkeringspolicy, secrets/env-taxonomi, samt fem sammanfattade arkitekturpunkter.

---

## 1. Fem arkitekturpunkter (sammanfattning)

### 1.1 Tier, modell och Thinking

Byggmodellen styrs av tier i `src/lib/gen/defaults.ts`:

| Tier | Modell (default) | maxOutputTokens | reasoningEffort (Thinking på) |
|------|-------------------|-----------------|-------------------------------|
| fast | gpt-4.1 | 32 768 | none |
| pro | gpt-5.3-codex | 65 536 | medium |
| max | gpt-5.4 | 128 000 | high |
| codex | gpt-5.4 | 128 000 | xhigh |

`getReasoningEffort()` returnerar `"none"` om Thinking är av, oavsett tier.
`getEngineMaxOutputTokens()` faller tillbaka till env-variabeln `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` (default 128 000) om tier saknas.

### 1.2 Scaffold, dossier och mallreferenser i systemprompt

`buildSystemPrompt()` i `src/lib/gen/system-prompt.ts` bygger prompten i ordning:

1. **STATIC_CORE** (~6–8 K tokens, prompt-cache-optimerad, identisk varje request)
2. **Dynamiskt block**: build intent, visuell identitet, route-plan, kontrakt, KB-sökresultat, scaffold-filer, mall-referenssnippets, mediekatalog, designreferenser

Scaffold-filer serialiseras via `src/lib/gen/scaffolds/serialize.ts` med `buildFileContext()` som begränsar till `maxChars: 4000` och max 4 filer med innehåll (structural mode). Inspirational mode skickar bara filsökvägar + globals.css som tema-referens.

Dossier-/mallreferenser rankas med embedding-sökning i `rankTemplateReferences()` och klipper till max 3 träffar, max 2 snippets.

### 1.3 Determinism och cache

Prompt-caching bygger på att STATIC_CORE är en identisk strängliteral per request (aldrig templateliteral med interpolering). Det dynamiska blocket varierar, men OpenAI:s prefix-cache matchar det statiska prefixet.

Scaffold-matchning är deterministisk givet samma prompt och manifest-register — keyword-baserad (`src/lib/gen/scaffolds/matcher.ts`) med förutsägbar prioritetsordning.

### 1.4 Lint vs quality-gate

Huvudgenereringen kör **inte** `npm run lint` inline. Kvalitetsgrinden (`src/app/api/v0/quality-gate/route.ts`) stödjer `typecheck` och `build` som default; `lint` är valfritt men inte aktiverat som standard. Post-generation-passet kör esbuild-syntax-validering och LLM-fixer, inte en fullständig lintning av det genererade projektet.

### 1.5 Felbatchning och autofix-begränsningar

LLM-fixern (`src/lib/gen/autofix/validate-and-fix.ts`) klipper fel-listor till **8 poster** (`errors.slice(0, 8)`) innan de skickas till modellen. Maxantal syntax-pass styrs av `AUTOFIX_SYNTAX_MAX_PASSES` (default 6, env-konfigurerbar). Autofix-modellens token-budget är separat: `AUTOFIX_MAX_OUTPUT_TOKENS` (default 32 768).

---

## 2. Stream (own-engine)

### Flöde

```
engine.ts generateCode()
  → AI SDK streamText()  →  fullStream (async iterable)
  → stream-format.ts createCodeGenSSEStream()
     ├─ meta event
     ├─ thinking events (reasoning deltas)
     ├─ content events (text/code deltas)
     ├─ tool-call events
     ├─ done event (token-usage)
     └─ error event (vid fel)
  → SSE-formaterad ReadableStream<Uint8Array>
  → returneras direkt till klienten via route response
```

### Trunkeras själva svaret?

**Nej.** `createCodeGenSSEStream()` i `src/lib/gen/stream-format.ts` itererar hela `result.fullStream` utan att klippa, filtrera eller begränsa antalet `content`-events. Varje delta-chunk skickas rakt igenom som ett SSE-event. Det finns ingen logik i stream-formateraren som avbryter, trunkerar eller sammanfattar modellens output.

### Var kan flaskhalsar uppstå?

| Risk | Orsak | Konsekvens |
|------|-------|------------|
| **Token-tak** | `maxOutputTokens` når gränsen (t.ex. 32 768 på fast-tier) | Modellen avslutar svaret — koden kan bli ofullständig |
| **Timeout** | Vercel route-timeout eller `STREAM_SAFETY_TIMEOUT_DEFAULT_MS` (default 12 min) | Streamen avbryts med error |
| **Klientavbrott** | Användaren stänger fliken / navigerar bort → `AbortSignal` fires | Modellen avbryter, men det som redan skickats är OK |
| **Nätverks-SSE-buffring** | Mellanliggande proxy/CDN buffrar SSE | Sällsynt på Vercel, men kan ge fördröjd leverans |

Sammanfattat: modellens kodgenereringsström levereras komplett så länge inga yttre gränser (tokens, timeout, abort) slår in. Ingen intern trunkering av output sker.

---

## 3. Trunkering — policy och var det sker

All trunkering i pipelinen handlar om **kontext som matas in** till modellen, inte om modellens **output**. Syftet är att hålla prompten under kontroll och undvika att skicka mer kontext än modellen kan hantera effektivt.

### Kontexttrunkeringar (input till modellen)

| Var | Fil | Vad som kapas | Gräns |
|-----|-----|---------------|-------|
| Scaffold-filer | `scaffolds/serialize.ts` | Filinnehåll i prompt | `maxChars: 4000`, max 4 filer med innehåll |
| Route-plan | `system-prompt.ts` | Rutter i systemprompt | `.slice(0, 10)` |
| Integrationer | `system-prompt.ts` | Kontraktsposter | `.slice(0, 8)` |
| Env-variabler | `system-prompt.ts` | Env-listan | `.slice(0, 10)` |
| Must-have / avoid | `system-prompt.ts` | Brief-listor | `.slice(0, 10)` resp. `.slice(0, 8)` |
| Sidor och sektioner | `system-prompt.ts` | Sidlista, sektioner, bullets | `.slice(0, 10)`, `.slice(0, 14)`, `.slice(0, 8)` |
| KB-sökning | `context/knowledge-base.ts` | Sökträffar | `maxResults: 7`, `maxChars: 4000` |
| Mallreferenser | `system-prompt.ts` | Dossier-träffar, snippets | `.slice(0, 3)` referens, `.slice(0, 2)` snippets |
| Design-referenser | `system-prompt.ts` | Figma/bild-bilagor | `.slice(0, 6)` |
| Mediekatalog | `system-prompt.ts` | Media-alias | `.slice(0, 30)` |
| Kvalitets-checklist | `system-prompt.ts` | Scaffold quality checklist | `.slice(0, 6)` |
| Upgrade-mål | `system-prompt.ts` | Scaffold upgrade targets | `.slice(0, 5)` |
| Autofix-fel | `autofix/validate-and-fix.ts` | Fel till LLM-fixer | `.slice(0, 8)` |
| Fil-kontextbyggare | `context/file-context-builder.ts` | Filer med innehåll | `maxFilesWithContent` (default 4) |

### Bör något sammanfattas istället för att kapas?

Dessa punkter bör redan hanteras av befintlig logik, men är värda att kontrollera periodiskt:

- **Brief (texter/beskrivningar)** — `must-have` och `avoid`-listor kapas med hårda `.slice()`. Om en användare skickar 20 must-have-krav försvinner hälften utan notis. En alternativ approach vore att sammanfatta överskjutande punkter till en mening, men i praktiken håller de flesta briefs sig under 10 punkter.
- **Autofix-fel** — om ett pass har 30 fel skickas bara 8. Det är en rimlig strategi (fixen riktar sig mot de värsta felen först, och nästa pass fångar resten), men om de första 8 felen alla tillhör samma kategori kan viktiga fel missas. En förbättring vore att deduplisera per feltyp innan slicen.
- **Build-loggar** — trunkering av build-loggar sker inte i genererings-pipelinen. Preflight och quality-gate returnerar hela resultatet. Att trunkera build-loggar vore kontraproduktivt: ett avklippt build-fel gör felsökning omöjlig.

---

## 4. Secrets, databaser och integrationer — trevägsuppdelning

### Nivå 1: Sajtmaskin (appen själv)

Sajtmaskins server läser sin egen `.env.local` / Vercel Dashboard env. Dessa nycklar driver **appen**:

- `OPENAI_API_KEY` — kodgenereringsmodellen
- `DATABASE_URL` — Sajtmaskins egen Postgres (Prisma)
- `V0_API_KEY` — v0 fallback (soft-deprecated)
- `VERCEL_TOKEN`, `VERCEL_TEAM_ID` — deploy av användarens genererade sajt
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob för screenshots/assets
- Autentisering (Google, GitHub OAuth)

Dessa är **aldrig** synliga för slutanvändaren och har ingenting med det genererade projektet att göra.

### Nivå 2: Användarens genererade projekt

När motorn genererar kod som refererar till externa tjänster (Supabase, Stripe, Clerk, etc.) detekteras integrationer i två steg:

1. **Pre-generation** (`src/lib/gen/pre-generation-contracts.ts`) — prompten analyseras innan generering. Detekterade providers mappas till env-nycklar (t.ex. `NEXT_PUBLIC_SUPABASE_URL`, `STRIPE_SECRET_KEY`). Dessa skrivs in i systemprompt-kontexten så att modellen refererar till dem korrekt.

2. **Post-generation** (`src/lib/gen/detect-integrations.ts`) — den genererade koden skannas efter env-mönster (regex). Alla `process.env.XXX`-träffar som inte är "well-known public vars" samlas upp och rapporteras som integrationsbehov.

**Vart hamnar dessa nycklar?**

Vid deploy anropas `syncEnvVarsToVercelProject()` i `src/lib/vercelDeploy.ts` som **upsert:ar krypterade env-variabler på Vercel-projektet** via `/v10/projects/{id}/env`. De sätts med `target: ["production", "preview", "development"]` och `type: "encrypted"`.

Det innebär:
- Nycklarna hamnar i **Vercel Dashboard** (krypterade) — inte i en committad `.env`-fil i repot.
- De persisterar mellan omdeploy och git-push.
- Användaren kan redigera dem i Vercel Dashboard → Settings → Environment Variables.

**Nuvarande gap (önskat mål vs verklighet):**

Idag genereras kod med platshållar-env-nycklar (t.ex. `process.env.NEXT_PUBLIC_SUPABASE_URL`) men användaren måste själv fylla i faktiska värden inför deploy. Det finns inget steg som automatiskt ger standardvärden före deploy. En möjlig förbättring vore att Sajtmaskin under pre-deploy frågar användaren om faktiska nyckelvärden och skriver in dem via Vercel env-sync, med platshållare eller mock-värden under preview.

### Nivå 3: Plattformsleverantörer (Vercel, V0)

Vercel och V0 är **Sajtmaskins leverantörer**:

| Leverantör | Relation | Var nycklar lever |
|------------|----------|-------------------|
| **Vercel** | Hosting + deploy-API | `VERCEL_TOKEN`, `VERCEL_TEAM_ID` i Sajtmaskins `.env` |
| **V0** | Fallback-generator (soft-deprecated) | `V0_API_KEY` i Sajtmaskins `.env` |
| **OpenAI** | LLM-provider för egen motor | `OPENAI_API_KEY` i Sajtmaskins `.env` |

Dessa tre nivåer bör aldrig blandas ihop. Sajtmaskins egna nycklar är plattformshemligheter, slutanvändarens nycklar tillhör det genererade projektet, och leverantörsnycklar tillhör Sajtmaskins avtal med tredje part.

---

## 5. Verifiering denna session

Följande filer har granskats i kod (inte bara antagits):

- **Stream-integritet**: `src/lib/gen/engine.ts` (rad 40–102), `src/lib/gen/stream-format.ts` (rad 78–268) — fullStream itereras komplett, inga avklipp.
- **Trunkerings-ställen**: `src/lib/gen/system-prompt.ts` (alla `.slice()`-anrop), `src/lib/gen/scaffolds/serialize.ts` (`maxChars`), `src/lib/gen/autofix/validate-and-fix.ts` (`.slice(0, 8)`), `src/lib/gen/context/knowledge-base.ts` (`maxResults`, `maxChars`), `src/lib/gen/context/file-context-builder.ts` (`maxFilesWithContent`).
- **Env-taxonomi**: `src/lib/vercelDeploy.ts` (`syncEnvVarsToVercelProject`, `createVercelDeployment` → `env`/`build.env`), `src/lib/gen/pre-generation-contracts.ts` (provider-rules med envVars), `src/lib/gen/detect-integrations.ts` (post-gen scanning), `src/lib/gen/setup-contract.ts` (env-gruppering).
- **Tier/modell-konfiguration**: `src/lib/gen/defaults.ts` (alla exporter och TIER-maps).

---

## 6. Git / arbetskatalog

Innan denna rapport existerade tre orelaterade ändringar i arbetsträdet:

| Fil | Källa | Åtgärd |
|-----|-------|--------|
| `src/components/builder/ModelTraceOverlay.tsx` | Äldre lokal redigering | Inkludera i commit om du vill, eller nollställ om ändringen var experimentell |
| `src/lib/gen/scaffolds/matcher.ts` | Äldre lokal redigering | Samma — granska diffen innan commit |
| `docs/agent-session-check.md` | Kort stub skapad av en agent-session ("Verifiera att ändringar syns i nästa chatt") | Ofarlig; behåll som workspace-verifiering eller ta bort |

Rekommendation: commita denna rapport separat eller tillsammans med dessa filer, men granska varje fil individuellt. Blanda inte in orelaterade ändringar från andra branchar.
