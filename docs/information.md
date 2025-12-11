# Project Information (Sajtmaskin)

## Overview

- AI-driven site builder using Next.js 15 (app router), React 19, Tailwind, TypeScript.
- Core flow: user selects category/template → `/builder` chat drives Vercel v0 generation → demoUrl preview → optional download/publish.
- Data layer: SQLite (better-sqlite3) with optional Redis cache; uploads stored under `PATHS.uploads`.
- Credits (“diamonds”) gate generations/refinements; Stripe checkout for purchases.

## Directory map (short)

- `app/`: Next.js 15 project root (package.json, configs, Tailwind/Next settings).
  - `src/app`: Routes (pages), API routes, layout, globals.css.
  - `src/components`: UI + feature components (builder, auth, avatar, preview, modals, UI kit).
  - `src/lib`: Shared libs (config, db, v0 generator, vercel clients, openai/orchestrator agents, stores, cache, utilities).
  - `src/contexts`: React contexts (avatar).
  - `src/types`: Shared TS types/ambient decls.
  - `src/middleware.ts`: Next middleware.
- `docs/`: Project docs; keep updated with major structural changes.
- `docs/gpt-api/`: Reference notes for OpenAI API (legacy location, still useful).
- `INPUT _FOR_CURSOR/`: Legacy input assets/prompts (most cleaned; safe to ignore unless needed).
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
- Layout: `layout.tsx` sets `lang="sv"`, wraps in `AvatarProvider`, `ErrorBoundary`, `AnalyticsTracker`, `CookieBanner`; global styles in `globals.css`.

## Key Components / State

- Chat & generation: `ChatPanel` manages prompts, file uploads, media bank, domain suggestions, AI generation/refine via v0 API, credit gating, demoUrl preview coordination, mobile/desktop instances.
- Preview: `CodePreview`, `FinalizeModal`, `GenerationProgress`.
- Templates: `TemplateGallery`, `LocalTemplateCard`, `PreviewModal`; uses `lib/template-data` and cached screenshots/files.
- Avatar system: `AvatarProvider` + `FloatingAvatar` and reactions to app events (typing/generation/etc); tracks points, tooltip state, section context.
- Auth UI: `Navbar`, `AuthModal`, `RequireAuthModal`; client auth state in `lib/auth-store`.
- Media & uploads: `FileUploadZone`, `MediaBank`, `MediaLibraryPanel`, `TextFilesPanel`, `ImagePlacementModal`, `VideoGenerator`.
- UI helpers: `QualitySelector`, `ComponentPicker`, `HelpTooltip`, `CookieBanner`, `ErrorBoundary`, etc.
- State stores: `lib/store` (builder state: chat, files, demoUrl, projectId, versions), `lib/auth-store` (user/diamonds).

## Backend / API Highlights (`src/app/api`)

- Generation: `generate` (prompt/category → v0 generateCode, deduct credit/guest limit), `refine` (existingCode + instruction → v0 refineCode).
- Templates: `template` (fetch v0 template), `local-template`, `orchestrate` (agent), `agent/edit`.
- Projects: `projects` (list/create with rate limits); `projects/[id]` (get/update/delete); nested: `save`, `download`, `files`, `upload`, `status`, `analyze`.
- Media: `media/upload`, `upload-from-url`, `media/[id]`, `uploads/[filename]`, `uploads/media/[...path]`, `images/save`.
- Analytics & tracking: `analytics`, `health`, `page_views` stored in DB.
- Auth: email/password + OAuth (`auth/login/register/logout/me`, `auth/google`, `auth/github` callbacks).
- Credits & payments: `credits`, `credits/check`; `stripe/checkout`, `stripe/webhook`.
- AI helpers: `expand-prompt`, `text/analyze`, `text/extract`, `analyze-website`, `competitors`, `domain-suggestions`, `generate-video`, `transcribe`, `pexels`, `unsplash`, `avatar`, `avatar-guide`.
- Admin: `admin/database` (stats, backup download, clear tables/uploads, template cache export/import/extend, cleanup tasks, mega-cleanup); guarded by `TEST_USER_EMAIL`.
- Vercel integration: `vercel/projects`, `vercel/deploy`, `vercel/domains/price|purchase`, `vercel/purchase-and-deploy`, `vercel/status/[deploymentId]`.

