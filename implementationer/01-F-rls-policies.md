# 01-F: Fix Supabase RLS (Row-Level Security) Policies

**Reference:** [LLM/ROADMAP-next.txt](../LLM/ROADMAP-next.txt) — Section F  
**Roadmap:** `implementationer/README.md` — Steg 1 av 6  
**Status:** [ ] Ej påbörjad  
**Priority:** HIGH (security-critical)  
**Effort:** LOW  
**Beroenden:** Inga — kan köras först  

---

## 1. Summary

RLS is enabled on Supabase but uses "Allow all" policies — no actual data isolation between users. This plan defines two approaches and a step-by-step checklist to secure the database.

---

## 2. Auth Architecture (Critical Note)

The app **does not use Supabase Auth**. It uses:

- **Own JWT-based auth** (`src/lib/auth/auth.ts`) — JWT in cookie `sajtmaskin_auth` or Bearer header
- **Drizzle ORM** with `POSTGRES_URL` (direct PostgreSQL connection)
- **No `auth.uid()`** — standard Supabase RLS expressions like `auth.uid() = user_id` will not work

Standard RLS policies assume Supabase Auth; we must either bypass RLS (Approach A) or use a custom session variable (Approach B).

---

## 3. Supabase / Drizzle Context

- **Connection:** `POSTGRES_URL` → `aws-1-eu-west-1.pooler.supabase.com` (project `qrbhuokhrfwujmcrvhkn`)
- **Client:** `src/lib/db/client.ts` — single Pool, single connection string
- **Schema:** `src/lib/db/schema.ts`

---

## 4. Two Approaches

### Approach A (Recommended): App-Layer Enforcement + Service Role Bypass

**Concept:** Use the existing connection (effectively service-role equivalent — bypasses RLS). Enforce isolation entirely at the application layer by ensuring every query includes `WHERE user_id = ?` (or equivalent ownership filter). Verify and add missing filters.

**Pros:**
- No DB schema changes
- No `SET LOCAL` plumbing
- Works with current auth (JWT → `getCurrentUser` → userId)
- Lower risk of breaking existing flows

**Cons:**
- Defense is single-layer (app only)
- A bug or forgotten filter = data leak

**Actions:**
1. Confirm `POSTGRES_URL` connects as a role that bypasses RLS (or keep RLS disabled/allow-all).
2. Audit all DB access paths — ensure `user_id`, `project_id`, or `session_id` filters everywhere.
3. Add missing filters where queries lack ownership checks.
4. Document ownership model per table.

---

### Approach B: Full RLS with `app.current_user_id`

**Concept:** Create a session variable `app.current_user_id`, set per-request via `SET LOCAL app.current_user_id = 'user-xxx'` after auth. RLS policies use `current_setting('app.current_user_id', true) = user_id`.

**Pros:**
- Defense-in-depth — DB enforces isolation even if app has bugs
- Closer to Supabase best practices

**Cons:**
- Requires middleware or per-request DB setup
- Must set variable on every connection (pool reuse complicates this)
- More complex — need to handle guest users, webhooks, cron jobs

**Implementation sketch:**
1. Create a DB function or use `SET LOCAL` in a transaction wrapper.
2. For each request with an authenticated user: `await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);` — must run at start of transaction/connection.
3. For guest/session: `app.current_user_id` could be `guest:<sessionId>` and policies use `session_id = ...`.
4. Webhooks / background jobs: use a dedicated role or `SET LOCAL` to a service identity.

---

## 5. Per-Table Policy Requirements

### Tables with direct `user_id` (ownership)

