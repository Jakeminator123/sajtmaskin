# Builder Entry Contract

Formyta för URL- och state-fält när `/builder` öppnas. Värden för
`BuildMethod` / `BuildIntent` ägs av `src/lib/builder/build-intent.ts`.
Intern klassning ägs av `src/app/builder/builder-entry.ts`.

Pre-codegen (Deep Brief) hör inte hit — se
[`../architecture/llm-pipeline.md`](../architecture/llm-pipeline.md) § Fas 1.

## Canonical ownership

| Faktatyp | Ägare |
| --- | --- |
| URL → `entryKind` | `deriveBuilderEntryState` i `src/app/builder/builder-entry.ts` |
| Hydrering / restore-grind | `src/app/builder/page-controller/useBuilderEntryHydration.ts` |
| Prompt-handoff / create-chat | `src/lib/hooks/chat/useCreateChat.ts` |
| Template-init HTTP | `src/app/api/template/route.ts` |
| Preview-URL i JSON | `src/lib/api/preview-url-contract.ts` |

## Canonical URL and state fields

| Field | Layer | Status | Meaning |
| --- | --- | --- | --- |
| `buildMethod` | URL + client state | canonical | Public entry method into `/builder` |
| `buildIntent` | URL + client state | canonical | Intended build type |
| `project` | URL | canonical transport | Hydrates `appProjectId` |
| `appProjectId` | client/server state | canonical durable ID | Durable Sajtmaskin project ID |
| `promptId` | URL transport | canonical for prompt-driven entry | Stored prompt handoff fetched on builder load |
| `prompt` | URL | canonical transport | Inline prompt text (counts as prompt-driven together with `promptId`) |
| `chatId` | URL + client/server state | canonical durable ID | Durable builder conversation ID |
| `templateId` | URL transport | canonical special-case trigger | Local v0-gallery initializer, not durable session identity |
| `new` | URL | canonical flag | `new=1` → `forceNew` in `BuilderEntryState` |
| `source` | URL transport | compatibility-only | Legacy audit helper; normalized to `entryKind: "audit"` |
| `type` | URL transport | non-canonical | Not read by `builder-entry.ts` |
| `v0ProjectId` | server/client payload | legacy compatibility | Old payload key for external project identity; not a builder entry URL field |
| `externalProjectId` | client state | non-entry state | Builder-local name for external legacy project identity |
| `previewUrl` | version state | non-entry state | Version-level preview URL |

## Normalized entry classifier

`BuilderEntryKind` (intern, inte en publik URL-parameter): `template` |
`prompt-handoff` | `audit` | `project-restore` | `blank`. Ordningen i
`deriveBuilderEntryState` är template → audit → prompt-handoff →
project-restore (`project` utan `chatId`) → blank.

## HTTP JSON (chats / template / project save)

| Field | Status | Meaning |
| --- | --- | --- |
| `previewUrl` | canonical | Iframe/live preview URL in responses and normal client payload |
| `demoUrl` | legacy inbound only | Not in API responses. Still accepted in some bodies (e.g. `POST .../save`) and webhooks via `resolveInboundPreviewUrl`. DB column `demo_url` unchanged |

`POST /api/template` may return `409` with `reason: "local_template_source_missing"`,
`templateId`, `recoverable: true` when a local v0-template lacks a repo zip.

`GET /api/template-image/<id>` returns a cacheable SVG fallback with
`X-Template-Image-Fallback: 1` when the local thumbnail is missing.

## Identifier rules

1. `appProjectId` is the durable root identifier for a builder session.
2. `project` is only the URL transport for `appProjectId`.
3. `chatId` is created server-side.
4. `versionId` is not part of the builder entry URL contract.
5. `templateId` is a transient initialization trigger, not a durable builder ID.

## Fresh-entry guards

When `entryKind` is `prompt-handoff`, `template`, or `audit`:

- Project-chat restore (`GET /api/projects/[id]/chat`) is skipped for fresh and template entries.
- Chat data hooks receive `null` instead of `chatId` while `entryIntentActive` is true on fresh prompt-driven entries (`readyForChatHooks` in `useBuilderPageController`). Template entries are not held; `useBuilderEffects` is the setter of `chatId` for that path.
- Auto-generate (`kostnadsfri`) and prompt-fetch effects are skipped when `templateId` is present.
