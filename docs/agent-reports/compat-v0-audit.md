# Compat v0 audit

Scope: `src/app/api/v0/chats/**` vs `src/app/api/engine/chats/**` (chat API only).

## Route matrix (`/api/v0/chats/**`)

| v0 route file | Engine counterpart | Klassning | Notering |
|---|---|---|---|
| `src/app/api/v0/chats/route.ts` | `src/app/api/engine/chats/route.ts` | needs wrapper | Shared handler, men v0 loggar `logLegacyV0ChatsHit` för POST sync JSON. |
| `src/app/api/v0/chats/stream/route.ts` | `src/app/api/engine/chats/stream/route.ts` | needs wrapper | Shared handler, men v0 loggar `logLegacyV0ChatsHit` för stream-create. |
| `src/app/api/v0/chats/init/route.ts` | `src/app/api/engine/chats/init/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/init-registry/route.ts` | _ingen_ | legacy do not touch yet | Eget legacy-beteende: returnerar `410 registry_init_removed`. |
| `src/app/api/v0/chats/[chatId]/route.ts` | `src/app/api/engine/chats/[chatId]/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/stream/route.ts` | `src/app/api/engine/chats/[chatId]/stream/route.ts` | safe to alias | Båda exporterar samma lib-handler (`chat-message-stream-post`). |
| `src/app/api/v0/chats/[chatId]/messages/route.ts` | `src/app/api/engine/chats/[chatId]/messages/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/messages/[messageId]/route.ts` | `src/app/api/engine/chats/[chatId]/messages/[messageId]/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/files/route.ts` | `src/app/api/engine/chats/[chatId]/files/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/validate-css/route.ts` | `src/app/api/engine/chats/[chatId]/validate-css/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/validate-images/route.ts` | `src/app/api/engine/chats/[chatId]/validate-images/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/normalize-text/route.ts` | `src/app/api/engine/chats/[chatId]/normalize-text/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/repair/route.ts` | `src/app/api/engine/chats/[chatId]/repair/route.ts` | safe to alias | Re-export till engine, `maxDuration` alignad till `300` i detta pass. |
| `src/app/api/v0/chats/[chatId]/quality-gate/route.ts` | `src/app/api/engine/chats/[chatId]/quality-gate/route.ts` | safe to alias | Re-export till engine, `maxDuration` alignad till `300` i detta pass. |
| `src/app/api/v0/chats/[chatId]/readiness/route.ts` | `src/app/api/engine/chats/[chatId]/readiness/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/preview-session/route.ts` | `src/app/api/engine/chats/[chatId]/preview-session/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/preview-status/route.ts` | `src/app/api/engine/chats/[chatId]/preview-status/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/preview-heartbeat/route.ts` | `src/app/api/engine/chats/[chatId]/preview-heartbeat/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/preview-hibernate/route.ts` | `src/app/api/engine/chats/[chatId]/preview-hibernate/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/preview-destroy/route.ts` | `src/app/api/engine/chats/[chatId]/preview-destroy/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/route.ts` | `src/app/api/engine/chats/[chatId]/versions/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/collaboration-summaries/route.ts` | `src/app/api/engine/chats/[chatId]/versions/collaboration-summaries/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/[versionId]/error-log/route.ts` | `src/app/api/engine/chats/[chatId]/versions/[versionId]/error-log/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/[versionId]/comments/route.ts` | `src/app/api/engine/chats/[chatId]/versions/[versionId]/comments/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/[versionId]/download/route.ts` | `src/app/api/engine/chats/[chatId]/versions/[versionId]/download/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/[versionId]/export/route.ts` | `src/app/api/engine/chats/[chatId]/versions/[versionId]/export/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/[versionId]/feedback/route.ts` | `src/app/api/engine/chats/[chatId]/versions/[versionId]/feedback/route.ts` | safe to alias | Re-export till engine. |
| `src/app/api/v0/chats/[chatId]/versions/[versionId]/approval/route.ts` | `src/app/api/engine/chats/[chatId]/versions/[versionId]/approval/route.ts` | safe to alias | Re-export till engine. |

## Drift-risks (verifierade)

1. Timeout-drift mellan v0/engine fanns i två routes (`repair`, `quality-gate`) trots delad handler. Fixat i detta pass.
2. Stream/create + follow-up hade ingen dedikerad route-test i engine-trädet. Fixat i detta pass med två minimala route-tester.
3. v0-wrapper-telemetri är avsiktlig skillnad för två routes (`/api/v0/chats`, `/api/v0/chats/stream`) och ska behållas tills usage är noll.
4. `init-registry` är v0-only avvecklingsendpoint (`410`) och ska inte aliasas utan explicit migreringsscope.

## Changes applied in this pass

- Timeout alignment:
  - `src/app/api/v0/chats/[chatId]/repair/route.ts`: `maxDuration 60 -> 300`
  - `src/app/api/v0/chats/[chatId]/quality-gate/route.ts`: `maxDuration 120 -> 300`
- New engine stream route tests:
  - `src/app/api/engine/chats/stream/route.test.ts`
  - `src/app/api/engine/chats/[chatId]/stream/route.test.ts`

## Recommended migration order

1. Keep wrappers but keep all new internal chat callers on `ENGINE_CHATS_API_PREFIX`.
2. Keep measuring remaining v0 traffic through `logLegacyV0ChatsHit`.
3. When traffic is near-zero, migrate wrappers (`/api/v0/chats`, `/api/v0/chats/stream`) to explicit deprecation behavior.
4. Handle `init-registry` (`410`) as a separate deprecation track with explicit consumer validation.
5. Remove `/api/v0/chats/**` only after external usage is confirmed zero and parity tests exist for engine routes.
