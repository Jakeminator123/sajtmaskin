# Next Chat Handoff

> Last updated: 2026-03-10
> Branch: `egen-motor-v2`
> Purpose: Give the next chat a clean starting point for prompt-flow work and scaffold expansion.

## Current state

The custom engine is now the default path in `sajtmaskin`.

v0 remains available only as an opt-in fallback through:

- `V0_FALLBACK_BUILDER=y`

The custom engine already owns:

- system prompt and prompt orchestration
- generation via AI SDK
- streaming fixes
- post-generation autofix
- validate-and-fix loop
- preview rendering
- downloadable project scaffold
- a first scaffold system for site starters

The biggest remaining gaps are:

- making the prompt layers more explicitly v0-like
- improving dynamic retrieval/context injection
- expanding the scaffold library so generations start from stronger templates
- improving preview fidelity

Recent hardening completed:

- scaffold serialization now includes actual starter file contents, not only a file summary
- scaffold matcher now uses safer boundary-aware keyword scoring and better Swedish app vocabulary
- current scaffold CSS now aligns with Tailwind v4 `@theme inline` tokens used by project export
- system prompt now explains scaffold starters explicitly
- system prompts now receive the original user request in both create and follow-up engine routes
- downloadable project scaffold now resolves transitive shadcn/ui dependencies recursively

## Estimated score vs v0

| Area | v0 | Custom engine | Notes |
|---|---:|---:|---|
| Static system control | 9 | 8.5 | Strong system prompt, but less mature layering |
| Prompt breakdown / reasoning | 9 | 7.5 | We pre-process more outside the model |
| Dynamic docs injection | 9 | 7 | Keyword KB, not full retrieval/embeddings |
| Streaming post-process | 9 | 8 | One of the strongest current areas |
| Autofix / validation | 8 | 8 | Near parity with `validateAndFix()` |
| Preview fidelity | 9 | 6 | Still stub-based, not true sandbox execution |
| Downloadable output | 9 | 8 | Good state, needs continued regression checks |
| Scaffold / start quality | 8.5 | 6.5 | Infrastructure exists, library still too small |
| Total estimate | 10 | 8.5 | Roughly 85-90% engine parity, lower scaffold maturity |

## Read these first in the next chat

Read in this order:

1. `LLM/egen-motor/README.md`
2. `LLM/egen-motor/MOTOR-STATUS.md`
3. `LLM/v0-prompt-guide.txt`
4. `LLM/egen-motor/analys/05-hur-v0-bryter-ner-en-prompt.md`
5. `LLM/egen-motor/analys/04-streaming-postprocess.md`
6. `LLM/egen-motor/analys/03-overlap-med-v0.md`
7. `LLM/egen-motor/scaffold-status-and-plan.md`
8. `LLM/scaffold-schema.txt`

## Read these code files next

- `src/lib/gen/system-prompt.ts`
- `src/lib/builder/promptAssist.ts`
- `src/lib/builder/defaults.ts`
- `src/app/api/v0/chats/stream/route.ts`
- `src/app/api/v0/chats/[chatId]/stream/route.ts`
- `src/lib/gen/scaffolds/registry.ts`
- `src/lib/gen/scaffolds/matcher.ts`
- `src/lib/gen/scaffolds/serialize.ts`
- `src/lib/gen/scaffolds/types.ts`
- `src/lib/gen/scaffolds/*/manifest.ts`

## How v0 roughly structures prompt handling

The key reference is:

- `LLM/egen-motor/analys/05-hur-v0-bryter-ner-en-prompt.md`

Short version:

1. Large static system prompt
2. Dynamic docs injection per intent
3. User prompt mostly unchanged
4. Model-internal planning / thinking step

Our engine currently does this:

1. System prompt
2. Prompt polish / enrichment
3. Dynamic context
4. Generation
5. Streaming fix + autofix + validate-and-fix

