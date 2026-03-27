# Preview, sandbox och deploy

**Senast uppdaterad:** 2026-03-27

## Begrepp

| Tier | Vad | Ungefär |
|------|-----|--------|
| 1 — **Shim** | `/api/preview-render` | Snabb HTML-approximation — **inte** full Next-server |
| 2 — **Sandbox** | Vercel Sandbox / `npm run dev` | Riktigare Next dev-runtime (ephemeral, on-demand) |
| 3 — **Build-check** | `npm run build` i sandbox (läge-beroende) | Validering närmare produktion |

**Produktintent:** när sandbox lyckas ska **sandbox-URL** prioriteras i iframen före shim och före valfri v0-hostad `demoUrl` (om flaggor så säger). Fel (`502`, HMR-brus) och sekvens: följ `generation-stream.ts` → `sandbox-preview.ts` → `PreviewPanel.tsx`.

## Demo-URL-kedja

1. Efter `done` i SSE: ofta `demoUrl` → shim.
2. Om sandbox konfigurerad: `startSandboxPreview` → `sandbox-ready` / `build-error`.
3. `engine_versions.sandbox_url` uppdateras vid lyckad sandbox.

Kodstart: `generation-stream.ts`, `finalize-version.ts`, `sandbox-preview.ts`, `PreviewPanel.tsx`, `stream-handlers.ts`.

## MCP vs builder-stream

`src/lib/mcp/generate-site.ts` kan starta sandbox **utan** samma SSE som UI — viktigt vid felsökning.

## Deploy

- **Preflight / auto-fix** före Vercel: `applyPreDeployFixes`, lockfile-normalisering, `"use client"`, m.m. — se `src/app/api/v0/deployments/route.ts` och Vitest `route.test.ts` (`precheckOnly`, `skipAutoFix`).
- **409 DEPLOY_MISSING_ENV** om obligatoriska nycklar saknas.
- Opt-out: `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX` eller `skipAutoFix` i body.

## Sandbox-credentials

Vercel Sandbox token / org: [`docs/ENV.md`](../ENV.md) (`VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN`, team/project-id enligt behov).

## Webhook / deploy events

Vercel → Sajtmaskin webhook: `src/app/api/webhooks/vercel/route.ts` (`VERCEL_WEBHOOK_SECRET`).
