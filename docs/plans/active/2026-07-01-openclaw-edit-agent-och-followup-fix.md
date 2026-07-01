---
id: 2026-07-01-openclaw-edit-agent-och-followup-fix
status: in-progress
created: 2026-07-01
linear: null
parent: null
supersedes: null
---

# OpenClaw edit-agent (spår A) — prompt-driven redigering via quick-edit-lanen

Branch: `feat/openclaw-edit-agent` (av `origin/master`). Detta är en **branch-lokal** kopia av spår A; den kanoniska planen landar via #336. Kod är source of truth; allt nedan är verifierat mot repo 2026-07-01.

## Mål

Låt OpenClaw (Sajtagenten) gå från att bara *föreslå* UI-actions till att **editera användarprojektet**: användaren skriver en prompt i OpenClaw-chatten (t.ex. "gör färgen blå istället för rosa") → prompten tolkas till deterministiska `QuickEditOp[]` → ändringen appliceras på projektets **senaste version** → preview-VM:en patchas. Allt bakom en master-flagga så det är ett test, inte ny standard.

## Återanvänd infra (minimal ny kod)

| Behov | Återanvänd (befintligt) |
|---|---|
| Läs senaste version, ägar-/cross-tenant-säkert | `getEngineChatByIdForRequest` + `getEngineVersionForChatByIdForRequest` (`src/lib/tenant.ts`), `getPreferredVersion`/`getLatestVersion` (`chat-repository-pg`) |
| Applicera ops + persistens + preview-patch | `runQuickEdit` (`src/lib/gen/quick-edit/service.ts`) → `applyQuickEdits` + `guards.ts` → `addAssistantMessageAndCreateDraftVersion` → `tryPatchPreviewSession` → preview-host `POST /preview/session/patch` |
| Op-kontrakt (replace_text/replace_content/delete_file) | `QuickEditOp` (`src/lib/gen/quick-edit/types.ts`) |
| Path-/secret-/lockfile-skydd | `guards.ts` (path-traversal, `.env*`, nycklar, lockfiles) |
| Preview hot-patch | `SAJTMASKIN_PREVIEW_PATCH_LANE` + `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT` (redan i env/policy) |

## Ny kod (isolerad → trivial att ta bort)

| Fil | Roll |
|---|---|
| `src/app/api/openclaw/edit/route.ts` | Tunn route: 404 om flaggan av → ägarverifiering → resolve base → stale-base 409 → F3-decline → gateway-ops (server-LLM) → `runQuickEdit` in-process |
| `src/lib/openclaw/edit/prompt.ts` | Bygger strikt-JSON-prompt + inlinear exakta filrader (för verbatim `find`) |
| `src/lib/openclaw/edit/ops-schema.ts` | Zod-schema + `parseOpenClawEditOps` (JSON-extraktion, aldrig tyst no-op) |
| `src/lib/openclaw/edit/gateway.ts` | `requestQuickEditOps` — anropar OpenClaw-gatewayen (`/v1/chat/completions`, non-stream), validerar |
| `src/lib/openclaw/edit/index.ts` | Barrel |
| `src/components/openclaw/useOpenClawEdit.ts` | Klient-hook: POST `/api/openclaw/edit`, renderar resultat i samma chattråd |
| `OpenClawChatPanel.tsx` (edit) | Wand-toggle (visas när flaggan är på via `/api/openclaw/health`), routar send till edit-hook i edit-läge |

Punktändringar i befintliga (additiva, flagg-gejtade): `config.ts` (`OPENCLAW.editAgentEnabled`), `env.ts` (`OPENCLAW_EDIT_AGENT`), `config/env-policy.json` (rule + extraKnownKeys), `status.ts` (`editAgentEnabled` i snapshot), `rateLimit.ts` (`openclaw:edit`-bucket).

**Ingen** registrering i kärn-pipelinen (gen/finalize/preview). `runQuickEdit` äger all persistens; routen skriver aldrig direkt till DB eller loggar.

## Kontrakt som respekteras

- **Cross-tenant:** `getEngineChatByIdForRequest` + `getEngineVersionForChatByIdForRequest` före all fil-läsning.
- **Stale-base:** 409 `stale_base_version` när klientens known-latest ≠ serverns preferred och base ≠ preferred.
- **F3 (`integrations_base`):** nekas med tydligt fel (422) → hänvisa till builder-chatten. `runQuickEdit` har samma spärr (defense in depth).
- **Verbatim `find`:** gatewayen instrueras kopiera `find` ordagrant; `applyQuickEdits` rapporterar `no_match`/`ambiguous_match` → routen surfacar felet (aldrig tyst no-op).
- Guards blockerar redan path-traversal/secrets/lockfiles.

## Reversibilitet — borttagnings-checklista

1. Radera `src/app/api/openclaw/edit/` och `src/lib/openclaw/edit/`.
2. Radera `src/components/openclaw/useOpenClawEdit.ts` + återställ `OpenClawChatPanel.tsx` (ta bort Wand-toggle, `editMode`/`editAgentAvailable`, `dispatchSend`, health-fältet `editAgentEnabled`).
3. Ta bort `editAgentEnabled` i `src/lib/config.ts` och `src/lib/openclaw/status.ts` (+ health returnerar det automatiskt via snapshot).
4. Ta bort `OPENCLAW_EDIT_AGENT` i `src/lib/env.ts` + `config/env-policy.json` (rule + extraKnownKeys).
5. Ta bort `openclaw:edit`-raden i `src/lib/rateLimit.ts` (annars ofarlig orphan).
6. Ta bort env-värdet `OPENCLAW_EDIT_AGENT` i `.env.local` + Vercel.

Inga migrationer, inga kärnfil-beteendediffar → ren revert. Master-flaggan av ⇒ routen 404:ar, widget-knappen döljs, allt återgår till dagens "föreslå prompt".

## Env

| Var | Var | Not |
|---|---|---|
| `OPENCLAW_EDIT_AGENT` | `.env.local` + Vercel (development/preview) | **Ny** master-flagga. Av = 404. Ej production i test-skedet. |
| `SAJTMASKIN_PREVIEW_PATCH_LANE=true` | verifiera | Hot-patch till VM (finns redan). |
| `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT=true` | verifiera | Klient quick-edit-lane (finns redan). |
| `OPENCLAW_GATEWAY_URL` / `OPENCLAW_GATEWAY_TOKEN` | befintliga | Peka INTE gateway på egen Next-host. |

## Verifiering

- `npm run typecheck` = 0, `npm run lint` = 0, riktad `vitest` grön.
- Enhetstester: prompt→ops-mappning (`ops-schema.test.ts`, `prompt.test.ts`), flaggan av → 404, ägar-guard nekar fel tenant, stale-base → 409, F3 → 422, ops-fail → 422, happy path → 200 (`route.test.ts`).
- E2E (preview-VM): starta en mall-preview, skriv "gör färgen blå istället för rosa" i OpenClaw-chatten → verifiera ny version + patchad preview (`previewUrl`/`preview_status`).