The next goal is not to copy v0 literally. The goal is to make our own flow more explicitly layered and easier to reason about, while keeping the gains from our prompt polish and fix pipeline.

## Scaffold state right now

Implemented scaffolds:

- `base-nextjs`
- `landing-page`
- `saas-landing`
- `portfolio`
- `content-site`
- `app-shell`

These are already wired into the generation flow through:

- builder UI state
- `scaffoldMode` and `scaffoldId` in request metadata
- scaffold resolution in stream routes
- scaffold serialization into prompt context
- merge of scaffold files with generated files before saving a version

This means:

- scaffold infrastructure exists
- the first specific website scaffold wave has started
- `content-site` and `app-shell` still remain as broader fallback families

## Scaffold target state

First real wave of internal starters:

1. `base-nextjs`
2. `landing-page`
3. `saas-landing`
4. `portfolio`
5. `blog`
6. `dashboard`
7. `auth-pages`
8. `ecommerce`

Interpretation of current broad scaffolds:

- `content-site` is currently a rough umbrella for:
  - `blog`
- `app-shell` is currently a rough umbrella for:
  - `dashboard`
  - `auth-pages`
  - some app/admin flows

## Priority order for scaffold expansion

Recommended order:

1. `blog`
2. `dashboard`
3. `auth-pages`
4. `ecommerce`

Why:

- the first four directly improve the most common "build me a site" prompts
- `landing-page`, `saas-landing`, and `portfolio` are now implemented as specific starters
- `dashboard` and `auth-pages` strengthen app use cases
- `ecommerce` matters a lot, but should come after the matcher and base starter shapes are more stable

## What not to do next

- Do not remove prompt polish entirely without a clear replacement.
- Do not import large external templates wholesale as internal scaffolds.
- Do not mix platform references with end-user site scaffolds.
- Do not break the fallback path unless explicitly requested.

## Recommended concrete next task

In the next chat:

1. Compare current prompt flow with the reconstructed v0 flow.
2. Define the target prompt layers:
   - static core prompt
   - dynamic docs/scaffold injection
   - user prompt
   - internal planning/thinking contract
3. Keep prompt polish, but narrow its responsibility so it does not overwrite user intent.
4. Implement `blog` as the next specific content starter.
5. Split `app-shell` into more specific app starters.
6. Keep improving matcher logic so scaffold selection becomes more stable.
7. Validate with `npx tsc --noEmit` and lint checks after meaningful changes.

## Suggested opening instruction for the next chat

```text
Continue on branch `egen-motor-v2`.

Read these files first:
- LLM/egen-motor/README.md
- LLM/egen-motor/MOTOR-STATUS.md
- LLM/v0-prompt-guide.txt
- LLM/egen-motor/analys/05-hur-v0-bryter-ner-en-prompt.md
- LLM/egen-motor/analys/04-streaming-postprocess.md
- LLM/egen-motor/analys/03-overlap-med-v0.md
- LLM/egen-motor/scaffold-status-and-plan.md
- LLM/scaffold-schema.txt

Then inspect:
- src/lib/gen/system-prompt.ts
- src/lib/builder/promptAssist.ts
- src/lib/builder/defaults.ts
- src/app/api/v0/chats/stream/route.ts
- src/app/api/v0/chats/[chatId]/stream/route.ts
- src/lib/gen/scaffolds/registry.ts
- src/lib/gen/scaffolds/matcher.ts
- src/lib/gen/scaffolds/serialize.ts
- src/lib/gen/scaffolds/types.ts
- src/lib/gen/scaffolds/*/manifest.ts

Goal:
- map the gap between the current prompt flow and the reconstructed v0 flow
- propose the target prompt-layer architecture
- prioritize what to implement next
- explain current scaffold state and plan the next scaffold wave

Important:
- keep the custom engine as the primary path
- treat v0 only as fallback/reference
- update docs if implementation changes
- validate with `npx tsc --noEmit` and lint checks after substantive edits
```
