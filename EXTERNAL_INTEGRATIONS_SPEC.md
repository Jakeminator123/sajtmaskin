# External Integrations Specification

> This document describes the current state and future requirements for
> per-user / per-project integrations in Sajtmaskin. It is intended as a
> reference for any AI agent or developer working on this feature area.
>
> **Created:** 2026-02-09
> **Context:** Conversation about builder entry flows, project IDs, and
> integration architecture.

---

## 1. Current Architecture (Platform-Level Only)

Sajtmaskin currently operates with **shared platform integrations**. Every
user shares the same infrastructure configured via environment variables:

```
┌─────────────────────────────────────────────────────┐
│                Sajtmaskin Platform                   │
│                                                     │
│  process.env:                                       │
│    V0_API_KEY          → v0 Platform API            │
│    POSTGRES_URL        → Supabase PostgreSQL        │
│    VERCEL_TOKEN        → Vercel Deploy API          │
│    BLOB_READ_WRITE_TOKEN → Vercel Blob Storage      │
│    REDIS_URL           → Redis Cache                │
│    AI_GATEWAY_API_KEY  → AI Gateway                 │
│    STRIPE_SECRET_KEY   → Stripe Payments            │
│    GITHUB_CLIENT_ID    → GitHub OAuth               │
│    GOOGLE_CLIENT_ID    → Google OAuth               │
│    UNSPLASH_ACCESS_KEY → Stock Images               │
│                                                     │
│  All users share these. No per-user config.         │
└─────────────────────────────────────────────────────┘
         │              │              │
    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
    │ User A  │   │ User B  │   │ User C  │
    │ Project │   │ Project │   │ Project │
    └─────────┘   └─────────┘   └─────────┘
```

### What the Integration Panel Shows

File: `src/components/builder/IntegrationStatusPanel.tsx`
API: `src/app/api/integrations/status/route.ts`

The panel checks `process.env.*` for each integration and reports OK/missing.
It is **not user-aware** — all users see the same status. There is no
per-user or per-project integration system.

### Integrations Checked (all platform-level)

| Integration           | Env Var(s)                          | Required | Purpose                    |
|----------------------|-------------------------------------|----------|----------------------------|
| v0 Platform API      | `V0_API_KEY`                       | Yes      | Code generation + preview  |
| Postgres (DB)        | `POSTGRES_URL`                     | Yes      | Projects, chats, versions  |
| AI Gateway           | `AI_GATEWAY_API_KEY`               | No       | Prompt-assist + AI calls   |
| v0 Model API         | `V0_API_KEY`                       | No       | Prompt-assist via v0       |
| Vercel API           | `VERCEL_TOKEN`                     | No       | Deploy + domain purchase   |
| Vercel Blob          | `BLOB_READ_WRITE_TOKEN`            | No       | AI-generated images        |
| Redis                | `REDIS_URL` / `KV_URL`             | No       | Caching (optional)         |
| Upstash              | `UPSTASH_REDIS_REST_URL` + TOKEN   | No       | Rate limiting              |
| GitHub OAuth         | `GITHUB_CLIENT_ID` + SECRET        | No       | Private repo import        |
| Google OAuth         | `GOOGLE_CLIENT_ID` + SECRET        | No       | Google sign-in             |
| Stripe               | `STRIPE_SECRET_KEY`                | No       | Credit purchases           |
| Unsplash             | `UNSPLASH_ACCESS_KEY`              | No       | Stock photos               |

---

## 2. The Gap: Per-User / Per-Project Integrations

### What v0.dev Does Natively

When a user builds a project directly on v0.dev, the platform provides:

1. **Integration suggestions in chat** — The AI detects when a project needs
   a database, CMS, analytics, etc., and shows an install button directly in
   the conversation.

2. **Vercel Marketplace connection** — Clicking the install button redirects
   to the Vercel Marketplace where the user can configure (and optionally pay
   for) the integration.

3. **Per-project environment variables** — After installation, env vars are
   set on the v0 project and automatically available in the editor and at
   deploy time.

4. **MCP (Model Context Protocol) integrations** — Users can connect external
   tools (Linear, Notion, PostHog, Sentry, Sanity, Zapier, etc.) that give
   the AI additional context and capabilities.

```
┌──────────────────────────────────────────────────────────────────┐
│                    v0.dev Native Flow                            │
│                                                                  │
│  AI generates code ──► AI detects need ──► Chat shows:          │
│  that needs a DB       for Neon Postgres   "Install Neon?" [btn]│
│                                                    │             │
│                                                    ▼             │
│                                            Vercel Marketplace    │
│                                            User configures +     │
│                                            optionally pays       │
│                                                    │             │
│                                                    ▼             │
│                                            Env vars set on       │
│                                            v0 project            │
│                                                    │             │
│                                                    ▼             │
│                                            Code works with       │
│                                            real DB connection    │
└──────────────────────────────────────────────────────────────────┘
```

### What Sajtmaskin Does Today

