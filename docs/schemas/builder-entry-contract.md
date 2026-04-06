# Builder Entry Contract

## Scope

This document defines the stable human-readable contract for builder entry
state.

Primary code sources:

- `src/app/builder/useBuilderState.ts`
- `src/app/builder/useBuilderPageController.ts`
- `src/app/builder/useBuilderEffects.ts`
- `src/app/builder/useBuilderPromptActions.ts`
- `src/lib/hooks/chat/useChatMessaging.ts`
- `src/lib/hooks/chat/useCreateChat.ts`
- `src/app/api/template/route.ts`
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
| `source` | URL transport | compatibility-only | Legacy audit helper; not a primary entry discriminator |
| `type` | URL transport | non-canonical | Category UI context only; not part of current builder state contract |
| `v0ProjectId` | server/client state | non-entry state | External v0 project identity, not part of builder entry URL |
| `sandboxUrl` | server/client version state | non-entry state | Version-level sandbox runtime URL, not part of builder entry |

## HTTP JSON (chats / template / project save)

| Field | Status | Meaning |
|-------|--------|---------|
| `previewUrl` | **canonical** | Iframe/live preview URL for a chat or version (svar och normal klientpayload). |
| `demoUrl` | **legacy inbound only** | Inte längre i API-svar. Fortfarande accepterad i vissa bodies (t.ex. `POST .../save`) och webhooks; tolkas via `resolveInboundPreviewUrl` server-side. DB-kolumn `demo_url` oförändrad. |

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
| First builder render | `appProjectId` exists, `chatId` absent | `appProjectId` exists or is adopted, `chatId` may still be pending |
| After init/create response | `chatId` exists | `chatId` may already exist, `versionId` may also exist |
| After first completed generation | `versionId` and preview available | preview may have been available earlier |

## Server Deep Brief (create-chat)

- On `POST /api/engine/chats/stream`, when the client does **not** send `meta.brief`, the server may run the same structured Deep Brief model as `/api/ai/brief` (unless disabled via `SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF=1` or skipped for audit/technical-preserve paths).
- UI-driven fetch to `/api/ai/brief` remains useful for previewing/editing the brief before send; if the client attaches `meta.brief`, the server does not regenerate it.
- Response `meta` may include `serverAutoBriefGenerated` / `serverAutoBriefModel` for telemetry.

## Compatibility Notes

- `source=audit` currently acts as a fallback when `buildMethod` is absent, but
  it should not be treated as the primary standard.
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
