# Preview lifecycle deep pass

Scope: `heartbeat` / `hibernate` / `destroy` / recover-floden runt `preview-session` och `preview-status`.

## Lifecycle map (kanonisk)

Serverstatus i `preview-status`:

| status | reason | När |
|---|---|---|
| `missing` | `preview_session_not_configured` | tier-2 saknas i miljön |
| `missing` | `no_session` | ingen aktiv session (Map/Redis) |
| `version_mismatch` | `session_bound_to_other_version` | session bunden till annan `versionId` |
| `stopped` | `preview_session_id_mismatch` | klientens `previewSessionId` matchar inte |
| `stopped` | `provider_not_running_or_unreachable` | provider-status kunde inte resumera |
| `running` | _(none)_ | session + provider är live |

Klientlifecycle i buildern:

- `recovering` när recover är aktivt.
- `bootstrapping` när `preview-session` bootstrap pågår.
- `failed` vid preview-start/recover-fel.
- `live` för tier-2 live-URL (eller annan icke-shim URL).
- `idle` annars.

## Transition ownership (vem sätter / vem läser)

- **Sätter session-state**: `touchPreviewSessionAsync` i preview-start/resume och heartbeat.
- **Rensar session-state**: `clearPreviewSessionAsync` i force-restart, failed resume och destroy.
- **Läser session-state**: `preview-status`, `preview-heartbeat`, `preview-hibernate`, `preview-destroy`.
- **Provider-status**: `tryResumeTier2Runtime` via preview-host `/status`.
- **UI-recover-loop**: `usePreviewSession` triggar bootstrap-restart när status inte är `running`.

## Changes applied in this pass

1. `preview-hibernate` route hardening:
   - `src/app/api/engine/chats/[chatId]/preview-hibernate/route.ts`
   - returnerar nu `503` + `reason: preview_session_not_configured` när tier-2 inte är konfigurerat.

2. Preview-host error classification:
   - `src/lib/gen/preview/preview-host-client.ts`
   - `describePreviewHostHttpFailure` stödjer nu explicit `"/preview/session/hibernate"` och hibernate-fel mappas rätt endpoint.

3. Recover-signal i klient:
   - `src/app/builder/usePreviewSession.ts`
   - ny recover-fail callback vid `max_attempts` och upprepad `status`-otillgänglighet.
   - tydligare telemetri för `status_unavailable`.

4. Canonical lifecycle helper för UI:
   - `src/lib/builder/preview-lifecycle.ts`
   - ny `derivePreviewLifecycleState(...)` som centraliserar state-mappningen.
   - `src/app/builder/useBuilderPageController.ts` använder nu helpern.

## Test coverage added/extended

- Nytt:
  - `src/app/api/engine/chats/[chatId]/preview-hibernate/route.test.ts`
  - `src/lib/builder/preview-lifecycle.test.ts`

- Utökat:
  - `src/app/api/engine/chats/[chatId]/preview-status/route.test.ts`
    - täcker nu `missing/no_session` och `version_mismatch/session_bound_to_other_version`.
  - `src/lib/gen/preview/session-store-async.test.ts`
    - täcker legacy Redis-nyckel (`sandbox-preview`) fallback.

- Verifiering i detta pass:
  - `npm run test:ci -- src/lib/builder/preview-lifecycle.test.ts src/app/api/engine/chats/[chatId]/preview-status/route.test.ts src/app/api/engine/chats/[chatId]/preview-heartbeat/route.test.ts src/app/api/engine/chats/[chatId]/preview-hibernate/route.test.ts src/app/api/engine/chats/[chatId]/preview-destroy/route.test.ts src/lib/gen/preview/session-store.test.ts src/lib/gen/preview/session-store-async.test.ts src/lib/gen/preview/preview-host-client.test.ts`
  - Resultat: 7 testfiler, 30 tester, alla gröna.

## Remaining risks / recommended next steps

1. `reused_url`-fallet kan fortfarande ge svag koppling mellan DB-`preview_url` och session-store.
2. `preview-destroy` är medvetet konservativ med provider-destroy när session saknas; verifiera driftbehov innan eventuell skärpning.
3. Full versionsrullning efter `done` (multi-version recover policy) bör få ett eget litet pass med UI + route assertions.
