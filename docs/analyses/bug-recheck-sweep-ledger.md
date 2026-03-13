# Bug Recheck Sweep Ledger

Rolling validation and fix log for the March 2026 `jakob` bug sweep.

Related execution plan:
`docs/plans/active/2026-03-bug-recheck-sweep.md`

## 2026-03-13 - Initial triage

### Scope

- Read both input reports.
- Cross-checked current code paths for all 12 reported issues.
- Classified findings into confirmed, likely, and re-test-before-fix buckets.

### Files checked

- `_input_for_cursor/sajtmaskin_jakob_buggsammanstallning_recheck_2.md`
- `_input_for_cursor/sajtmaskin_jakob_buggsammanstallning_recheck_3.md`
- `src/app/builder/useBuilderPageController.ts`
- `src/lib/project-env-vars.ts`
- `src/lib/db/services/projects.ts`
- `src/lib/openclaw/openclaw-store.ts`
- `src/app/api/v0/chats/route.ts`
- `src/app/api/v0/chats/[chatId]/files/route.ts`

### Verdict

- Strongest first-step issue is env-var storage integrity (`#8`, `#9`).
- Confirmed route parity and identifier issues exist around file routes and own-engine chat creation (`#3`, `#11`, `#12`).
- Ownership/session work likely includes a second bug beyond the input reports: cache keys do not fully reflect session-scoped visibility.
- Prompt handoff retry (`#2`) and guest-policy mismatch (`#4`) look real.
- OpenClaw placeholder targeting (`#7`) looks real; stale-history report (`#6`) needs re-test rather than direct fix.

### Tests run

- Static code validation only so far.

### Fixes made

- None yet.

### Follow-up risks

- Env-var repair may require a raw-data audit after the code fix if some rows were already degraded.
- Ownership/cache changes can alter current guest-to-user migration behavior and should be verified carefully.

## 2026-03-13 - Security pass completed

### Scope

- Fixed the confirmed env-var storage bugs (`#8`, `#9`).
- Folded in two adjacent integrity issues discovered during verification:
  - fail-open sensitive writes when `ENV_VAR_ENCRYPTION_KEY` is missing
  - partial project `meta` saves overwriting previously stored env-vars

### Files checked

- `src/lib/project-env-vars.ts`
- `src/lib/project-env-vars.test.ts`
- `src/lib/crypto/env-var-cipher.ts`
- `src/app/api/v0/projects/[projectId]/env-vars/route.ts`
- `src/app/api/projects/[id]/save/route.ts`

### Verdict

- Raw storage and display/runtime representations are now separated.
- Sensitive env vars are no longer rewritten in plaintext during unrelated upserts or deletes.
- Sensitive writes now fail closed if the encryption key is missing.
- Project save route now shallow-merges object `meta` updates, which prevents palette-only saves from dropping existing `projectEnvVars`.

### Tests run

- `npx eslint "src/lib/crypto/env-var-cipher.ts" "src/lib/project-env-vars.ts" "src/lib/project-env-vars.test.ts" "src/app/api/projects/[id]/save/route.ts"`
- `npx vitest run "src/lib/project-env-vars.test.ts"`
- `npm run typecheck`

### Fixes made

- Introduced raw stored env-var parsing for write/delete flows.
- Kept masking/decryption strictly on read paths.
- Added targeted regression tests for unrelated upsert/delete, masked display reads, runtime decryption, and fail-closed sensitive writes.
- Hardened `/api/projects/[id]/save` to merge object `meta` payloads with existing persisted `meta`.

### Follow-up risks

- Existing rows that were previously degraded to plaintext still need a one-time audit/re-encryption strategy if they exist in real data.
- The current `meta` merge is shallow by design; if nested `meta` objects become common later, a deeper merge contract may be needed.

## 2026-03-13 - API parity and identifier pass completed

### Scope

- Fixed the confirmed API parity/identifier issues (`#3`, `#11`, `#12`).
- Folded in the adjacent versions-route asymmetry so own-engine version history no longer exposes a misleading pin action.

### Files checked

- `src/app/api/v0/chats/[chatId]/files/route.ts`
- `src/app/api/v0/chats/[chatId]/files/route.test.ts`
- `src/app/api/v0/chats/route.ts`
- `src/app/api/v0/chats/stream/route.ts`
- `src/app/api/v0/chats/[chatId]/versions/route.ts`
- `src/components/builder/VersionHistory.tsx`
- `src/lib/tenant.ts`

### Verdict

