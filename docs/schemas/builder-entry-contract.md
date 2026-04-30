# Builder Entry Contract

## Scope

This document defines the stable human-readable contract for builder entry
state.

Primary code sources:

- `src/app/builder/useBuilderState.ts`
- `src/app/builder/useBuilderPageController.ts`
- `src/app/builder/useBuilderEffects.ts`
- `src/app/builder/useBuilderPromptActions.ts`
- `src/lib/builder/defaults.ts`
- `src/lib/builder/server-auto-brief-policy.ts`
- `src/lib/hooks/chat/useChatMessaging.ts`
- `src/lib/hooks/chat/useCreateChat.ts`
- `src/app/api/template/route.ts`
- `src/app/api/template-image/[templateId]/route.ts`
- `src/app/api/v0/chats/init-registry/route.ts`
- `src/lib/tenant.ts`

## Canonical Enums

```ts
type BuildMethod =
  | "wizard"
  | "category"
  | "audit"
  | "freeform"
  | "kostnadsfri";

type BuildIntent = "website" | "app" | "template";
```

## Canonical URL And State Fields

| Field | Layer | Status | Meaning |
|---|---|---|---|
| `buildMethod` | URL + client state | canonical | The public entry method into `/builder` |
| `buildIntent` | URL + client state | canonical | The intended build type |
| `project` | URL | canonical transport | URL transport field that hydrates `appProjectId` |
| `appProjectId` | client/server state | canonical durable ID | The durable Sajtmaskin project ID |
| `promptId` | URL transport | canonical for prompt-driven entry | Stored prompt handoff fetched on builder load |
| `chatId` | URL + client/server state | canonical durable ID | The durable builder conversation ID |
| `templateId` | URL transport | canonical special-case trigger | Template initializer (local v0 gallery), not durable session identity |
| `source` | URL transport | compatibility-only | Legacy audit helper; builder normalizes this into `entryKind: "audit"` |
| `type` | URL transport | non-canonical | Category UI context only; not part of current builder state contract |
| `v0ProjectId` | server/client payload | legacy compatibility | Old payload key for external project identity; not part of builder entry URL |
| `externalProjectId` | client state | non-entry state | Builder-local name for external legacy project identity; not the canonical project root |
| `sandboxUrl` | server/client version state | non-entry state | Version-level sandbox runtime URL, not part of builder entry |

## Normalized Entry Classifier

Buildern centraliserar nu URL-ingången till en intern `entryKind` / `entryState`
så att flera hooks inte behöver tolka samma parametrar var för sig.

```ts
type BuilderEntryKind =
  | "template"
  | "prompt-handoff"
  | "audit"
  | "project-restore"
  | "blank";
```

Detta är inte en publik URL-parameter i sig, men det är den kanoniska interna
klassningen som resten av buildern ska utgå från.

## HTTP JSON (chats / template / project save)

| Field | Status | Meaning |
|-------|--------|---------|
| `previewUrl` | **canonical** | Iframe/live preview URL for a chat or version (svar och normal klientpayload). |
| `demoUrl` | **legacy inbound only** | Inte längre i API-svar. Fortfarande accepterad i vissa bodies (t.ex. `POST .../save`) och webhooks; tolkas via `resolveInboundPreviewUrl` server-side. DB-kolumn `demo_url` oförändrad. |

`POST /api/template` kan returnera `409` när en lokal v0-template saknar repo-zip. Svaret är recoverable och strukturerat:

```json
{
  "success": false,
  "reason": "local_template_source_missing",
  "templateId": "<id>",
  "recoverable": true
}
```

`GET /api/template-image/<id>` returnerar en cachebar SVG-fallback med `X-Template-Image-Fallback: 1` när den lokala thumbnail-filen saknas, så normal galleri-rendering inte skapar 404-brus.

## Canonical Entry Shapes

### Prompt-Driven Entry

This is the target shape for `freeform`, `wizard`, `audit`, `kostnadsfri`, and
prompt-driven `category`.

```ts
type PromptDrivenBuilderEntry = {
  buildMethod: BuildMethod;
  buildIntent: BuildIntent;
  project: string;   // hydrates appProjectId
  promptId: string;  // resolves to the initial prompt text
  chatId?: string;   // absent until first create completes
  templateId?: never;
};
```