```
┌──────────────────────────────────────────────────────────────────┐
│                    Sajtmaskin Current Flow                       │
│                                                                  │
│  AI generates code ──► AI detects need ──► v0 API sends         │
│  that needs a DB       for Neon Postgres   integration event     │
│                                                    │             │
│                                                    ▼             │
│                                            Sajtmaskin stream     │
│                                            parser IGNORES the    │
│                                            event (not handled)   │
│                                                    │             │
│                                                    ▼             │
│                                            User sees nothing.    │
│                                            Code has DB refs      │
│                                            but no connection.    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Technical Details: What Exists in the v0 SDK

The v0 Platform API SDK (`v0-sdk`) already supports per-project
environment variables:

```typescript
// Create env vars for a project
await v0.projects.createEnvVars({
  projectId: "...",
  body: [
    { key: "DATABASE_URL", value: "postgres://...", sensitive: true },
    { key: "NEXT_PUBLIC_CMS_URL", value: "https://..." },
  ],
  upsert: true,
});

// List env vars
const vars = await v0.projects.findEnvVars({ projectId: "..." });

// Update env vars
await v0.projects.updateEnvVars({
  projectId: "...",
  body: [{ id: "env_xxx", value: "new-value" }],
});

// Delete env vars
await v0.projects.deleteEnvVars({
  projectId: "...",
  body: ["env_xxx"],
});
```

The SDK also has Vercel integration methods:

```typescript
// Find linked Vercel projects
await v0.integrations.vercel.projects.find({ projectId: "..." });

// Create Vercel project link
await v0.integrations.vercel.projects.create({ projectId: "..." });
```

### Stream Events Being Ignored

In `src/app/api/v0/chats/stream/route.ts`, the stream parser handles:
- `content` — AI text responses
- `thinking` — AI reasoning
- `parts` — UI parts (code blocks, etc.)
- `chatId` — Chat identifier
- `projectId` — Project identifier
- `done` — Stream complete
- `error` — Error messages

Integration-related events (if sent by v0) are **captured in
`currentEvent` but never forwarded** to the client. They are effectively
dropped.

### Available MCP Preset Integrations (v0 supports)

- Context7 (documentation search)
- Glean (internal company data)
- Hex (data analysis)
- Linear (project management)
- Notion (database management)
- PostHog (analytics)
- Sanity (content management)
- Sentry (error tracking)
- Zapier (workflow automation)
- Granola (meeting notes)

### Vercel Marketplace Database Integrations

- Neon Postgres
- Supabase
- Upstash (Redis / KV)

---

## 4. Implementation Roadmap (High-Level)

To bring per-user integrations to Sajtmaskin, the following work is needed:

### Phase 1: Detect and Surface Integration Signals

**Goal:** Show users when their project needs an integration.

- Modify stream parser to detect integration-related SSE events from v0
- Create a new `StreamEvent` type for integrations
- Forward integration events to the client
- Build a chat UI component that renders integration cards with
  install/configure buttons

**Files to modify:**
- `src/app/api/v0/chats/stream/route.ts` — detect + forward events
- `src/app/api/v0/chats/[chatId]/stream/route.ts` — same
- `src/lib/streaming.ts` — add integration event type
- `src/lib/v0Stream.ts` — add extraction for integration fields
- `src/components/builder/ChatInterface.tsx` — render integration cards

### Phase 2: Per-Project Environment Variables

**Goal:** Let users set env vars on their v0 projects.

- Use `v0.projects.createEnvVars()` to set variables
- Build a UI for managing project env vars in the builder
- Store integration state in `project_data` or a new table

**New API routes:**
- `POST /api/v0/projects/[projectId]/env-vars` — create/update
- `GET /api/v0/projects/[projectId]/env-vars` — list
- `DELETE /api/v0/projects/[projectId]/env-vars` — remove

### Phase 3: Vercel Marketplace Connection

**Goal:** Let users install paid integrations (Neon, Supabase, etc.).

- Implement OAuth/redirect flow to Vercel Marketplace
- After installation, automatically set env vars on the v0 project
- Track which integrations are installed per user/project

**New database table:**
```sql
CREATE TABLE IF NOT EXISTS user_integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  project_id TEXT, -- app project or v0 project
  integration_type TEXT NOT NULL, -- 'neon', 'supabase', 'upstash', etc.
  marketplace_id TEXT, -- Vercel Marketplace integration ID
  status TEXT DEFAULT 'active',
  env_vars JSONB, -- which env vars were set
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Phase 4: MCP Integration Support

**Goal:** Let users connect MCP tools (Linear, Notion, Sentry, etc.).

- Build MCP connection settings UI
- Proxy MCP tool calls through Sajtmaskin's backend
- Store MCP server configurations per user

---

## 5. Key Decisions to Make

1. **Should Sajtmaskin users have their own Vercel accounts?**
   Currently all deploys go through Sajtmaskin's Vercel token. For
   per-user Marketplace integrations, users would need their own Vercel
   account or Sajtmaskin would need to act as a Vercel partner.

2. **Revenue model for integrations?**
   Some Marketplace integrations cost money. Should Sajtmaskin pass
   through costs, bundle them, or handle billing separately?

3. **Which integrations to prioritize?**
   Databases (Neon/Supabase) are the most commonly needed. CMS and
   analytics could follow.

4. **MCP vs Marketplace?**
   MCP integrations are free to connect but require configuration.
   Marketplace integrations may cost money but are simpler to set up.

---

## 6. References

- v0 Platform API docs: https://v0.dev/docs/api/platform
- v0 Environment Variables guide: https://v0.dev/docs/api/platform/guides/environment-variables
- v0 MCP Integrations: https://v0.dev/docs/MCP
- Vercel Marketplace: https://vercel.com/marketplace
- v0 Vercel Integration: https://v0.dev/docs/vercel-integration
- Vercel MCP documentation: https://vercel.com/docs/mcp
