# Project Settings And Builder Questions

This document is the canonical overview for the builder surfaces that explain:

- what the active generated site appears to use
- which environment variables belong to that generated project
- when generation is still streaming versus finalizing
- how clarifying questions and plan blockers appear in the builder chat

## Scope

This pass improves clarity and observability only.

It does not change:

- the current version creation model
- the client-side autofix loop
- most of the underlying prompt orchestration

## Project Settings Panel

The `ProjectEnvVarsPanel` now separates different kinds of configuration data
instead of mixing them into one ambiguous list.

Relevant code source:

- `src/components/builder/ProjectEnvVarsPanel.tsx`

### Integrations tab

The Integrations tab now shows three distinct layers:

1. Active site
   Detected from the currently selected version's code by fetching version files
   and running `detectIntegrations(...)`.
2. Platform status
   General readiness and platform-level integration capabilities from
   `/api/integrations/status`.
3. Project marketplace / MCP context
   Marketplace installs for the real project plus MCP priorities.

This means the tab now answers two different questions separately:

- "What does the generated site seem to use?"
- "What can the platform or project already support?"

Relevant code sources:

- `src/lib/gen/detect-integrations.ts`
- `src/app/api/v0/chats/[chatId]/files/route.ts`
- `src/components/builder/ProjectEnvVarsPanel.tsx`

### Environment variables tab

The Miljovariabler tab is now explicit that it shows project env vars for the
generated site, not the developer's local `.env.local`.

It also distinguishes:

- no chat / no generated project yet
- synthetic temporary `v0ProjectId`
- real project-backed env vars that can be edited immediately
- own-engine project env vars stored on the Sajtmaskin project when no real
  `v0ProjectId` exists yet

When the active site's code suggests likely required env keys, the tab shows:

- detected keys
- which keys already exist on the project
- which keys are still missing

Current storage split:

- v0-backed projects use the v0 project env-var APIs
- own-engine projects can now fall back to project-scoped Sajtmaskin storage in
  `project_data.meta.projectEnvVars`

That means an own-engine project no longer has to wait for a real v0 project id
before the builder can save project-specific env vars.

Relevant code source:

- `src/app/api/v0/projects/[projectId]/env-vars/route.ts`
- `src/lib/project-env-vars.ts`
- `src/lib/db/services/projects.ts`

### Deploy behavior for env vars

The engine deploy path now uses the same project-scoped env-var source as the
builder panel.

Current behavior:

- if the builder has a real v0 project, its env vars remain the source of truth
- if the builder is on own-engine without a real v0 project yet, deploy reads
  project env vars from Sajtmaskin storage and sends them to Vercel during
  publish

This closes a previous gap where the panel could suggest env configuration but
the own-engine deploy path still published with an empty env-var set.

Relevant code sources:

- `src/app/api/v0/deployments/route.ts`
- `src/app/builder/useBuilderDeployActions.ts`
- `src/lib/vercelDeploy.ts`

## Generation And Finalization Visibility

The builder chat now surfaces generation phases more explicitly through progress
tool parts.

Current phases exposed to the UI:

- `generation`
- `autofix`
- `validation`
- `finalizing`
- `quality gate`

The important distinction is:

- `generation` means model streaming is still producing content/thinking
- `finalizing` means the stream is effectively done but the server is still
  parsing files, repairing output, checking the project, and saving the version
- `quality gate` happens after version creation as a separate follow-up check

When post-checks already know that a follow-up autofix is likely, the builder now
marks the current result as provisional instead of letting it feel fully final.

Relevant code sources:

- `src/lib/hooks/chat/stream-handlers.ts`
- `src/lib/gen/stream/finalize-version.ts`
- `src/lib/hooks/chat/post-checks.ts`
- `src/components/builder/MessageList.tsx`
- `src/components/builder/GenerationSummary.tsx`

### Streaming bubble behavior

The builder still stores the real streamed assistant content, but the visible
streaming bubble is now intentionally calmer:

- code-heavy streaming messages route into `GenerationSummary`
- while streaming, the preview text is replaced by a short status note instead
  of a long prose/code dump
- raw content is still available after the fact via the `Råtext` toggle

This keeps observability for debugging without making active generations feel
like a second noisy chat transcript.

## Clarifying Questions And Plan Blockers

The builder still supports follow-up questions before generation can continue.

Current behavior:

1. The engine can emit `askClarifyingQuestion`.
2. The client turns that into a `tool:awaiting-input` UI part.
3. `MessageList` surfaces the blocker inline and also opens a "Svar kravs"
   dialog with quick replies when possible.

This means plan-mode-style blockers and clarifying questions are still active;
they were not removed, only easy to miss when the surrounding UI focused mostly
on streaming text.

### Ambiguous redesign vs refine

The follow-up route now distinguishes between three cases when a chat already has
existing files:

- clear refinement request
- clear redesign request
- ambiguous request that sounds like a new site but could also mean a refinement

If the request is ambiguous, the engine now emits `askClarifyingQuestion` before
generation continues. This prevents the builder from silently preserving the old
design language when the user may actually want a new visual direction.

If the request is clearly a redesign, the follow-up prompt is now more explicit
that the dominant visual shell may be replaced.

Relevant code sources:

- `src/lib/gen/agent-tools.ts`
- `src/lib/gen/system-prompt.ts`
- `src/lib/hooks/chat/stream-handlers.ts`
- `src/components/builder/MessageList.tsx`
- `src/app/api/v0/chats/[chatId]/stream/route.ts`

## Practical Reading Guide

If you need to understand a confusing builder state, read the surfaces in this
order:

1. Chat progress / question blocker
2. Active site integrations
3. Required env keys
4. Real project env vars
5. Marketplace installs / MCP priorities

That order matches the runtime flow more closely than the previous UI wording
did.
