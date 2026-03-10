# Stor Korning Worklog

## Initial Findings

- Confirmed the other agent's scaffold persistence and finalize-path changes are
  present in the workspace.
- (Efter refaktor:) Lokal MCP-topologi använder nu `sajtmaskin-engine` och
  `sajtmaskin-scaffolds` — inga HTTP-proxyer till app routes.
- Confirmed external MCP docs/platform servers are separate from the local
  project servers.

## Planned Sequence

1. Audit and define the target topology.
2. Replace proxy-style local MCP flow with a direct local engine server.
3. Clean names, rules, and unused proxy-only pieces.
4. Validate and summarize.

## Progress

- Created sequenced plan files in `stor_korning`.
- Added `src/lib/mcp/local-engine.ts` as the direct local access layer for
  generated files, manifests, single-file lookup, and runtime creation.
- Added `services/mcp/engine-server.ts` and switched `.cursor/mcp.json` from
  `sajtmaskin-generated-code` to `sajtmaskin-engine`.
- Removed proxy-only local MCP code:
  - `services/mcp/generated-code-server.ts`
  - `src/app/api/integrations/mcp/generated-code/route.ts`
  - `src/app/api/integrations/mcp/generate-site/route.ts`
  - `src/lib/mcp/auth.ts`
- Removed proxy-only env/config references for `MCP_GENERATED_CODE_API_KEY`.
- Updated Cursor MCP routing docs/rules to point at `sajtmaskin-engine`.
- Synced engine scaffold persistence across storage layers:
  - added `scaffold_id` to `src/lib/db/schema.sql`
  - added `scaffoldId` to Drizzle `engineChats`
  - added `scaffold_id` support to `chat-repository-pg.ts`
  - updated local MCP generation to persist scaffold identity on chat create
- Added `stor_korning/04_engine_defaults_and_scaffold_reality.plan.md` for the
  follow-up cleanup/clarity pass.
- Audited build/UI model placement and confirmed `UI1` is not a code concept in
  the repo today.
- Unified the default build tier so builder/UI and server fallbacks now resolve
  to the same default model instead of silently dropping back to `Fast`.
- Centralized own-engine output-token and timeout defaults in
  `src/lib/gen/defaults.ts`, then wired them into engine generation, autofix,
  stream routes, prompt-assist routes, and eval.
- Removed an unused duplicate model-tier helper surface from `src/lib/gen`.
- Normalized internal runtime scaffold defaults so all 10 scaffolds now start
  from a blue `primary`/`ring` baseline, and added subtle blue background
  treatment where the minimal scaffolds had no shared visual base.
- Updated scaffold docs to reflect the real runtime inventory (10 scaffolds),
  and clarified the separation between runtime scaffolds, download scaffold,
  and `_template_refs/`.
- Verified a live own-engine generation completed locally and saved a version
  for chat `9d7dc12e-7b34-4a50-8a25-a37759bb0942`.
- Tightened embedding scaffold fallback so generic `website` prompts no longer
  jump into `auth-pages` or app-style scaffolds without matching keywords.
- Clarified stream logging so build runs now expose tier label plus actual
  engine path/model instead of looking like raw `v0-*` API usage.
- Neutralized the incorrect persisted scaffold for chat
  `9d7dc12e-7b34-4a50-8a25-a37759bb0942` and made follow-up routes honor
  `scaffoldMode: off` even when an older chat has a stored scaffold id.
- Improved Unsplash materialization fallback by generating broader English
  search candidates instead of only shortening the original placeholder text.
- Updated frontend debug logs and prompt metadata so own-engine runs surface
  `gpt-*` engine models instead of leaking `v0-*` tier ids as the effective model.
- Fixed a real generated-site regression in the active chat where multiple files
  imported `Link` from `lucide-react` instead of `next/link`, which broke page
  navigation despite the target route existing.
- Added a post-check warning/failure path for invalid `lucide-react` Link imports
  and clarified the builder preview banner that local own-engine preview is not
  authoritative for multi-page Next.js routing.
- Root-caused the downloaded-project build failure: a preview-only import-strip
  rule for `next/font/*` was mutating streamed/saved code, which could leave
  exported projects with `Inter(...)` usage but no real import.
- Fixed that leak by stopping suspense from stripping `next/font/*` during
  generation, then added a shared `repair-generated-files` pass that repairs
  common export/runtime issues such as missing font imports and `lucide-react`
  `Link` misuse.
- Wired that repair pass into finalized own-engine versions, the own-engine
  preview route, the version files API used by sandbox, and the ZIP download
  path so both new and previously saved versions are more resilient.
- Made own-engine preview route-aware: local preview now accepts a `route`
  query parameter and can switch between generated `app/.../page.tsx` routes
  when the user clicks internal links in preview.
- Added persistent own-engine `version_error_logs` storage in SQLite and
  updated the existing error-log API so autofix/sandbox/post-check data is
  stored locally instead of being discarded on the own-engine path.
- Extended autofix prompting so it can include persisted current/previous
  version errors, making the rebuild loop more stateful across iterations.
- Fixed a separate production-build blocker uncovered during final validation:
  Next.js App Router segment config exports (`maxDuration`) must be statically
  analyzable, so the four imported-constant exports were replaced with literal
  values matching the intended timeout defaults.

## Validation Notes

- Targeted lint passed for the changed engine/MCP files.
- Targeted lint passed for the post-generation fixes (`matcher.ts` and both
  stream routes).
- `npm run typecheck` passed after the post-generation fixes.
- Need a new targeted validation pass for the model/default/scaffold changes.
- Targeted lint passed for scaffold-neutralization, image-query fallback, and
  frontend model-log cleanup changes.
- Targeted lint passed for the new navigation regression checks and preview copy.
- `npm run typecheck` passed after the final hardening pass.
- `npm run build` now passes after replacing non-static App Router
  `maxDuration` exports with literal values.
- Full `npm run lint` still fails because `_template_refs/` contains many
  pre-existing lint violations unrelated to this run.

## Residual Note

- `preview` runtime URLs still point to the app preview route. The local MCP
  flow is now direct for generation and file access, but preview rendering is
  still app-served by design.