## Data & Storage

- SQLite schema (`lib/database.ts`): users (with diamonds, provider), sessions, transactions, guest_usage, projects, project_data (chat/demoUrl/code/files/messages), project_files (takeover), images, media_library, company_profiles (wizard data), template_cache, template_screenshots, page_views, vercel_deployments, etc.
- Redis (optional via REDIS_CONFIG) for caching projects and analytics; `lib/redis`.
- Uploads stored under `PATHS.uploads`; served via `/uploads`. Admin actions can clear.

## AI Generation Pipeline

- Client `ChatPanel` calls `/api/generate` or `/api/refine`.
- Server uses `lib/v0-generator` (v0-sdk) with quality → model map (standard = v0-1.5-md, premium = v0-1.5-lg); sanitizes code to remove Vercel references.
- Credits: `lib/database` deducts diamonds for authed users; guests limited to 1 generation/1 refine via `guest_usage`.
- Results persisted to SQLite via project endpoints; demoUrl used for iframe preview; code/files stored for takeover/download.

## Orchestrator Agent (Universal Gatekeeper - v2.0)

**Alla prompts** går nu genom orchestratorn som "gatekeeper" - både initial generation och refinement.

### Flöde

```
Användarprompt
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 1: SEMANTIC ROUTER (gpt-4o-mini, ~$0.15/1M tokens)           │
│  Analyserar prompten semantiskt och klassificerar intent           │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 2: CODE CRAWLER (vid needs_code_context ELLER clarify)      │
│  Söker igenom projektfiler efter relevanta kodsektioner            │
│  Hittar t.ex. header-kod om användaren skrev "ändra headern"       │
│  För clarify: hittar alla matchande element för Smart Clarify     │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 3: PROMPT ENRICHER (om kodkontext hittades)                  │
│  Kombinerar originalprompten med teknisk kontext för v0            │
└─────────────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────────────┐
│  STEG 4: ÅTGÄRD BASERAT PÅ INTENT                                  │
│                                                                     │
│  Intent              │ Åtgärd                                      │
│  ────────────────────┼────────────────────────────────────────────│
│  simple_code         │ Direkt till v0 → Kod ändras                 │
│  needs_code_context  │ Berikad prompt till v0 → Kod ändras         │
│  image_gen           │ Genererar bild → Mediabibliotek (INGEN v0)  │
│  chat_response       │ Svarar direkt (INGEN v0)                    │
│  clarify             │ Smart Clarify: Frågar med alternativ (INGEN v0) │
│  web_search          │ Söker, returnerar info (INGEN v0)           │
│  image_and_code      │ Genererar bild + v0 → Kod ändras            │
│  web_and_code        │ Söker + v0 → Kod ändras                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Filer

- `lib/orchestrator-agent.ts` - Huvudorchestrator, koordinerar alla steg
- `lib/semantic-router.ts` - GPT-4o-mini-baserad intent-klassificering
- `lib/code-crawler.ts` - Söker igenom projektkod för kontext
- `lib/prompt-enricher.ts` - Kombinerar prompt + kodkontext

### Fördelar

- **Billigare**: Undviker onödiga v0-anrop (kostar tokens + tar 15-30s)
- **Smartare**: Semantisk analys istället för keyword-matching
- **Snabbare**: image_only/chat_response/clarify returnerar direkt
- **Precis**: Code Crawler ger v0 exakt kontext för vaga prompts

### Smart Clarify (IMPLEMENTERAD ✅)

**Implementerad!** - Vid vaga prompts som "ändra länken" där flera alternativ finns:

1. Semantic Router detekterar clarify-intent med needsCodeContext=true
2. Code Crawler analyserar projektfiler och hittar alla matchande element
3. AI genererar konkret fråga: "Menar du länken 'Products' i headern eller länken 'Contact' i footern?"
4. Användaren väljer → exakt instruktion till v0

**Hur det fungerar:**
- När clarify-intent detekteras OCH projektfiler finns → Code Crawler körs automatiskt
- Systemet extraherar länkar, knappar, rubriker etc. från kodkontexten
- En naturlig fråga genereras med alla alternativ listade
- Användaren kan sedan ge specifik instruktion

**Teknisk implementation:**
- `generateSmartClarifyQuestion()` i orchestrator-agent.ts
- Körs när `intent === "clarify"` OCH `codeContext.relevantFiles.length > 0`
- Använder gpt-4o-mini för att generera naturliga frågor baserat på kodkontext

## Media & Images

- **Unsplash**: Primary stock photo source. Downloads tracked per API guidelines (required for production).
- **Pexels**: DISABLED by default - set `ENABLE_PEXELS=true` to enable.
- **Blob Storage**: `BLOB_READ_WRITE_TOKEN` required for public URLs (v0 preview needs public URLs!).
- **AI Images**: Generated via gpt-image-1 or dall-e-3, saved to Vercel Blob for public URLs.
- Attribution: Unsplash photos include "Photo by [Name] on Unsplash" with links.

## OpenAI Models (Agent/Edit API)

- **Code editing** (`code_edit`): `gpt-5.1-codex-mini` → `gpt-4o-mini` (1 diamond)
- **Copywriting** (`copy`): `gpt-5-mini` → `gpt-4o-mini` (1 diamond)
- **Image generation** (`image`): `gpt-5` + `image_generation` tool → `gpt-4o` (3 diamonds)
- **Web search** (`web_search`): `gpt-4o-mini` + `web_search` tool (2 diamonds, note: web_search only works with gpt-4o/gpt-4o-mini)
- **Code refactoring** (`code_refactor`): `gpt-5.1-codex` → `gpt-4o` (5 diamonds, 400k context)
- **Analysis** (`analyze`): `gpt-5` + `code_interpreter` tool → `gpt-4o` (3 diamonds)
- Models configured in `lib/openai-agent.ts` (MODEL_CONFIGS). Uses Responses API (`/v1/responses`) with fallback to Chat Completions API.
- See `docs/gpt-api/OPENAI_API_LATEST_FEATURES.md` for detailed model information.

## Auth & Permissions

- `lib/auth` handles sessions/JWT, `auth-store` client side. Admin authorization checks email against `TEST_USER_EMAIL`. Credits required for generation/refine; guests limited by session cookie.

## Payments

- Stripe checkout session in `/api/stripe/checkout`; webhook updates transactions/diamonds. Packages defined in `/buy-credits` page.

## Configuration / Environment

- Required/important env vars (see `config.ts`): `V0_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VERCEL_API_TOKEN`, `REDIS_HOST/PASSWORD` (optional), `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `JWT_SECRET`, `DATA_DIR`, `BACKOFFICE_PASSWORD`, `TEST_USER_EMAIL/PASSWORD`, `ELEVENLABS_API_KEY` (optional), `UNSPLASH_ACCESS_KEY`, `BLOB_READ_WRITE_TOKEN`.
- Pexels: **DISABLED** - set `ENABLE_PEXELS=true` to re-enable.
- Base URL: `NEXT_PUBLIC_BASE_URL` (defaults to http://localhost:3000).
- Image domains already whitelisted in `next.config.ts`.

## Build & Run

- Install deps: `npm install` (in `app/`).
- Dev: `npm run dev` (Next.js).
- Prod: `npm run build` → `npm run start`.
- Lint: `npm run lint`.
- Ensure `data/` (or DATA_DIR) writable for SQLite/uploads; Redis optional but recommended for caching.

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