| Table | Ownership Column | RLS Condition (Approach B) | Notes |
|-------|------------------|----------------------------|-------|
| `projects` | `user_id` | `user_id = current_setting('app.current_user_id', true)` | v0 projects; nullable for unclaimed |
| `app_projects` | `user_id`, `session_id` | `user_id = current_setting(...) OR (user_id IS NULL AND session_id = current_setting('app.session_id', true))` | Guest + user |
| `media_library` | `user_id` | `user_id = current_setting(...)` | User-only |
| `transactions` | `user_id` | `user_id = current_setting(...)` | User-only |
| `user_audits` | `user_id` | `user_id = current_setting(...)` | User-only |
| `domain_orders` | via `project_id` | Join to `app_projects` or `projects` for user | No direct user_id |
| `prompt_logs` | `user_id` | `user_id = current_setting(...) OR user_id IS NULL` | Logs; some rows anonymous |
| `users` | `id` | `id = current_setting(...)` | User sees only own row |

### Tables with ownership via FK (project_id → project → user_id)

| Table | Ownership path | RLS Condition |
|-------|----------------|----------------|
| `chats` | `project_id` → `projects.user_id` | `EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = current_setting(...))` |
| `versions` | `chat_id` → chats → projects | Same pattern via chat/project join |
| `version_error_logs` | `chat_id` → chats → projects | Same |
| `deployments` | `project_id` → projects | Same |
| `company_profiles` | `project_id` → app_projects | Join to app_projects |
| `user_integrations` | `user_id` | `user_id = current_setting(...)` |

### Tables with `session_id` (guest/unclaimed)

| Table | Access model | RLS Condition |
|-------|--------------|---------------|
| `guest_usage` | Session-scoped | `session_id = current_setting('app.session_id', true)` |
| `prompt_handoffs` | `user_id` or `session_id` | Match either |

### Tables that are shared / public (no RLS or allow all)

| Table | Reason |
|------|--------|
| `page_views` | Analytics; no per-user isolation |
| `template_cache` | Shared cache (user_id can be null) |
| `registry_cache` | Shared cache |
| `kostnadsfri_pages` | Password-protected by slug; different access model |

### Special cases

- **`users`:** User can SELECT/UPDATE only their own row. INSERT handled by auth (registration). No DELETE.
- **`kostnadsfri_pages`:** Access by slug + password; no user column in schema. Keep allow-all or custom policy by slug if needed.
- **`domain_orders`:** No `user_id`; access via `project_id` → app_projects or projects.

---

## 6. Step-by-Step Implementation Checklist

### Phase 1: Audit & Document (Approach A prerequisite)

- [ ] **1.1** List all API routes and server actions that touch the DB
- [ ] **1.2** For each route: verify `getCurrentUser` or equivalent is called and userId/sessionId passed to services
- [ ] **1.3** For each DB service call: verify `WHERE user_id = ?` or `WHERE project_id IN (user's projects)` or equivalent
- [ ] **1.4** Flag queries that lack ownership filters (e.g. `getRecentPromptLogs` — currently no user filter)
- [ ] **1.5** Document which tables are read/written by which routes

### Phase 2: Add Missing App-Layer Filters (Approach A)

- [ ] **2.1** Add `userId` filter to `getRecentPromptLogs` (or restrict to admin-only)
- [ ] **2.2** Audit `prompt_handoffs` — ensure consume/lookup is scoped by user/session
- [ ] **2.3** Audit `version_error_logs` — ensure access only via chat/project ownership chain
- [ ] **2.4** Audit `domains` service — `domain_orders` access only via project ownership
- [ ] **2.5** Audit webhook routes (`/api/webhooks/v0`, `/api/webhooks/vercel`) — ensure they validate ownership via v0 IDs or signatures, not raw DB access
- [ ] **2.6** Add integration tests: two users cannot see each other's data

### Phase 3: Approach A — Verification

- [ ] **3.1** Confirm `POSTGRES_URL` uses a role that bypasses RLS (or RLS remains allow-all)
- [ ] **3.2** Run full regression (E2E or smoke tests)
- [ ] **3.3** Document "Approach A in use" in README or ops runbook

### Phase 4: Approach B (Optional — Full RLS)

