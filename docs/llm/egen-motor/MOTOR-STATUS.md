# Motor-status: Egen kodgenereringsmotor

> Senast uppdaterad: 2026-03-12 (plan-mode + trust/readiness-pass)

## Arkitektur

```
Användarens prompt
       │
       ▼
┌──────────────────────────────┐
│  PROMPT ASSIST               │
│  - Polish: gpt-4.1-mini     │
│  - Deep Brief: gpt-5.4      │
│  (via AI Gateway)            │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  PRE-GENERATION              │
│  - Prompt-orkestrering       │
│  - Scaffold-matchning (9 st) │
│  - URL-komprimering          │
│  - Dynamisk kontext (KB)     │
│  - Brief -> system prompt    │
│  - buildSystemPrompt()       │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  GENERATION (4 tiers)        │
│  Fast:      gpt-4.1          │
│  Pro:       gpt-5.3-codex    │
│  Max:       gpt-5.4          │
│  Codex Max: gpt-5.1-codex-max│
│  (alla via OPENAI_API_KEY)   │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  POST-GENERATION             │
│  finalizeAndSaveVersion():   │
│  1. 7-stegs autofix          │
│  2. esbuild-validering       │
│  3. URL-expansion            │
│  4. Fil-parsning             │
│  5. Scaffold-merge + varning │
│  6. Import-checker (scaffold)│
│  7. Version-sparning         │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  PREVIEW & DELIVERY          │
│  - Preview-render (iframe)   │
│  - Nedladdning (zip)         │
│  - Deploy (Vercel API)       │
└──────────────────────────────┘
```

## Modellmappning (egen motor)

Canonical build profiles live in `docs/schemas/model-build-profiles.md`.

| Build profile | Fallback-v0-ID | OpenAI-modell | Användning |
|---------------|----------------|---------------|------------|
| **Fast** (`fast`) | `v0-max-fast` | `gpt-4.1` | Snabba ändringar, enkla sidor |
| **Pro** (`pro`) | `v0-1.5-md` | `gpt-5.3-codex` | Kodspecialiserad, balanserad |
| **Max** (`max`) | `v0-1.5-lg` | `gpt-5.4` | Flaggskepp, bäst reasoning |
| **Codex Max** (`codex`) | `v0-gpt-5` | `gpt-5.1-codex-max` | Kodgenerering med xhigh reasoning |

Default selected profile: **Max** (`max`)

## API-nycklar

| Flöde | Nyckel |
|-------|--------|
| Kodgenerering | `OPENAI_API_KEY` (direkt mot OpenAI) |
| Prompt Assist | `AI_GATEWAY_API_KEY` (Vercel AI Gateway) |
| Deep Brief | `AI_GATEWAY_API_KEY` (gateway-only) |
| V0-fallback | `V0_API_KEY` (bara om `V0_FALLBACK_BUILDER=y`) |

## Scaffold-system (9 scaffolds)

landing-page, saas-landing, portfolio, blog, dashboard, auth-pages, ecommerce, content-site, app-shell

Matcher: keyword-baserad med ordgräns-regex, svenska + engelska.
Scaffold-kontext injiceras i system prompt (inte user message).
Import-checker körs efter merge.

## Implementerat

| Modul | Filer | Status |
|-------|-------|--------|
| Kodgenerering (4 tiers) | `src/lib/gen/engine.ts` | Fungerar |
| Systemprompt (~17K tokens) | `src/lib/gen/system-prompt.ts` | Fungerar |
| 12 suspense-regler | `src/lib/gen/suspense/rules/*` | Fungerar |
| 7-stegs autofix | `src/lib/gen/autofix/*` | Fungerar |
| Scaffold-import-checker | `src/lib/gen/autofix/rules/scaffold-import-checker.ts` | Ny |
| finalizeAndSaveVersion | `src/lib/gen/stream/finalize-version.ts` | Ny |
| Empty-output guard | `src/lib/gen/stream/finalize-version.ts` + stream routes | Ny |
| AI SDK stream-event loggning | `src/lib/gen/stream-format.ts` | Ny |
| Merge med varningar | `src/lib/gen/version-manager.ts` | Förbättrad |
| esbuild syntax-validering | `src/lib/gen/autofix/syntax-validator.ts` | Fungerar |
| LLM fixer | `src/lib/gen/autofix/llm-fixer.ts` | Fungerar |
| Säkerhetsmodul | `src/lib/gen/security/*` | Fungerar |
| 50 docs-snippets + KB | `src/lib/gen/data/docs-snippets.ts` | Fungerar |
| 792 Lucide-ikoner | `src/lib/gen/data/lucide-icons.ts` | Fungerar |
| Preview-render | `src/lib/gen/preview.ts` | Fungerar |
| Projekt-scaffold | `src/lib/gen/project-scaffold.ts` | Fungerar |
| 9 scaffolds | `src/lib/gen/scaffolds/*/manifest.ts` | Alla klara |
| Plan-mode + review-step | `src/app/api/v0/chats/stream/route.ts`, `src/app/api/v0/chats/[chatId]/stream/route.ts`, `src/components/builder/BuildPlanCard.tsx` | Ny |
| Readiness + launch-gating | `src/app/api/v0/chats/[chatId]/readiness/route.ts`, builder-UI, deploy-actions | Ny |

## Kända kvarvarande begränsningar

- KB-sökning är keyword-baserad (embedding planerad men ej implementerad)
- Preview stubs approximerar shadcn -- inte pixelperfekt
- Ingen scaffold-medveten retry vid generingsfel
- Multipage/site-planering finns nu i planartefakten, men inte som fullt
  persistad chat-sanning eller scaffold-medveten retry
- Plan-mode är i praktiken own-engine-only; v0-fallback bypassar fortfarande den
  review-driven vägen

## Nya skydd och beteenden

- Första generationer som returnerar `contentLen: 0` sparas inte längre som scaffold-baserade fejkversoner.
- Create/send-streams loggar nu en sammanfattning av AI SDK-eventtyper och tool-calls för enklare felsökning av tomma streams.
- Scaffold-serialisering känner nu igen fler svenska kreativa nyckelord (`djungel`, `70-talet`, `kamouflage`, `taktisk`, m.fl.) och instruerar modellen att skriva om placeholder-copy tydligare.
- Systemprompten instruerar nu modellen att undvika preview-osäkra globala beroenden som `Canvas` och `Autoplay`; klienttunga bibliotek ska importeras explicit eller ges fallback.
- Follow-up-streamen anvander nu samma agent-tools som create-streamen, sa modellen kan stanna och skicka `askClarifyingQuestion` / integrationssignaler aven efter forsta versionen.
- Capability inference markerar nu databasprompter separat (`needsDatabase`) och hintar uttryckligen att modellen inte far gissa Prisma/Supabase/SQLite/provider utan bekraftelse.
- Env-audit for admin skiljer nu pa `local_only`, `environment_specific`, `shared_runtime` och target-tackning pa Vercel, sa lokal `.env.local` och Vercel-targets kan granskas utan blind sync.
- Create/send-streams kan nu koras i ett riktigt plan-lage for own-engine chats,
  med rikare `PlanArtifact`, blocker-fragor, review-card och en explicit
  approve -> build-brygga.
- Planner-svaret persisteras idag som sammanfattad chat-text, medan den fulla
  review-kortstrukturen fortfarande lever i `uiParts`; det ar sista stora
  Phase 8-glappet innan planner-lagret ar helt serverforankrat.
