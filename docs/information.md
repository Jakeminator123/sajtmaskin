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

## Auth & Permissions
- `lib/auth` handles sessions/JWT, `auth-store` client side. Admin authorization checks email against `TEST_USER_EMAIL`. Credits required for generation/refine; guests limited by session cookie.

## Payments
- Stripe checkout session in `/api/stripe/checkout`; webhook updates transactions/diamonds. Packages defined in `/buy-credits` page.

## Configuration / Environment
- Required/important env vars (see `config.ts`): `V0_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VERCEL_API_TOKEN`, `REDIS_HOST/PASSWORD` (optional), `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `JWT_SECRET`, `DATA_DIR`, `BACKOFFICE_PASSWORD`, `TEST_USER_EMAIL/PASSWORD`, `ELEVENLABS_API_KEY` (optional), `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`.
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

## Open Questions / Risks
- Production secrets/keys must be set; many features are no-ops without them (v0, Stripe, OAuth, Redis).
- DATA_DIR not set in production may lose DB/uploads on restart.
- Credits logic assumes diamonds ≥1; review guest limits if scaling.
- v0 timeouts: generation capped at 300s; complex prompts may still fail.

