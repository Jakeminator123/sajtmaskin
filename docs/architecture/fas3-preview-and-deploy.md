# Fas 3 — preview, VM och deploy

**Senast uppdaterad:** 2026-04-15

Operativt dokument for allt som hander efter Fas 2 (`done`/sparad version):

- tier-2 preview via `preview_host` (VM/Fly)
- preview-session lifecycle (`preview-session`, `preview-status`, heartbeat, recover)
- quality-gate och server-verify lanes
- deploy prechecks och webhook-sparet

Detta dokument ersatter tidigare preview/deploy-dokumentation for builderkedjan.

---

## Fasgrans mot Fas 2

| Fas 2 (fore) | Fas 3 (denna fil) |
|---|---|
| `finalizeAndSaveVersion()` | `startPreviewSession` + preview lifecycle |
| Persist av `engine_versions.files_json` | Start/resume av VM-session + `preview_url` |
| `done.previewPending` signaleras | `preview-ready` eller `build-error` skickas |

Se Fas 2: `docs/architecture/fas2-orchestration-and-build.md`.

---

## End-to-end (lyckat fall)

1. `POST /api/engine/chats/stream` finaliserar versionen (Fas 2).
2. Post-finalize triggar preview-start (om tillatet av policy).
3. `startPreviewSession` bygger komplett projekt och startar `preview_host`.
4. Lyckad start uppdaterar `engine_versions.preview_url`.
5. Klienten far `preview-ready` med `previewUrl` + `previewSessionId`.
6. Buildern renderar live-preview i iframe (Fidelity 2).

Primar previewvag ar `preview_host`. Tier-1 shim (`/api/preview-render`) ar
legacy/diagnostik.

---

## Kanoniska API-ytor

| Route | Syfte |
|---|---|
| `POST /api/engine/chats/[chatId]/preview-session` | Start/restarta preview-session |
| `GET /api/engine/chats/[chatId]/preview-status` | Status/resync/recover-underlag |
| `POST /api/engine/chats/[chatId]/preview-heartbeat` | Haller aktiv session levande |
| `POST /api/engine/chats/[chatId]/preview-hibernate` | Parkera session vid dold flik/pagehide |
| `POST /api/engine/chats/[chatId]/preview-destroy` | Stang session + rensa preview-url |
| `POST /api/engine/chats/[chatId]/quality-gate` | Interaktiv quality-gate lane |
| `POST /api/engine/chats/[chatId]/repair` | Manual/klientdriven repair |

Compat-routes under `/api/v0/chats/...` finns kvar dar det behovs.

---

## Persistens och source of truth

Kanonisk lagring for own-engine:

- `engine_chats` / `engine_messages` (metadata och konversation)
- `engine_versions.files_json` (kodartifact)
- `engine_versions.preview_url` (senaste lyckade live-preview)

`project_data` ar app-/builder-snapshot, inte primar kodsanning nar version finns.

---

## Preview-only semantik i stream/HTTP

- `done` betyder att versionen ar sparad, inte att preview ar redo.
- `done.previewPending=true` betyder att preview-start paborjas efter `done`.
- `previewUrlHint` ar en tillfallig boot-hint, inte kanonisk live-url.
- `preview-ready` ar den robusta signalen for klar preview-session.

---

## Session lifecycle (drift)

| Del | Beteende |
|---|---|
| Status | `running` / `starting` / `stopped` / `missing` / `version_mismatch` |
| Lease | Heartbeat cirka var 25s fran synlig flik |
| Recover | Klient kan force-restarta session efter suspect/timeouts; recover-raknare resetas per chat+version |
| Hibernate | Forsok pa `pagehide` och vid dold flik |
| TTL | Session/lease cirka 1 timme (host + app-store) |

---

## Quality-gate vs live-preview (viktig skillnad)

Preview-host kor tva separata lanes:

1. **Live-preview lane** (iframe): `npm install` + `npm run dev`
2. **Verify lane** (quality-gate/server-verify): typiskt `typecheck` (+ ibland lint)

En version kan alltsa vara live i preview men anda fa verify-fail.

Check-profilerna (`tier2`, `serverVerify`, `promotion`, `interactive`) ar nu
manifeststyrda via `config/ai_models/manifest.json` (`qualityGateTiers`) i
stallet for hardkodade arrayer i kod.

---

## Vanliga blockerare i Fas 3

| Orsak | Effekt |
|---|---|
| `SAJTMASKIN_PREVIEW_HOST_BASE_URL` saknas | `preview_session_disabled` (503) |
| `previewBlocked` / verifieringspolicy blockerar | Ingen exponerad live-preview |
| Preview-host runtimefel | `build-error` eller retrybar bootstrapfail |
| Session mismatch/version mismatch | Recover/resync kravs |
| Npm/dependency-fel i VM | Preview startar ej eller kraschar tidigt |

---

## Deploy-sparet (utanfor live-preview lane)

- Deploy prechecks ligger i deployment-routen (`precheckOnly`, `skipAutoFix`,
  `DEPLOY_MISSING_ENV` etc.).
- Deploy ar ett separat driftsteg fran preview-session.
- Deploy-SSE pa klienten reconnectar vid transienta natverksfel (max 3 forsok: 2s/4s/8s).
- Vercel webhook-sparet hanteras av `src/app/api/webhooks/vercel/route.ts`.

`server-verify` och manuell `repair` delar nu samma repair-karnlogik
(`runRepairLoop`) inklusive targeted/warm repair av trasiga filer.

---

## Kodpekare

- `src/lib/gen/preview/preview-session.ts`
- `src/lib/gen/preview/tier2-resume.ts`
- `src/app/api/engine/chats/[chatId]/preview-session/route.ts`
- `src/app/api/engine/chats/[chatId]/preview-status/route.ts`
- `src/components/builder/preview-panel/PreviewPanel.tsx`
- `src/app/builder/usePreviewSession.ts`
- `src/lib/hooks/chat/stream-handlers.ts`

---

## Relaterade dokument

- Fas 1: `docs/architecture/fas1-startprompt-flow.md`
- Fas 2: `docs/architecture/fas2-orchestration-and-build.md`
- Runbook: `docs/architecture/preview-white-screen-runbook.md`
- Kontrakt: `docs/schemas/preview-session-contract.md`
- Miljovars: `docs/ENV.md`
