# SAJTMASKIN - Projektstruktur & Analys

## ASCII-Trädstruktur

```
sajtmaskin/
│
├── app/                                    # Next.js 15 projektrot
│   ├── package.json                        # Dependencies (Next.js 15, React 19, AI SDK 6, v0-sdk)
│   ├── next.config.ts                      # Next.js config (image domains, etc.)
│   ├── tailwind.config.ts                 # Tailwind CSS config
│   ├── tsconfig.json                       # TypeScript config
│   ├── vercel.json                         # Vercel deployment config
│   │
│   ├── public/                             # Statiska filer
│   │   ├── icon.svg                        # Favicon
│   │   ├── screenshots/                    # Screenshots för templates
│   │   └── video/                          # Intro-video (intro.mp4, .srt, .vtt)
│   │
│   ├── services/mpc/                       # MCP Server (Model Context Protocol)
│   │   ├── server.mjs                      # MCP server implementation
│   │   ├── start-server.cmd                # Windows start script
│   │   ├── start-gui.pyw                   # GUI starter
│   │   ├── cursor-mcp-config.json          # MCP config
│   │   ├── docs/                           # MCP dokumentation
│   │   │   ├── docs-index.txt              # Dokumentationsindex
│   │   │   ├── overview.txt                 # MCP overview
│   │   │   ├── error-playbook.txt          # Felhantering
│   │   │   └── docgrab__*/                 # Scrapade docs (Vercel, OpenAI)
│   │   └── logs/                           # Error logs
│   │
│   └── src/                                # Källkod
│       │
│       ├── app/                            # Next.js App Router
│       │   ├── layout.tsx                  # Root layout (ErrorBoundary, Analytics, CookieBanner)
│       │   ├── page.tsx                    # Startsida (/) → HomePage
│       │   ├── globals.css                 # Globala styles
│       │   ├── favicon.ico/route.ts        # Dynamic favicon
│       │   │
│       │   ├── builder/                    # Huvudbyggare (/builder)
│       │   │   └── page.tsx                # Builder-sida med ChatPanel + CodePreview
│       │   │
│       │   ├── category/[type]/            # Kategorisidor (/category/landing-page)
│       │   │   └── page.tsx                # Template/prompt-väljare
│       │   │
│       │   ├── projects/                   # Projektlista (/projects)
│       │   │   └── page.tsx                # Visa/ta bort projekt
│       │   │
│       │   ├── buy-credits/                # Köp credits (/buy-credits)
│       │   │   └── page.tsx                # Stripe checkout UI
│       │   │
│       │   ├── admin/                      # Admin dashboard (/admin)
│       │   │   └── page.tsx                # DB/Redis/cache management
│       │   │
│       │   └── api/                        # API Routes (Backend)
│       │       │
│       │       ├── orchestrate/            # ⭐ UNIVERSAL GATEKEEPER
│       │       │   ├── route.ts            # Huvudorchestrator (alla prompts)
│       │       │   └── stream/route.ts     # Streaming version
│       │       │
│       │       ├── generate/route.ts       # ⚠️ GAMMAL - används ej längre?
│       │       │                           # (Borde gå via orchestrate)
│       │       │
│       │       ├── projects/               # Projekthantering
│       │       │   ├── route.ts            # Lista/skapa projekt
│       │       │   └── [id]/               # Projekt-specifik
│       │       │       ├── route.ts        # GET/UPDATE/DELETE
│       │       │       ├── save/route.ts   # Spara projekt
│       │       │       ├── download/route.ts # Ladda ner ZIP
│       │       │       ├── files/route.ts  # Hämta filer
│       │       │       ├── upload/route.ts # Ladda upp filer
│       │       │       ├── status/route.ts # Status
│       │       │       └── analyze/route.ts # Analysera projekt
│       │       │
│       │       ├── template/route.ts       # Hämta v0 template
│       │       ├── local-template/route.ts # Lokal mall från disk
│       │       │
│       │       ├── auth/                   # Autentisering
│       │       │   ├── login/route.ts      # Email/password login
│       │       │   ├── register/route.ts  # Registrering
│       │       │   ├── logout/route.ts     # Logout
│       │       │   ├── me/route.ts         # Current user
│       │       │   ├── google/route.ts    # Google OAuth
│       │       │   ├── google/callback/   # Google callback
│       │       │   ├── github/route.ts    # GitHub OAuth
│       │       │   └── github/callback/   # GitHub callback
│       │       │
│       │       ├── credits/               # Credits ("diamonds")
│       │       │   ├── route.ts            # Hämta/uppdatera credits
│       │       │   └── check/route.ts     # Kolla credits
│       │       │
│       │       ├── stripe/                # Betalningar
│       │       │   ├── checkout/route.ts  # Skapa checkout session
│       │       │   └── webhook/route.ts   # Stripe webhook
│       │       │
│       │       ├── media/                 # Media-hantering
│       │       │   ├── upload/route.ts    # Ladda upp media
│       │       │   ├── upload-from-url/   # Ladda från URL
│       │       │   └── [id]/route.ts      # Hämta media
│       │       │
│       │       ├── uploads/               # Upload serving
│       │       │   ├── [filename]/route.ts
│       │       │   └── media/[...path]/route.ts
│       │       │
│       │       ├── images/save/route.ts   # Spara AI-genererade bilder
│       │       │
│       │       ├── vercel/                # Vercel deployment
│       │       │   ├── projects/route.ts
│       │       │   ├── deploy/route.ts
│       │       │   ├── domains/price/route.ts
│       │       │   ├── domains/purchase/route.ts
│       │       │   ├── purchase-and-deploy/route.ts
│       │       │   └── status/[deploymentId]/route.ts
│       │       │
│       │       ├── audit/route.ts          # Website audit
│       │       ├── audits/route.ts        # Lista audits
│       │       ├── audits/[id]/route.ts   # Hämta audit
│       │       │
│       │       ├── text/                   # Text-hjälpfunktioner
│       │       │   ├── analyze/route.ts
│       │       │   └── extract/route.ts
│       │       │
│       │       ├── expand-prompt/route.ts  # Expandera prompt
│       │       ├── analyze-website/route.ts # Analysera webbplats
│       │       ├── domain-suggestions/route.ts
│       │       ├── transcribe/route.ts    # Speech-to-text
│       │       │
│       │       ├── unsplash/route.ts       # Stock photos
│       │       ├── unsplash/download/route.ts
│       │       │
│       │       ├── download/route.ts      # Download helper
│       │       ├── settings/route.ts      # User settings
│       │       ├── company-profile/route.ts # Wizard data
│       │       ├── analytics/route.ts      # Analytics tracking
│       │       ├── health/route.ts        # Health check
│       │       └── admin/database/route.ts # Admin DB operations
│       │
│       ├── components/                     # React Components
│       │   │
│       │   ├── builder/                    # Builder-komponenter
│       │   │   ├── chat-panel.tsx          # ⭐ Huvudchat (anropar /api/orchestrate)
│       │   │   ├── code-preview.tsx        # Preview (iframe + Sandpack fallback)
│       │   │   ├── generation-progress.tsx # Progress indicator
│       │   │   ├── quality-selector.tsx   # Standard/Premium väljare
│       │   │   ├── component-picker.tsx    # Komponentväljare
│       │   │   ├── design-mode-overlay.tsx # Inspect Element (v5.0)
│       │   │   ├── ai-features-panel.tsx   # AI SDK 6 feature toggles
│       │   │   ├── chat-message.tsx        # Chat-meddelanden
│       │   │   ├── suggestions.tsx         # Förslag
│       │   │   ├── service-suggestions.tsx # Service-förslag
│       │   │   ├── thinking-bubble.tsx    # Thinking indicator
│       │   │   ├── unified-asset-modal.tsx # Media/text/section modal
│       │   │   └── index.ts                # Exports
│       │   │
│       │   ├── templates/                  # ❌ SAKNAS! (men importeras)
│       │   │   ├── TemplateGallery.tsx     # ⚠️ IMPORTERAS men finns ej
│       │   │   ├── LocalTemplateCard.tsx   # ⚠️ IMPORTERAS men finns ej
│       │   │   └── PreviewModal.tsx        # ⚠️ IMPORTERAS men finns ej
│       │   │
│       │   ├── media/                      # Media-hantering
│       │   │   ├── file-upload-zone.tsx   # Drag & drop upload
│       │   │   ├── media-bank.tsx          # Media-bibliotek
│       │   │   ├── media-drawer.tsx        # Media drawer (v2.0)
│       │   │   ├── text-uploader.tsx       # Text uploader (v2.0)
│       │   │   ├── attachment-chips.tsx   # Attachment chips
│       │   │   └── index.ts
│       │   │
│       │   ├── modals/                     # Modaler
│       │   │   ├── finalize-modal.tsx     # Finalisera projekt
│       │   │   ├── onboarding-modal.tsx   # Onboarding för nya användare
│       │   │   ├── prompt-wizard-modal.tsx # Prompt wizard
│       │   │   ├── audit-modal.tsx         # Audit resultat
│       │   │   └── index.ts
│       │   │
│       │   ├── forms/                      # Formulärkomponenter
│       │   │   ├── prompt-input.tsx        # Prompt input
│       │   │   ├── color-palette-picker.tsx
│       │   │   ├── location-picker.tsx     # Google Maps picker
│       │   │   ├── voice-recorder.tsx      # Speech-to-text
│       │   │   ├── qr-share.tsx            # QR-kod delning
│       │   │   └── index.ts
│       │   │
│       │   ├── layout/                     # Layout-komponenter
│       │   │   ├── navbar.tsx              # Navigation
│       │   │   ├── home-page.tsx           # Startsida (importerar TemplateGallery!)
│       │   │   ├── shader-background.tsx   # Three.js shader bakgrund
│       │   │   ├── cookie-banner.tsx       # Cookie banner
│       │   │   ├── error-boundary.tsx     # Error boundary
│       │   │   ├── analytics-tracker.tsx  # Analytics
│       │   │   ├── help-tooltip.tsx        # Help tooltips
│       │   │   ├── site-audit-section.tsx # Audit-sektion
│       │   │   ├── client-only.tsx         # Client-only wrapper
│       │   │   └── index.ts
│       │   │
│       │   ├── auth/                       # Autentisering
│       │   │   ├── auth-modal.tsx          # Login/register modal
│       │   │   ├── require-auth-modal.tsx  # Auth required modal
│       │   │   └── index.ts
│       │   │
│       │   ├── audit/                      # Audit-komponenter
│       │   │   ├── AuditPdfReport.tsx
│       │   │   ├── BudgetEstimate.tsx
│       │   │   ├── ImprovementsList.tsx
│       │   │   ├── MetricsChart.tsx
│       │   │   ├── SecurityReport.tsx
│       │   │   └── index.ts
│       │   │
│       │   ├── settings/                   # Inställningar
│       │   │   └── user-settings-modal.tsx
│       │   │
│       │   └── ui/                         # UI primitives (shadcn/ui)
│       │       ├── button.tsx
│       │       ├── card.tsx
│       │       ├── dialog.tsx
│       │       ├── input.tsx
│       │       ├── textarea.tsx
│       │       ├── scroll-area.tsx
│       │       ├── tooltip.tsx
│       │       ├── avatar-dicebear.tsx
│       │       ├── confirm-dialog.tsx
│       │       └── toast-notification.tsx
│       │
│       ├── lib/                            # Shared libraries
│       │   │
│       │   ├── config.ts                   # ⭐ Central config (PATHS, SECRETS, FEATURES)
│       │   ├── database.ts                 # ⭐ SQLite DB (better-sqlite3)
│       │   ├── redis.ts                    # Redis cache (optional)
│       │   │
│       │   ├── orchestrator-agent.ts       # ⭐ UNIVERSAL GATEKEEPER
│       │   │                               # Koordinerar hela pipelinen
│       │   ├── semantic-router.ts          # ⭐ STEG 1: Klassificerar intent (AI SDK 6, OPENAI_API_KEY)
│       │   ├── code-crawler.ts             # ⭐ STEG 2: Hittar kod (INGEN AI)
│       │   ├── semantic-enhancer.ts        # ⭐ STEG 3: Förbättrar prompt (AI SDK 6, OPENAI_API_KEY)
│       │   ├── prompt-enricher.ts          # ⭐ STEG 4: Kombinerar allt
│       │   ├── v0-generator.ts             # ⭐ STEG 5: Anropar v0 API (v0-sdk, V0_API_KEY, BYGGER SAJTER)
│       │   │
│       │   ├── ai-agent.ts                 # ToolLoopAgent (AI SDK 6)
│       │   ├── ai-gateway.ts               # AI gateway wrapper
│       │   ├── ai-sdk-features.ts          # Feature flags (Zustand)
│       │   │
│       │   ├── code-parser.ts              # ⚠️ STOR FIL - bara för Sandpack fallback
│       │   │                               # (används sällan, kan optimeras)
│       │   │
│       │   ├── template-data.ts            # v0 template data
│       │   ├── templates.json              # Template definitions
│       │   ├── local-templates.ts          # Lokala templates registry
│       │   │
│       │   ├── vercel-client.ts            # Vercel API client
│       │   ├── vercel-deployment-service.ts
│       │   ├── v0-url-parser.ts            # Parse v0 URLs
│       │   │
│       │   ├── auth.ts                     # Auth helpers (JWT, sessions)
│       │   ├── auth-store.ts               # Client auth state (Zustand)
│       │   ├── session.ts                  # Session management
│       │   │
│       │   ├── store.ts                    # ⭐ Builder state (Zustand)
│       │   │                               # (chat, files, demoUrl, projectId)
│       │   │
│       │   ├── api-client.ts               # ⚠️ Frontend API client
│       │   │                               # (generateWebsite() - används ej?)
│       │   │
│       │   ├── project-client.ts           # Projekt-klient
│       │   ├── project-cleanup.ts          # Cleanup-logik
│       │   │
│       │   ├── stripe.ts                   # Stripe helpers
│       │   ├── blob-service.ts             # Vercel Blob Storage
│       │   ├── webscraper.ts               # Web scraping
│       │   ├── audit-prompts.ts            # Audit prompts
│       │   │
│       │   ├── prompt-utils.ts             # Prompt utilities
│       │   ├── path-utils.ts               # Path utilities
│       │   ├── utils.ts                    # General utilities
│       │   ├── error-messages.ts           # Error messages
│       │   ├── debug.ts                    # Debug helpers
│       │   │
│       │   ├── use-streaming-generation.ts # Streaming hook
│       │   │
│       │   └── backoffice/                 # Admin tools
│       │       ├── index.ts
│       │       ├── types.ts
│       │       ├── content-extractor.ts
│       │       └── template-generator.ts
│       │
│       ├── types/                          # TypeScript types
│       │   ├── audit.ts                    # Audit types
│       │   └── speech.d.ts                 # Speech API types
│       │
│       └── middleware.ts                   # Next.js middleware
│
├── docs/                                   # Dokumentation
│   ├── information.md                      # ⭐ Huvuddokumentation
│   ├── SUGGESTED_IMPROVEMENTS.md           # Roadmap
│   │
│   ├── gpt-api/                            # OpenAI API docs
│   │   ├── OPENAI_API_LATEST_FEATURES.md  # Huvuddokument
│   │   ├── agent.txt
│   │   ├── agents.txt
│   │   ├── dalle.txt
│   │   ├── reasoning.txt
│   │   ├── responses.txt
│   │   ├── web_search.txt
│   │   └── ...
│   │
│   └── v0_doc/                             # v0 API docs
│       └── sdk_elements/
│           ├── intro.txt
│           ├── usage.txt
│           ├── workflow.txt
│           └── ...
│
├── .cursor/                                # Cursor IDE config
│   ├── rules/                              # Workspace rules
│   │   ├── gpt.mdc                         # GPT/API settings
│   │   └── rules.mdc                       # Code rules
│   └── plans/                              # Plans
│
├── .vscode/                                 # VS Code config
│   └── settings.json
│
├── compat-report.py                         # Python compatibility script
├── sajtmaskin.code-workspace                # Workspace file
└── PROJEKTSTRUKTUR.md                       # Denna fil
```

