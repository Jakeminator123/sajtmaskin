# Project Information (Sajtmaskin)

## Overview

- AI-driven site builder using Next.js 15 (app router), React 19, Tailwind, TypeScript.
- Core flow: user selects category/template → `/builder` chat drives Vercel v0 generation → demoUrl preview → optional download/publish.
- Data layer: SQLite (better-sqlite3) with optional Redis cache; uploads stored under `PATHS.uploads`.
- Credits (“diamonds”) gate generations/refinements; Stripe checkout for purchases.

## Directory map (short)

- `app/`: Next.js 15 project root (package.json, configs, Tailwind/Next settings).
  - `src/app`: Routes (pages), API routes, layout, globals.css.
  - `src/components`: UI + feature components organized by function:
    - `builder/` - ChatPanel, CodePreview, GenerationProgress, QualitySelector, etc.
    - `templates/` - TemplateGallery, LocalTemplateCard, PreviewModal
    - `media/` - FileUploadZone, MediaBank, MediaDrawer, TextUploader
    - `modals/` - FinalizeModal, OnboardingModal, PromptWizardModal, AuditModal
    - `forms/` - PromptInput, ColorPalettePicker, LocationPicker, VoiceRecorder
    - `layout/` - Navbar, HomePage, ShaderBackground, CookieBanner, ErrorBoundary
    - `auth/` - AuthModal, RequireAuthModal
    - `audit/` - AuditPdfReport, MetricsChart, SecurityReport
    - `ui/` - Button, Card, Dialog, Input, etc. (UI primitives)
  - `src/lib`: Shared libs (config, db, v0 generator, vercel clients, openai/orchestrator agents, stores, cache, utilities).
  - `src/types`: Shared TS types/ambient decls.
  - `src/middleware.ts`: Next middleware.
- `docs/`: Project docs; keep updated with major structural changes.
  - `information.md` - This file (project overview)
  - `SUGGESTED_IMPROVEMENTS.md` - Roadmap and future features
  - `gpt-api/` - OpenAI API reference (OPENAI_API_LATEST_FEATURES.md is main doc)
  - `v0_doc/sdk_elements/` - v0 API reference
- `app/services/mpc/docs/`: MCP server documentation + scraped external docs
  - `docs-index.txt` - Complete documentation map for AI agents
  - `overview.txt` - MCP server setup and configuration
  - `docgrab__*/` - Scraped Vercel and OpenAI documentation
- `sajtmaskin.code-workspace`: Workspace settings.

## Tech & Setup

- Scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`.
- Styling: Tailwind with dark theme, Inter/JetBrains fonts from `layout.tsx`.
- Config: see `src/lib/config.ts` (PATHS, SECRETS, FEATURES, URLS, REDIS_CONFIG). DATA_DIR default `./data`; production should set `DATA_DIR=/var/data`.
- Image domains allowed in `next.config.ts` (v0, DiceBear, QuickChart, Picsum, Google avatars, Vercel blob hosts).

## Frontend Routes (app router)

- `/` → `src/app/page.tsx` renders `HomePage` (marketing/entry to builder).
- `/builder` → main AI workspace (`builder/page.tsx`): Chat + preview, auto project creation, download/finalize modal, mobile tabs.
- `/projects` → list & delete projects (`projects/page.tsx`).
- `/category/[type]` → choose prompts/templates per category, creates project then routes to builder.
- `/buy-credits` → Stripe purchase UI with auth modal and success handling.
- `/admin` → passworded admin dashboard: analytics + DB/Redis/template cache controls.
- Layout: `layout.tsx` sets `lang="sv"`, wraps in `ErrorBoundary`, `AnalyticsTracker`, `CookieBanner`; global styles in `globals.css`.

## Key Components / State

- Builder (`components/builder/`): `ChatPanel` (chat + generation), `CodePreview` (iframe preview), `GenerationProgress` (med thinking/streaming), `QualitySelector`, `ComponentPicker`, `AIFeaturesPanel`, `DesignModeOverlay` (Inspect Element).

### Design Mode / Inspect Element (v5.0)

The builder includes a DevTools-inspired "Inspect Element" feature:

- **Location**: `components/builder/design-mode-overlay.tsx`
- **Activation**: Click "Inspect" button in preview header
- **Features**:
  - 7 element categories (Layout, Content, Interactive, Forms, Media, Components, Styling)
  - Each element has `codeHints` for Code Crawler matching
  - Search functionality to filter elements
  - Code context shown in chat input when element selected

**Why not real DOM inspection?**
v0's iframe is cross-origin (vusercontent.net), so we can't directly access its DOM. Instead, we provide a smart element picker that uses Code Crawler to find relevant code.
- Templates (`components/templates/`): `TemplateGallery`, `LocalTemplateCard`, `PreviewModal`; uses `lib/template-data`.
- Media (`components/media/`): `FileUploadZone`, `MediaBank`, `MediaDrawer` (v2.0), `TextUploader` (v2.0 med smart content detection), `AttachmentChips`.
- Modals (`components/modals/`): `FinalizeModal`, `OnboardingModal`, `PromptWizardModal`, `AuditModal`.
- Forms (`components/forms/`): `PromptInput`, `ColorPalettePicker`, `LocationPicker`, `VoiceRecorder`, `QrShare`.
- Layout (`components/layout/`): `Navbar`, `HomePage`, `ShaderBackground`, `CookieBanner`, `ErrorBoundary`, `HelpTooltip`.
- Auth (`components/auth/`): `AuthModal`, `RequireAuthModal`; client state in `lib/auth-store`.
- State stores: `lib/store` (builder state: chat, files, demoUrl, projectId, versions), `lib/auth-store` (user/diamonds).

## Backend / API Highlights (`src/app/api`)

- Generation: `generate` (prompt/category → v0 generateCode, deduct credit/guest limit), `refine` (existingCode + instruction → v0 refineCode).
- Templates: `template` (fetch v0 template), `local-template`, `orchestrate` (agent), `agent/edit`.
- Projects: `projects` (list/create with rate limits); `projects/[id]` (get/update/delete); nested: `save`, `download`, `files`, `upload`, `status`, `analyze`.
- Media: `media/upload`, `upload-from-url`, `media/[id]`, `uploads/[filename]`, `uploads/media/[...path]`, `images/save`.
- Analytics & tracking: `analytics`, `health`, `page_views` stored in DB.
- Auth: email/password + OAuth (`auth/login/register/logout/me`, `auth/google`, `auth/github` callbacks).
- Credits & payments: `credits`, `credits/check`; `stripe/checkout`, `stripe/webhook`.
- AI helpers: `expand-prompt`, `text/analyze`, `text/extract`, `analyze-website`, `domain-suggestions`, `transcribe`, `unsplash`.
- Admin: `admin/database` (stats, backup download, clear tables/uploads, template cache export/import/extend, cleanup tasks, mega-cleanup); guarded by `TEST_USER_EMAIL`.
- Vercel integration: `vercel/projects`, `vercel/deploy`, `vercel/domains/price|purchase`, `vercel/purchase-and-deploy`, `vercel/status/[deploymentId]`.

## Data & Storage

- SQLite schema (`lib/database.ts`): users (with diamonds, provider), sessions, transactions, guest_usage, projects, project_data (chat/demoUrl/code/files/messages), project_files, images, media_library, company_profiles (wizard data), template_cache, template_screenshots, page_views, vercel_deployments, etc.
- Redis (optional via REDIS_CONFIG) for caching projects and analytics; `lib/redis`.
- Uploads stored under `PATHS.uploads`; served via `/uploads`. Admin actions can clear.

## AI Generation Pipeline

- Client `ChatPanel` calls `/api/orchestrate` (universal gatekeeper for all prompts).
- Server uses `lib/v0-generator` (v0-sdk) with quality → model map (standard = v0-1.5-md, premium = v0-1.5-lg).
- Credits: `lib/database` deducts diamonds for authed users; guests limited to 1 generation/1 refine via `guest_usage`.
- Results persisted to SQLite via project endpoints; demoUrl used for iframe preview; code/files stored for download.

## Orchestrator Agent (Universal Gatekeeper - v4.0 med AI SDK 6)

**Alla prompts** går nu genom orchestratorn som "gatekeeper" - både initial generation och refinement.

### Pipeline & Komponentroller

```
Användarprompt
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 1: SEMANTIC ROUTER (AI SDK 6, gpt-4o-mini)                   │
│  • Klassificerar intent (simple_code, needs_code_context, etc.)    │
│  • Bestämmer om Code Crawler ska köras                             │
│  • ROLL: Bara klassificering, förbättrar INTE prompten             │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 2: CODE CRAWLER (INGEN AI - bara snabb strängmatchning)      │
│  • Hittar relevanta koddelar baserat på hints                      │
│  • Returnerar kodsnippets med radnummer                            │
│  • ROLL: Bara hitta kod, föreslår INTE ändringar                   │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 3: SEMANTIC ENHANCER (NY! AI SDK 6, gpt-4o-mini)             │
│  • Tar vag prompt ("gör headern snyggare") och förbättrar den      │
│  • Lägger till konkreta tekniska instruktioner                     │
│  • ROLL: Semantisk prompt-förbättring                              │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 4: PROMPT ENRICHER (INGEN AI - bara formatering)             │
│  • Kombinerar: enhanced prompt + kodkontext + bilder + webbresultat│
│  • Formaterar för v0:s förståelse                                   │
│  • ROLL: Kombinera allt till slutlig prompt                        │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 5: V0 API (Vercel)                                           │
│  • Tar emot berikad prompt                                          │
│  • Genererar/refaktorerar kod                                       │
│  • Returnerar demoUrl för preview                                   │
│  • ROLL: ENDA komponenten som BYGGER sajter!                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Filer & Roller (Tydlig separation)