### Template-Driven Entry

This is the special initializer used by the local template gallery path.

```ts
type TemplateDrivenBuilderEntry = {
  buildMethod: "category";
  buildIntent: BuildIntent;
  project: string;    // hydrates appProjectId, but may need reconciliation
  templateId: string; // trigger only
  promptId?: never;
  chatId?: string;    // may appear after init returns
};
```

### Utility Bootstrap

This is supported, but it is not part of the canonical public entry contract.

```ts
type BlankBuilderBootstrap = {
  project?: string;
  chatId?: string;
};
```

## Identifier Rules

1. `appProjectId` is the durable root identifier for a builder session.
2. `project` is only the URL transport for `appProjectId`.
3. `chatId` is created server-side.
4. `versionId` is not part of the builder entry URL contract.
5. Prompt-driven entry should not require a pre-existing `versionId`.
6. The v0-driven template path may legally arrive with `chatId`, `versionId`,
   and `demoUrl` already initialized.
7. `templateId` is a transient initialization trigger, not a durable builder ID.

## Lifecycle Expectations

| Phase | Prompt-driven expectation | v0-driven template expectation |
|---|---|---|
| Before opening `/builder` | create `appProjectId`, save prompt handoff | create or resolve `appProjectId`, carry `templateId` |
| First builder render | `appProjectId` exists, `chatId` absent, **no chat-restore fetch** | `appProjectId` exists or is adopted, `chatId` may still be pending |
| After init/create response | `chatId` exists | `chatId` may already exist, `versionId` may also exist |
| After first completed generation | `versionId` and preview available | preview may have been available earlier |

### Fresh-entry guards

When the builder opens with a normalized fresh entry (`entryKind` =
`prompt-handoff`, `template`, or `audit`), the following are blocked until the
entry is consumed:

- **Project-chat restore** (`GET /api/projects/[id]/chat`) is skipped entirely
  for fresh entries and template entries to prevent a race where a stale
  `chatId` briefly propagates to SWR hooks.
- **Chat data hooks** (`useChat`, `useVersions`, `useChatReadiness`) receive
  `null` instead of `chatId` while `entryIntentActive` is true on fresh
  prompt-driven entries (`readyForChatHooks` gate in
  `useBuilderPageController`). Template entries are **not** held because
  `useBuilderEffects` is the sole legitimate setter of `chatId` for that path.
- **Auto-generate** (`kostnadsfri` flow) and **prompt-fetch** effects are
  skipped when `templateId` is present.

## Deep Brief (UI default and server)

- **UI default is on** (`DEFAULT_PROMPT_ASSIST.deep = true`).
- For the first freeform create-chat prompt, `applyDynamicInstructionsForNewChat`
  currently forces `forceDeepBrief: true` to improve the initial scaffold/context
  pass even if the visible toggle is off.
- After the first create-chat turn, the visible Deep Brief toggle still represents
  the user's requested preference in UI state and request metadata.
- On `POST /api/engine/chats/stream`, when the client does **not** send `meta.brief`,
  the server may run the same structured Deep Brief model as `/api/ai/brief`
  (unless disabled via `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1` or skipped by
  `server-auto-brief-policy.ts`, for example on follow-ups, audit/technical-preserve
  paths).
- UI-driven fetch to `/api/ai/brief` remains useful for previewing/editing the brief before send; if the client attaches `meta.brief`, the server does not regenerate it.
- Response `meta` may include `serverAutoBriefGenerated` / `serverAutoBriefModel` for telemetry.

## Compatibility Notes

- `source=audit` remains compatibility input only. Runtime code should prefer
  the normalized `entryKind: "audit"` branch instead of spreading raw
  `source === "audit"` checks further.
- `type` from category routes is currently presentation context only.
- Direct blank `/builder` bootstrap remains useful for recovery and utility
  navigation, but should stay outside the primary five-entry-point model.

## Recommended Invariants

1. Every persisted builder session should reconcile to exactly one
   `appProjectId`.
2. Prompt handoff should stay recoverable until the first `chatId` is durable.
3. Returned `projectId` from template or registry init should reconcile before
   client persistence writes `chatId` or `demoUrl`.
4. Preview state should not be treated as proof that the durable builder
   identity layer is already consistent.