## MAPPBESKRIVNINGAR

### `/app` - Next.js Projektrot

- **package.json**: Dependencies (Next.js 15, React 19, AI SDK 6, v0-sdk, better-sqlite3, Stripe, etc.)
- **next.config.ts**: Next.js config med image domains (v0, DiceBear, QuickChart, etc.)
- **tailwind.config.ts**: Tailwind CSS config
- **tsconfig.json**: TypeScript config

### `/app/public` - Statiska Filer

- **icon.svg**: Favicon
- **screenshots/**: Template screenshots
- **video/**: Intro-video med subtitles

### `/app/services/mpc` - MCP Server

- **server.mjs**: MCP server implementation för Cursor integration
- **docs/**: Dokumentation för AI-agenter
- **logs/**: Error logs

### `/app/src/app` - Next.js App Router

- **layout.tsx**: Root layout med ErrorBoundary, AnalyticsTracker, CookieBanner
- **page.tsx**: Startsida (/) → renderar HomePage
- **builder/page.tsx**: Huvudbyggare med ChatPanel + CodePreview
- **category/[type]/page.tsx**: Kategorisidor för template/prompt-val
- **projects/page.tsx**: Projektlista
- **buy-credits/page.tsx**: Stripe checkout
- **admin/page.tsx**: Admin dashboard

### `/app/src/app/api` - Backend API Routes

- **orchestrate/**: ⭐ UNIVERSAL GATEKEEPER - alla prompts går härigenom
- **generate/**: ⚠️ GAMMAL - borde gå via orchestrate
- **projects/**: Projekthantering (CRUD + nested routes)
- **auth/**: Autentisering (email/password + OAuth)
- **credits/**: Credits ("diamonds") hantering
- **stripe/**: Betalningar
- **media/**: Media-hantering
- **vercel/**: Vercel deployment
- **audit/**: Website audit
- **text/**: Text-hjälpfunktioner
- **admin/**: Admin operations

### `/app/src/components` - React Components

- **builder/**: Builder-komponenter (ChatPanel, CodePreview, etc.)
- **templates/**: ❌ **SAKNAS!** Men importeras i home-page.tsx och category/[type]/page.tsx
- **media/**: Media-hantering (FileUploadZone, MediaBank, etc.)
- **modals/**: Modaler (FinalizeModal, OnboardingModal, etc.)
- **forms/**: Formulärkomponenter
- **layout/**: Layout-komponenter (Navbar, HomePage, etc.)
- **auth/**: Autentisering
- **audit/**: Audit-komponenter
- **ui/**: UI primitives (shadcn/ui)

### `/app/src/lib` - Shared Libraries

- **config.ts**: ⭐ Central config (PATHS, SECRETS, FEATURES)
- **database.ts**: ⭐ SQLite DB (better-sqlite3)
- **orchestrator-agent.ts**: ⭐ UNIVERSAL GATEKEEPER
- **semantic-router.ts**: ⭐ STEG 1: Klassificerar intent (AI SDK 6, gpt-4o-mini, OPENAI_API_KEY)
- **code-crawler.ts**: ⭐ STEG 2: Hittar kod (INGEN AI, bara strängmatchning)
- **semantic-enhancer.ts**: ⭐ STEG 3: Förbättrar prompt (AI SDK 6, gpt-4o-mini, OPENAI_API_KEY)
- **prompt-enricher.ts**: ⭐ STEG 4: Kombinerar allt
- **v0-generator.ts**: ⭐ STEG 5: Anropar v0 API (v0-sdk, V0_API_KEY, BYGGER SAJTER)
- **code-parser.ts**: ⚠️ STOR FIL - bara för Sandpack fallback (används sällan)
- **api-client.ts**: ⚠️ Frontend API client (generateWebsite() - används ej?)
- **store.ts**: ⭐ Builder state (Zustand)
- **auth-store.ts**: Client auth state (Zustand)

### `/docs` - Dokumentation

- **information.md**: ⭐ Huvuddokumentation (projektöversikt)
- **SUGGESTED_IMPROVEMENTS.md**: Roadmap
- **gpt-api/**: OpenAI API referens
- **v0_doc/**: v0 API referens

## ⚠️ PROBLEM & OANVÄNDA FILER

### 1. ❌ SAKNAS: `/app/src/components/templates/`

**Problem**: TemplateGallery, LocalTemplateCard, PreviewModal importeras men finns inte!

- **home-page.tsx** (rad 26): `import { TemplateGallery } from "@/components/templates";`
- **category/[type]/page.tsx** (rad 8, 42): `import { LocalTemplateCard, PreviewModal } from "@/components/templates";`

**Åtgärd**: Skapa mappen och komponenterna, eller ta bort importen om de inte behövs.

### 2. ⚠️ GAMMAL LOGIK: `/app/src/app/api/generate/route.ts`

**Problem**: Dokumentationen säger att `/api/orchestrate` är universal gatekeeper, men `/api/generate` finns kvar.

- **api-client.ts** (rad 86): `generateWebsite()` anropar `/api/generate`
- **Dokumentation**: "ERSÄTTER gamla /api/refine - all refinement går nu genom orchestrator"

**Åtgärd**:

- Kontrollera om `/api/generate` fortfarande används
- Om inte: ta bort filen och `generateWebsite()` från api-client.ts
- Om ja: uppdatera dokumentationen eller migrera till orchestrate

### 3. ⚠️ STOR OANVÄND FIL: `/app/src/lib/code-parser.ts`

**Problem**: Stor fil (~600+ rader) som bara används för Sandpack fallback (används sällan).

- **code-preview.tsx**: Sandpack är endast fallback när demoUrl saknas
- **Dokumentation**: "Sandpack används sällan i praktiken"

**Åtgärd**:

- Överväg att flytta Sandpack-logik till separat fil
- Eller behåll som backup om v0 API skulle misslyckas

### 4. ⚠️ OANVÄND FUNKTION: `generateWebsite()` i api-client.ts

**Problem**: Funktionen finns kvar men används kanske inte längre.

- **api-client.ts** (rad 86): `generateWebsite()` anropar `/api/generate`
- **ChatPanel**: Använder direkt `/api/orchestrate` istället

**Åtgärd**:

- Sök efter användningar av `generateWebsite()`
- Om oanvänd: ta bort funktionen
- Om använd: dokumentera varför

### 5. ⚠️ DEPENDENCY: `@codesandbox/sandpack-react`

**Problem**: Stort dependency (~2MB) som används sällan (endast fallback).

- **package.json**: `"@codesandbox/sandpack-react": "^2.20.0"`
- **Användning**: Endast i code-preview.tsx som fallback

**Åtgärd**:

- Överväg att behålla som optional dependency
- Eller ta bort om v0 API alltid fungerar

### 6. ⚠️ POTENTIELLT GAMMAL LOGIK: `/app/src/lib/api-client.ts`

**Problem**: Filen dokumenterar `/api/generate` som huvudendpoint, men `/api/orchestrate` är den nya.

- **Dokumentation i filen**: "POST /api/generate → generateWebsite()"
- **Verklighet**: ChatPanel använder `/api/orchestrate` direkt

**Åtgärd**:

- Uppdatera dokumentationen i api-client.ts
- Eller ta bort filen om den inte används

## ✅ BRA STRUKTUR

### 1. ⭐ Tydlig Pipeline

- Orchestrator → Semantic Router → Code Crawler → Semantic Enhancer → Prompt Enricher → v0 API
- Varje steg har tydlig roll och separation of concerns

### 2. ⭐ Central Config

- `config.ts` hanterar allt (PATHS, SECRETS, FEATURES)
- Auto-växling mellan dev/prod

### 3. ⭐ Bra Dokumentation

- `docs/information.md` är omfattande och uppdaterad
- Tydlig struktur och beskrivningar

### 4. ⭐ MCP Server

- Bra integration med Cursor för AI-agenter
- Dokumentation och error handling

## ⚠️ VIKTIGT: SDK-ANVÄNDNING

**Tre separata SDK:er**:

1. **AI SDK 6** (`ai`) → Semantic Router/Enhancer → `OPENAI_API_KEY`
2. **v0 SDK** (`v0-sdk`) → Kodgenerering → `V0_API_KEY`
3. **OpenAI SDK** (`openai`) → Bildgenerering/Web Search → `OPENAI_API_KEY`

**v0 API är HELT SEPARAT från AI SDK 6** - se `AI_SDK_6_FORKLARING.md` för detaljer.

## REKOMMENDATIONER

1. **SKAPA `/app/src/components/templates/`** med TemplateGallery, LocalTemplateCard, PreviewModal
2. **TA BORT `/app/src/app/api/generate/route.ts`** om den inte används längre
3. **UPPDATERA dokumentationen** i api-client.ts om generateWebsite() inte används
4. **OPTIMERA code-parser.ts** genom att flytta Sandpack-logik till separat fil
5. **SÖK EFTER användningar** av generateWebsite() och ta bort om oanvänd
6. **ÖVERVÄG att ta bort** @codesandbox/sandpack-react om v0 API alltid fungerar