- Own-engine `PATCH` / `DELETE` file mutations now stay on the own-engine path and no longer fall through to v0-only handling.
- Own-engine chat creation no longer stores chats under `"default"` or synthetic local placeholders in the sync/stream create paths; it now resolves a real app project id or fails loudly.
- Fallback `GET /api/v0/chats` now truly filters by project instead of accepting `projectId` and ignoring it.
- Own-engine versions now explicitly advertise `canPin: false`, and the UI hides the pin control for those versions.

### Tests run

- `npx vitest run "src/app/api/v0/chats/[chatId]/files/route.test.ts"`
- `npx eslint "src/lib/tenant.ts" "src/app/api/v0/chats/route.ts" "src/app/api/v0/chats/stream/route.ts" "src/app/api/v0/chats/[chatId]/files/route.ts" "src/app/api/v0/chats/[chatId]/files/route.test.ts"`
- `npx eslint "src/app/api/v0/chats/[chatId]/versions/route.ts" "src/components/builder/VersionHistory.tsx"`
- `npm run typecheck`

### Fixes made

- Added own-engine branches for file `PATCH` and `DELETE`.
- Added `resolveAppProjectIdForRequest()` in `tenant.ts` and used it in both sync and stream own-engine creation paths.
- Filtered fallback chat list results against the requested project instead of returning the full `v0.chats.find()` set.
- Marked own-engine versions as non-pinnable in the API and hid the pin button in `VersionHistory`.

### Follow-up risks

- The fallback chat-list route still has only static/type verification right now; it would benefit from a targeted route test around project filtering.
- Own-engine file responses still expose a `locked` field only as a response convenience. Own-engine file storage does not persist a true lock concept yet.

## 2026-03-13 - Ownership and cache pass completed

### Scope

- Fixed the guest-claim race (`#5`).
- Fixed the adjacent cache-scope mismatch around user/session visibility in project routes.

### Files checked

- `src/lib/db/services/projects.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/projects/[id]/save/route.ts`

### Verdict

- Session-owned guest projects are now claimed synchronously with `UPDATE ... RETURNING`, and `getProjectByIdForOwner()` returns the claimed row immediately instead of racing a background update.
- Project caches now scope more accurately to `user + session` when both influence visibility.
- Write/save invalidation now clears the relevant user-only and session-only variants in addition to the combined key.
- Authenticated reads also clear stale session-only cache entries for the same session in list/detail routes.

### Tests run

- `npx eslint "src/lib/db/services/projects.ts" "src/app/api/projects/route.ts" "src/app/api/projects/[id]/route.ts" "src/app/api/projects/[id]/save/route.ts"`
- `npm run typecheck`

### Fixes made

- Replaced background project claim with awaited claim + refresh logic in `getProjectByIdForOwner()`.
- Expanded cache segment handling so list/detail/save invalidation can target `user`, `session`, and combined `user:session` variants.
- Added best-effort cleanup of stale `session:` cache entries on authenticated project reads.

### Follow-up risks

- This pass still lacks a live Redis/DB integration test that proves claim + cache invalidation behavior end-to-end across guest -> login transitions.
- If more routes start caching project visibility in the future, they must follow the same owner/session segmentation rules.

## 2026-03-13 - Builder prompt and guest-policy pass completed

### Scope

- Fixed the confirmed builder prompt retry / guest-policy issues (`#2`, `#4`).
- Re-validated `#1` before changing it and only kept the parts that still represented a real recovery problem.

### Files checked

- `src/app/builder/useBuilderPageController.ts`
- `src/app/builder/useBuilderProjectActions.ts`
- `src/app/api/prompts/route.ts`
- `src/app/api/prompts/[id]/route.ts`
- `src/app/api/projects/route.ts`

### Verdict

- Prompt handoff fetches now distinguish terminal not-found failures from transient failures.
- Transient prompt fetch failures keep `promptId` alive and schedule a controlled retry instead of clearing the URL state.
- Builder no longer auto-opens the auth modal just because the user is logged out.
- Explicit project save is now guest-friendly and uses the same session-backed project model as the rest of the builder.
- Prompt handoff create/consume and guest project creation now mint/attach a session cookie when needed.
- Original report `#1` no longer looked real in its original form after re-check; the remaining real gap was transient retry recovery, which is now fixed.

### Tests run

- `npx eslint "src/app/builder/useBuilderPageController.ts" "src/app/builder/useBuilderProjectActions.ts" "src/app/api/prompts/route.ts" "src/app/api/prompts/[id]/route.ts" "src/app/api/projects/route.ts"`
- `npm run typecheck`

### Fixes made