- [ ] **4.1** Create migration: `ALTER DATABASE ... SET app.current_user_id = ''` (or use `SET` in connection)
- [ ] **4.2** Create helper: `withUserContext(db, userId, sessionId?, fn)` — sets `app.current_user_id` and `app.session_id`, runs callback
- [ ] **4.3** Integrate `withUserContext` in request middleware or per-route before first DB call
- [ ] **4.4** Drop existing "Allow all" policies
- [ ] **4.5** Add RLS policies per table (SELECT/INSERT/UPDATE/DELETE) using `current_setting('app.current_user_id', true)`
- [ ] **4.6** Handle service/background jobs: use separate connection with `SET LOCAL` to service identity, or disable RLS for that role
- [ ] **4.7** Test with two users; verify cross-user access fails at DB level

---

## 7. Testing Plan

1. **Unit / service tests**
   - Mock `getCurrentUser` → userId A
   - Call service that fetches projects/chats/versions
   - Assert only user A's data returned
   - Repeat for user B

2. **Integration tests**
   - Create user A, create project, create chat
   - Create user B
   - As user B: call API to fetch user A's project by ID → expect 404 or empty
   - As user B: call API to list projects → expect only B's projects

3. **Webhook tests**
   - Simulate v0/vercel webhooks with valid signatures
   - Ensure they only update records that belong to the tenant (project/chat ownership)

4. **Guest flow**
   - Create session as guest, create app_project with session_id
   - Login as user → project should be claimable/visible
   - Verify no guest session can access another guest's project

---

## 8. Rollback Plan

### Approach A (app-layer only)
- **Rollback:** Revert any new `WHERE` filters if they cause regressions
- **No DB state change** — rollback is code-only

### Approach B (full RLS)
- **Before deploy:** Export current RLS policies (`pg_policies`)
- **Rollback:** Restore "Allow all" policies via SQL migration
- **Quick fix:** `ALTER ROLE <app_role> SET row_security = off` (if supported) — temporary, not recommended long-term

---

## 9. Files That Need to Change

### Approach A
- `src/lib/db/services/prompt-logs.ts` — add userId filter to `getRecentPromptLogs`, or restrict to admin
- `src/lib/db/services/projects.ts` — audit `getPromptHandoffById` / `consumePromptHandoff` (scoping)
- `src/lib/db/services/domains.ts` — ensure domain order access is project-scoped
- `src/lib/deployment.ts` — verify deployment/chats/versions access goes through tenant checks
- `src/lib/tenant.ts` — ensure `getChatByV0ChatIdForRequest` and similar are used everywhere
- API routes that call DB directly — audit and add ownership checks
- New: integration test file(s) for cross-user isolation

### Approach B (in addition)
- `src/lib/db/client.ts` or new `src/lib/db/with-user-context.ts` — `withUserContext` helper
- Middleware or request wrapper — call `withUserContext` with `getCurrentUser` result
- New migration(s) — drop allow-all policies, add restrictive policies
- Webhook routes — special handling (service identity or validated tenant)

---

## 10. Quick Reference: Table Ownership

| Table | Owner Column(s) | Access Pattern |
|-------|-----------------|----------------|
| projects | user_id | Direct |
| chats | project_id | Via projects |
| versions | chat_id | Via chats → projects |
| version_error_logs | chat_id | Via chats → projects |
| deployments | project_id | Via projects |
| app_projects | user_id, session_id | Direct, guest support |
| users | id | Self only |
| transactions | user_id | Direct |
| guest_usage | session_id | Direct |
| company_profiles | project_id | Via app_projects |
| media_library | user_id | Direct |
| user_audits | user_id | Direct |
| domain_orders | project_id | Via app_projects/projects |
| prompt_logs | user_id | Direct (nullable for anonymous) |
| user_integrations | user_id | Direct |
| prompt_handoffs | user_id, session_id | Direct |
| page_views | — | Shared (analytics) |
| template_cache | user_id (nullable) | Shared cache |
| registry_cache | — | Shared cache |
| kostnadsfri_pages | — | Password by slug |