| Fil                         | Roll                            | Använder AI?              |
| --------------------------- | ------------------------------- | ------------------------- |
| `lib/semantic-router.ts`    | Klassificerar intent            | ✅ gpt-4o-mini (AI SDK 6) |
| `lib/code-crawler.ts`       | Hittar relevant kod             | ❌ Bara strängmatchning   |
| `lib/semantic-enhancer.ts`  | Förbättrar prompten semantiskt  | ✅ gpt-4o-mini (AI SDK 6) |
| `lib/prompt-enricher.ts`    | Kombinerar allt till slutprompt | ❌ Bara formatering       |
| `lib/orchestrator-agent.ts` | Koordinerar hela pipelinen      | ❌ (delegerar till andra) |
| `lib/v0-generator.ts`       | Anropar v0 API för kodgen       | ✅ v0 API (Vercel)        |

### Viktigt: Vad som bygger sajter

**ENDAST v0 API bygger sajter!** Alla andra komponenter berikar bara prompten:

- Semantic Router → klassificerar
- Code Crawler → hittar kod
- Semantic Enhancer → förbättrar prompten
- Prompt Enricher → kombinerar allt

v0 API tar sedan emot den berikade prompten och genererar faktisk kod.

### Fördelar med v4.0

- **AI SDK 6**: Modern streaming och strukturerad output
- **Tydliga roller**: Varje komponent har EN uppgift
- **Snabbare Code Crawler**: Ingen AI = ~100ms istället för ~2s
- **Bättre prompts**: Semantic Enhancer gör vaga prompts specifika
- **Billigare**: Färre AI-anrop, smartare routing

## Media & Images

- **Unsplash**: Primary stock photo source. Downloads tracked per API guidelines (required for production).
- **Pexels**: DISABLED by default - set `ENABLE_PEXELS=true` to enable.
- **Blob Storage**: `BLOB_READ_WRITE_TOKEN` required for public URLs (v0 preview needs public URLs!).
- **AI Images**: Generated via gpt-image-1 or dall-e-3, saved to Vercel Blob for public URLs.
- Attribution: Unsplash photos include "Photo by [Name] on Unsplash" with links.

## AI Models & SDK (v4.0 med AI SDK 6)

### Orchestrator Pre-Scripts (använder AI SDK 6)

| Komponent             | Modell        | Kostnad   | Roll                 |
| --------------------- | ------------- | --------- | -------------------- |
| **Semantic Router**   | `gpt-4o-mini` | ~$0.15/1M | Klassificerar intent |
| **Semantic Enhancer** | `gpt-4o-mini` | ~$0.15/1M | Förbättrar prompten  |
| **Code Crawler**      | _Ingen AI_    | $0        | Söker kodfiler       |
| **Prompt Enricher**   | _Ingen AI_    | $0        | Kombinerar context   |