- Added status-aware prompt handoff error handling and retry scheduling in `useBuilderPageController`.
- Removed the unconditional logged-out auth modal trigger from the builder shell controller.
- Removed the auth-only gate from explicit project save in `useBuilderProjectActions`.
- Switched guest-capable prompt/project creation routes to `ensureSessionIdFromRequest()` and attached `Set-Cookie` where required.

### Follow-up risks

- This pass is verified by code inspection plus lint/typecheck, not by browser automation.
- A request that gets rate-limited before the handler body runs may still miss session-cookie minting on that first response.

## 2026-03-13 - OpenClaw state pass completed

### Scope

- Fixed the confirmed OpenClaw placeholder targeting bug (`#7`).
- Re-tested the stale-history concern (`#6`) and fixed the remaining code-level snapshot risk that still looked actionable.

### Files checked

- `src/lib/openclaw/openclaw-store.ts`
- `src/lib/openclaw/openclaw-store.test.ts`
- `src/components/openclaw/useOpenClawChat.ts`
- `src/components/openclaw/OpenClawChatPanel.tsx`

### Verdict

- Assistant stream updates now target the correct placeholder by message id instead of rewriting the last assistant message positionally.
- Clearing the OpenClaw conversation now aborts any in-flight stream before wiping state.
- The request payload now uses an explicit `nextConversation` snapshot built from the latest store state instead of the hook render snapshot, which closes the remaining reproducible-looking part of `#6`.

### Tests run

- `npx vitest run "src/lib/openclaw/openclaw-store.test.ts"`
- `npx eslint "src/lib/openclaw/openclaw-store.ts" "src/lib/openclaw/openclaw-store.test.ts" "src/components/openclaw/useOpenClawChat.ts" "src/components/openclaw/OpenClawChatPanel.tsx"`
- `npm run typecheck`

### Fixes made

- Replaced positional assistant updates with `updateAssistantMessage(id, content)`.
- Routed stream/error/empty-response updates through the per-request placeholder id.
- Added `clearConversation()` to abort active streams before clearing store state.
- Switched API payload construction to a deterministic `nextConversation` array derived from current store state.
- Added targeted regression coverage for store-level assistant targeting.

### Follow-up risks

- There is still no hook/component-level test proving that no late stream chunk lands after `clearConversation()`.
- Browser-level validation would still be valuable for multi-turn OpenClaw UX, especially around rapid clear/send sequences.

## 2026-03-13 - Admin auth pass completed

### Scope

- Fixed the confirmed admin auth hardening issue (`#10`).
- Normalized admin route semantics across the dedicated `/api/admin/*` tree.

### Files checked

- `src/lib/auth/admin.ts`
- `src/app/api/admin/env/route.ts`
- `src/app/api/admin/env/compare/route.ts`
- `src/app/api/admin/database/route.ts`
- `src/app/api/admin/prompt-logs/route.ts`
- `src/app/api/admin/templates/sync/route.ts`
- `src/app/api/admin/templates/embeddings/route.ts`
- `src/app/api/admin/vercel/env/route.ts`
- `src/app/api/admin/vercel/projects/route.ts`
- `src/app/api/admin/vercel/projects/[projectId]/route.ts`
- `src/app/api/admin/vercel/team-status/route.ts`

### Verdict

- Admin auth is now centralized in one helper instead of being repeated route-by-route before local `try/catch`.
- Dedicated admin routes now consistently return:
  - `401` when no user is present
  - `403` when the user exists but is not an admin
  - `503` when admin auth lookup itself fails
- `admin/vercel/team-status` now matches sibling Vercel admin routes by returning `503` when Vercel is not configured.

### Tests run

- `npx eslint "src/lib/auth/admin.ts" "src/app/api/admin/**/*.ts"`
- `npm run typecheck`

### Fixes made

- Added `requireAdminAccess()` in `src/lib/auth/admin.ts`.
- Switched all 10 routes under `src/app/api/admin/` to the shared helper.
- Removed route-local ad hoc admin checks based on mixed `TEST_USER_EMAIL` / `isAdminEmail*` patterns.
- Normalized the Vercel team-status configuration-failure response to `503`.

### Follow-up risks

- This pass is static verification only; there is still no HTTP-level route test that exercises `401` vs `403` vs `503`.
- The normalization in this pass covers `src/app/api/admin/`; there may still be admin-like routes outside that tree that should eventually adopt the same helper.

## 2026-03-13 - Closeout completed

### Scope

- Closed the sweep plan lifecycle.
- Updated plan indexes and agent handoff documentation.

### Files checked

- `docs/plans/README.md`
- `docs/plans/active/README.md`
- `docs/plans/review-needed/README.md`
- `docs/plans/review-needed/2026-03-bug-recheck-sweep.md`
- `docs/architecture/agent-roadmap-and-handoff.md`

