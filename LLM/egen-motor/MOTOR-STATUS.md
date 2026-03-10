# Motor-status: Egen kodgenereringsmotor

> Senast uppdaterad: 2026-03-10 (efter Fas 4-5)

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

| UI-tier | v0 tier-ID | OpenAI-modell | Användning |
|---------|-----------|---------------|------------|
| **Fast** | v0-max-fast | `gpt-4.1` | Snabba ändringar, enkla sidor |
| **Pro** | v0-1.5-md | `gpt-5.3-codex` | Kodspecialiserad, balanserad |
| **Max** | v0-1.5-lg | `gpt-5.4` | Flaggskepp, bäst reasoning |
| **Codex Max** | v0-gpt-5 | `gpt-5.1-codex-max` | Kodgenerering med xhigh reasoning |

Default: **Pro** (`gpt-5.3-codex`)

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
| Merge med varningar | `src/lib/gen/version-manager.ts` | Förbättrad |
| esbuild syntax-validering | `src/lib/gen/autofix/syntax-validator.ts` | Fungerar |
| LLM fixer | `src/lib/gen/autofix/llm-fixer.ts` | Fungerar |
| Säkerhetsmodul | `src/lib/gen/security/*` | Fungerar |
| 50 docs-snippets + KB | `src/lib/gen/data/docs-snippets.ts` | Fungerar |
| 792 Lucide-ikoner | `src/lib/gen/data/lucide-icons.ts` | Fungerar |
| Preview-render | `src/lib/gen/preview.ts` | Fungerar |
| Projekt-scaffold | `src/lib/gen/project-scaffold.ts` | Fungerar |
| 9 scaffolds | `src/lib/gen/scaffolds/*/manifest.ts` | Alla klara |

## Kända kvarvarande begränsningar

- KB-sökning är keyword-baserad (embedding planerad men ej implementerad)
- Preview stubs approximerar shadcn -- inte pixelperfekt
- Ingen scaffold-medveten retry vid generingsfel
- Ingen multipage-detection i prompts