### Bildgenerering (special case)

- **`gpt-image-1`** / **`dall-e-3`** - AI-genererade bilder via OpenAI
- Sparas till Vercel Blob Storage
- Triggas av `image_gen` eller `image_and_code` intent

### Webbsökning (special case)

- **`gpt-4o-mini`** + `web_search` tool via Responses API
- Triggas av `web_search` eller `web_and_code` intent

### v0 API (Vercel) - BYGGER SAJTER

| Modell      | Context | Användning               |
| ----------- | ------- | ------------------------ |
| `v0-1.5-md` | 128K    | Standard - snabb, billig |
| `v0-1.5-lg` | 512K    | Premium - bäst kvalitet  |

**Viktigt**: Endast v0 API genererar faktisk kod. Alla andra anrop berikar bara prompten.

### AI SDK 6 Feature Flags

Användare kan aktivera/avaktivera avancerade AI-funktioner via UI-panelen "AI Funktioner" i builder-headern.

| Feature                     | Status      | Beskrivning                                        |
| --------------------------- | ----------- | -------------------------------------------------- |
| **Smart Agent Mode**        | Stabil      | ToolLoopAgent för smartare prompt-hantering        |
| **Structured Tool Output**  | Stabil      | Verktyg returnerar JSON Schema                     |
| **Extended Usage Tracking** | Stabil      | Detaljerad tokenräkning                            |
| **Tool Approval**           | Placeholder | Human-in-the-loop för verktyg (ej implementerat)   |
| **AI DevTools**             | Placeholder | Visuell debugger (kräver `@ai-sdk/devtools`)       |
| **MCP Tools**               | Placeholder | Externa MCP-servrar (ej implementerat)             |
| **Reranking**               | Placeholder | Omranka sökresultat med AI (ej implementerat)      |
| **Image Editing**           | Placeholder | Redigera bilder via AI (ej implementerat)          |

**Filer:**

- `lib/ai-sdk-features.ts` - Feature flags store (Zustand)
- `lib/ai-agent.ts` - ToolLoopAgent implementation (nu integrerad i orchestrator)
- `components/builder/ai-features-panel.tsx` - UI för feature toggles

Se `docs/gpt-api/OPENAI_API_LATEST_FEATURES.md` för detaljer.

## Auth & Permissions

- `lib/auth` handles sessions/JWT, `auth-store` client side. Admin authorization checks email against `TEST_USER_EMAIL`. Credits required for generation/refine; guests limited by session cookie.

## Payments

- Stripe checkout session in `/api/stripe/checkout`; webhook updates transactions/diamonds. Packages defined in `/buy-credits` page.

## Configuration / Environment

See `app/ENV_CONFIG.md` for complete documentation.

### Required API Keys

- `V0_API_KEY` - Vercel v0 API for code generation
- `OPENAI_API_KEY` - OpenAI for semantic router, enhancer, image generation

### Optional Services

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Payments
- `VERCEL_API_TOKEN` - Deployment
- `REDIS_HOST/PASSWORD` - Caching (optional)
- `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` - OAuth
- `UNSPLASH_ACCESS_KEY` - Stock images
- `BLOB_READ_WRITE_TOKEN` - Media uploads

### Development Tools (DEV_* variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `DEV_AUTO_LINT` | false | Auto-run eslint --fix on changes |
| `DEV_VERBOSE_AI_LOGS` | false | Detailed AI pipeline logs |
| `DEV_DEBUG_V0_API` | false | Log v0 request/response bodies |
| `DEV_SKIP_CREDIT_CHECK` | false | Skip credit validation |
| `DEV_TEST_MODE` | false | Skip DB saves, force regeneration |
| `MCP_ENABLED` | true | Enable MCP server features |
| `MCP_DEBUG` | false | MCP server debug logging |

### Business Logic Controls