### Verdict

- The sweep itself is complete.
- The physical plan file was moved out of `active/` and parked in `review-needed/` as a tooling fallback because the `docs/plans/archived/` bucket was not writable in the active editor environment.
- All canonical indexes now reflect that the sweep is no longer active work.

### Tests run

- Documentation-only closeout; no code tests were needed.

### Fixes made

- Removed the sweep plan from `docs/plans/active/`.
- Added a closeout version of the plan in `docs/plans/review-needed/`.
- Updated `docs/plans/README.md`, `docs/plans/active/README.md`, `docs/plans/review-needed/README.md`, and `docs/architecture/agent-roadmap-and-handoff.md`.

### Follow-up risks

- If the archive bucket becomes writable later, the closed plan file should be moved from `review-needed/` to `archived/` for perfect lifecycle hygiene.

## 2026-03-13 - Regression pass completed

### Scope

- Compared `jakob` branch HEAD against its merge-base with `main` (~13 h of prior agent work).
- Identified six regression areas introduced or worsened during the earlier sweep.
- Implemented and verified all fixes in a single pass.

### Areas fixed

#### 1. Backend safety — tenant fallback and preview gating

- `src/app/api/v0/chats/[chatId]/route.ts`
- `src/app/api/v0/chats/[chatId]/versions/route.ts`
- `src/lib/db/engine-version-lifecycle.ts`

Chat-read and versions-read routes now verify project ownership before
returning v0-fallback data and suppress preview URLs for failed engine
versions. `verificationState === "pending"` is now treated as `"verifying"`
instead of mapping to `"ready"`.

#### 2. Stream finalization — duplicate done events and analytics

- `src/app/api/v0/chats/stream/route.ts`
- `src/lib/gen/stream/finalize-version.ts`

Eliminated a race that could send two `done` SSE events to the client.
Autofix progress now always emits a terminal `phase: "done"` event.
Blocked-preflight generations are logged as `success: false` with a
descriptive note.

#### 3. Environment variable stability

- `src/lib/project-env-vars.ts`

Legacy env-var entries that predate the `id` field now receive a
deterministic `legacy:KEY` identifier instead of `crypto.randomUUID()`,
preventing phantom duplicates on every read.

#### 4. Builder tooling — quick-reply and post-check status

- `src/components/builder/BuilderMessageTooling.tsx`
- `src/lib/hooks/chat/post-checks.ts`

Synthetic approval buttons now only render for explicit approval requests
or questions identified as approval-like. Post-check status distinguishes
between quality-gate-pending, autofix-queued, and general provisional states.

#### 5. OpenClaw surface — token gating, scope isolation, mobile layout

- `src/lib/config.ts`
- `src/lib/openclaw/status.ts`
- `src/app/api/openclaw/tips/route.ts`
- `src/lib/openclaw/openclaw-store.ts`
- `src/components/openclaw/useOpenClawChat.ts`
- `src/components/openclaw/OpenClawChat.tsx`
- `src/components/openclaw/OpenClawChatPanel.tsx`

`surfaceEnabled` now requires `OPENCLAW_GATEWAY_TOKEN` in addition to
URL and feature flag. The tips route fails fast with 503 when the surface
is disabled. The chat store resets messages when navigating between
builder routes. Panel sizing is viewport-clamped for narrow screens.

#### 6. Regression tests

New targeted test files covering all five areas above:

- `src/app/api/v0/chats/[chatId]/route.test.ts`
- `src/app/api/v0/chats/[chatId]/versions/route.test.ts`
- `src/lib/gen/stream/finalize-version.test.ts`
- `src/components/builder/BuilderMessageTooling.test.tsx`
- `src/components/openclaw/OpenClawChatPanel.test.tsx`
- `src/lib/openclaw/status.test.ts`

Expanded existing tests:

- `src/lib/project-env-vars.test.ts` (deterministic legacy IDs)
- `src/lib/openclaw/openclaw-store.test.ts` (scope-change reset)

### Tests run

- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — 23 files, 101 tests passed (including all new DOM tests)
- `ReadLints` on all modified files — 0 errors

### Follow-up risks

- No live browser-automation test covers the OpenClaw scope-reset or mobile panel layout.
- The builder quick-reply heuristic (`looksLikeApprovalQuestion`) is pattern-based and may need tuning for new prompt phrasings.
- `canExposeEnginePreview` gates on `resolveEngineVersionLifecycleStatus !== "failed"` which is generous; a stricter gate on `"ready"` or `"promoted"` could be considered later.
