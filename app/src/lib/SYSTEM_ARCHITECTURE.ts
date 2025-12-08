/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    SAJTMASKIN - SYSTEM ARCHITECTURE                       ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  This file documents the data flow and caching architecture.             ║
 * ║  Read this to understand how templates, projects, and caching work.      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ════════════════════════════════════════════════════════════════════════════
 * V0 TEMPLATE SOURCES & HOW TO USE THEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * V0 templates can be accessed in THREE ways:
 *
 * 1. TEMPLATE URL (Community Templates)
 *    URL: https://v0.app/templates/{templateId}
 *    Example: https://v0.app/templates/nano-banana-pro-playground-hkRpZoLOrJC
 *
 *    → Extract templateId: "nano-banana-pro-playground-hkRpZoLOrJC"
 *    → Use with: generateFromTemplate(templateId, quality)
 *    → Creates a NEW chat based on the template
 *
 * 2. CHAT URL (Private/Shared Chats)
 *    URL: https://v0.app/chat/{chatId}
 *    Example: https://v0.app/chat/nano-banana-pro-playground-yPexP3Vk3vD
 *
 *    → Extract chatId: "nano-banana-pro-playground-yPexP3Vk3vD"
 *    → This is an EXISTING conversation, can be continued
 *    → Use existing chatId for refinements
 *
 * 3. NPX SHADCN INSTALL (Block/Component Export)
 *    Command: npx shadcn@latest add "https://v0.app/chat/b/{blockId}?token=..."
 *
 *    → This is for installing components directly into a local project
 *    → Not used by Sajtmaskin (we use v0 API instead)
 *    → Useful for developers who want to install blocks manually
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DATA STORAGE HIERARCHY (Priority Order)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *                    ┌─────────────────┐
 *                    │  1. REDIS CACHE │  ← Fastest, 1-24h TTL
 *                    │  (Short-lived)  │
 *                    └────────┬────────┘
 *                             │ miss?
 *                             ▼
 *                    ┌─────────────────┐
 *                    │   2. SQLITE DB  │  ← Source of Truth
 *                    │  (Persistent)   │
 *                    └────────┬────────┘
 *                             │ miss?
 *                             ▼
 *                    ┌─────────────────┐
 *                    │   3. V0 API     │  ← External, slow, costs credits
 *                    │  (Generation)   │
 *                    └─────────────────┘
 *
 * ════════════════════════════════════════════════════════════════════════════
 * REDIS KEY STRUCTURE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * USER SESSIONS (TTL: 7 days)
 *   user:session:{userId} → CachedUser JSON
 *   - Caches user info to avoid DB queries
 *   - Invalidated on logout or diamond updates
 *
 * PROJECT FILES (TTL: 1 hour, cache only)
 *   project:files:{projectId} → ProjectFile[] JSON
 *   - Fast cache for takeover projects
 *   - SQLite is the source of truth
 *   - TTL refreshed on every read
 *
 * PROJECT METADATA (TTL: 1 hour)
 *   project:meta:{projectId} → ProjectMeta JSON
 *   - Project ownership, storage type, etc.
 *
 * TEMPLATE PREVIEWS (TTL: 24 hours)
 *   preview:{templateId} → CachedPreview JSON
 *   - Caches demoUrl, chatId for template gallery
 *   - Reduces v0 API calls significantly
 *
 * RATE LIMITING
 *   ratelimit:{key} → Counter
 *   - Prevents API abuse
 *   - Auto-expires based on window
 *
 * VIDEO JOBS (TTL: 1 hour)
 *   video:job:{videoId} → VideoJob JSON
 *   - Tracks async video generation (Sora)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SQLITE TABLES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * users           → User accounts (Google, email, anonymous)
 * projects        → Project metadata (name, category, owner)
 * project_data    → V0 chat state (chatId, demoUrl, code, files, messages)
 * project_files   → Takeover project files (persistent storage)
 * template_cache  → Cached v0 template results (avoids duplicate generations)
 * template_screenshots → Cached screenshots for template gallery
 * images          → Uploaded user images
 * transactions    → Credit purchases
 * page_views      → Analytics
 * guest_usage     → Anonymous user tracking
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TEMPLATE LOADING FLOW
 * ════════════════════════════════════════════════════════════════════════════
 *
 * User clicks "Edit" on a template:
 *
 * 1. ChatPanel receives templateId from URL params
 *
 * 2. Check if project has existing data:
 *    - hasExistingData = true → Skip generation, load from DB
 *    - hasExistingData = false → Continue to step 3
 *
 * 3. handleTemplateGeneration(templateId):
 *    a) Check SQLite template_cache → If hit, return cached result
 *    b) If miss, call v0 Platform API:
 *       - Creates new chat from template
 *       - Returns: chatId, demoUrl, files, code
 *    c) Cache result in SQLite for future use
 *
 * 4. Store results:
 *    - setChatId(chatId)      → For refinements
 *    - setDemoUrl(demoUrl)    → For iframe preview
 *    - setFiles(files)        → For code view & download
 *    - setCurrentCode(code)   → For code display
 *
 * 5. Auto-save to project_data table
 *
 * ════════════════════════════════════════════════════════════════════════════
 * REFINEMENT FLOW (Editing existing code)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * User types instruction and submits:
 *
 * 1. handleRefinement(instruction):
 *    - Uses existing chatId for conversation continuity
 *    - Sends current code + instruction to v0 API
 *
 * 2. V0 API returns:
 *    - Updated code and files
 *    - New demoUrl (same chatId, new version)
 *
 * 3. Update UI and save to database
 *
 * ════════════════════════════════════════════════════════════════════════════
 * IMPORTANT: RACE CONDITION PREVENTION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * React StrictMode runs effects twice in development. To prevent:
 *
 * 1. Double API calls:
 *    - Use refs (not state) for synchronous guards
 *    - isLoadingProjectRef tracks current load
 *    - hasLoadedProjectRef tracks completed loads
 *
 * 2. Double generations:
 *    - sessionStorage tracks generation state
 *    - GENERATION_TIMEOUT_MS prevents stale blocks
 *    - SAME_KEY_COOLDOWN_MS prevents immediate re-runs
 *
 * 3. Component unmount during fetch:
 *    - isMounted flag in useEffect
 *    - Reset refs on unmount to allow retry
 *
 * ════════════════════════════════════════════════════════════════════════════
 * VERCEL DEPLOYMENT (Manual Publishing Only!)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IMPORTANT: Auto-deployment has been REMOVED from project save!
 *
 * OLD BEHAVIOR (removed):
 *   - Every project save triggered Vercel deployment
 *   - This caused constant builds during editing
 *   - Wasted deployment quota
 *
 * NEW BEHAVIOR (current):
 *   - During editing: Use v0's demoUrl for preview (instant, no build)
 *   - When publishing: Call POST /api/vercel/deploy manually
 *
 * WORKFLOW:
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  EDITING MODE                                                       │
 *   │  ─────────────                                                      │
 *   │  User edits → Save to SQLite → Preview via v0's demoUrl             │
 *   │                                (iframe, instant, no build)          │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │  PUBLISHING MODE                                                    │
 *   │  ───────────────                                                    │
 *   │  User clicks "Publish" → POST /api/vercel/deploy                    │
 *   │                          → Vercel builds and deploys                │
 *   │                          → Production URL generated                 │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * WHY v0's demoUrl IS BETTER FOR PREVIEWS:
 *   - Instant (no build time)
 *   - No deployment quota usage
 *   - Always up-to-date with latest v0 version
 *   - Free with v0 API
 *
 * ════════════════════════════════════════════════════════════════════════════
 * API KEY PURPOSES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * V0_API_KEY:
 *   - Code generation only (v0-sdk)
 *   - Returns: chatId, demoUrl, files, versionId
 *   - Cannot generate images or access external APIs
 *
 * OPENAI_API_KEY:
 *   - Image generation (gpt-image-1, dall-e-3)
 *   - Text analysis, web search
 *   - Video generation (Sora)
 *   - Transcription (Whisper)
 *
 * VERCEL_API_TOKEN:
 *   - ONLY for manual publishing
 *   - NOT for previews during editing
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ENVIRONMENT VARIABLES (.env.local)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * # V0 API (Required for code generation)
 * V0_API_KEY=your_v0_api_key
 *
 * # OpenAI (Required for images, analysis, video)
 * OPENAI_API_KEY=your_openai_key
 *
 * # Vercel (ONLY for manual publishing, not previews)
 * VERCEL_API_TOKEN=your_vercel_token
 *
 * # Redis (Optional but recommended)
 * REDIS_HOST=redis-xxx.cloud.redislabs.com
 * REDIS_PORT=12352
 * REDIS_USERNAME=default
 * REDIS_PASSWORD=your_password
 *
 * # Vercel Blob (For image uploads in production)
 * BLOB_READ_WRITE_TOKEN=your_blob_token
 *
 * # Unsplash (For stock photos)
 * UNSPLASH_ACCESS_KEY=your_unsplash_key
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DEBUGGING TIPS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Console logs to look for:
 *
 * [Builder] Project data loaded:     → Project successfully loaded from DB
 * [Builder] Project already loaded:  → Duplicate load prevented (good!)
 * [ChatPanel] Loading template:      → Template generation started
 * [API /template] Returning CACHED:  → Using cached template (fast)
 * [v0-generator] demoUrl:            → Check if v0 returned preview URL
 * [Redis] Cache hit/miss:            → Track caching effectiveness
 *
 * Common issues:
 *
 * 1. "Component unmounted, skipping project load"
 *    → React StrictMode, will retry on remount
 *
 * 2. "demoUrl: undefined" after generation
 *    → V0 might have returned text instead of code
 *    → Check if prompt was too short/vague
 *
 * 3. "[code-parser] Found code blocks: 0"
 *    → V0 returned explanation text, not code
 *    → Need more specific prompt
 *
 */

// This is a documentation-only file. No exports needed.
// The architecture is implemented across:
//
// - lib/redis.ts          → Redis caching functions
// - lib/database.ts       → SQLite operations
// - lib/v0-generator.ts   → V0 API wrapper
// - lib/api-client.ts     → Frontend API client
// - lib/store.ts          → Zustand state management
// - app/builder/page.tsx  → Builder page with project loading
// - components/chat-panel.tsx → Chat and generation logic

export {};