| Variable | Default | Description |
|----------|---------|-------------|
| `NEW_USER_STARTING_CREDITS` | 5 | Credits given to new users |
| `CREDIT_COST_GENERATION` | 1 | Cost per generation |
| `FREE_TIER_MAX_PROJECTS` | 3 | Max projects for free users |

### Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `FEATURE_AGENT_MODE` | true | Enable ToolLoopAgent |
| `FEATURE_WEB_SEARCH` | true | Enable web search |
| `FEATURE_IMAGE_GENERATION` | true | Enable AI image generation |

- Pexels: **DISABLED** - set `ENABLE_PEXELS=true` to re-enable.
- Base URL: `NEXT_PUBLIC_BASE_URL` (defaults to http://localhost:3000).
- Image domains already whitelisted in `next.config.ts`.

## Build & Run

- Install deps: `npm install` (in `app/`).
- Dev: `npm run dev` (Next.js).
- Prod: `npm run build` → `npm run start`.
- Lint: `npm run lint` or `npm run lint:fix` (auto-fix).
- MCP Server: `npm run mpc` (for Cursor agent integration).
- Ensure `data/` (or DATA_DIR) writable for SQLite/uploads; Redis optional but recommended for caching.

## MCP Server (Model Context Protocol)

Sajtmaskin includes an MCP server for enhanced AI agent integration in Cursor.

### Location & Setup

- **Server**: `app/services/mpc/server.mjs`
- **Docs folder**: `app/services/mpc/docs/`
- **Config**: `.cursor/mcp.json` (create manually)

### MCP Configuration

Create `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "sajtmaskin-docs": {
      "command": "node",
      "args": ["./app/services/mpc/server.mjs"],
      "env": {}
    }
  }
}
```

### Available Resources (via MCP)

| Resource | URI | Description |
|----------|-----|-------------|
| docs-index | `docs://local/docs-index` | Complete documentation map |
| overview | `docs://local/overview` | MCP server overview |
| error-playbook | `docs://local/error-playbook` | Error reporting guide |

### Available Tools

| Tool | Description |
|------|-------------|
| `report_error` | Log errors with level, stack, component, context |
| `list_errors` | Retrieve recent error entries (max 50) |

### External Docs (Scraped)

- `docgrab__vercel.com__docs/llms/` - Vercel AI SDK documentation
- `docgrab__platform.openai.com__docs_overview/llms/` - OpenAI API documentation

## Notable UX/behavior

- Strict mobile handling in builder: desktop instance is primary generator; mobile uses shared store without duplicate requests.
- SessionStorage guard in `ChatPanel` prevents overlapping generations; 10 min timeout and 30s cooldown per key.
- Category pages auto-create projects and redirect with params; wizard saves `company_profiles`.
- Admin panel exposes destructive cleanup; MEGA CLEANUP wipes v0, Vercel, SQLite, Redis, uploads.

## Storage & Cleanup Management

### Template Cache (Per-User)

- **User-specific caching**: Template cache is now separated per user (`user_id` in `template_cache` table)
- **Prevents cross-user pollution**: Each user gets their own cached template instances
- **ChatId reuse**: Users can continue their own template conversations using cached `chatId`
- **Auto-expiry**: Template cache expires after 7 days
- **Cleanup**: Orphaned template cache entries (deleted users) are cleaned up automatically

### Project Cleanup

- **Unused projects**: Projects that were never saved (no `chat_id` or `demo_url`) are deleted after 24 hours
- **Anonymous projects**: Deleted after 7 days of inactivity
- **User projects**: Soft-delete after 90 days, hard-delete after 120 days total
- **Orphaned data**: Template cache, project files, and images are cleaned up when projects are deleted

### Redis Usage

- **Temporary cache only**: Redis is used for short-lived cache (1-24h TTL)
- **Not for persistence**: All persistent data is stored in SQLite
- **Active projects**: Redis cache is refreshed on read to keep active projects alive
- **Auto-expiry**: Redis keys expire automatically based on TTL

## Open Questions / Risks

- Production secrets/keys must be set; many features are no-ops without them (v0, Stripe, OAuth, Redis).
- DATA_DIR not set in production may lose DB/uploads on restart.
- Credits logic assumes diamonds ≥1; review guest limits if scaling.
- v0 timeouts: generation capped at 300s; complex prompts may still fail.
