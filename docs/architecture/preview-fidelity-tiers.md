# Preview fidelity — tier 1–3 (egen motor)

**Senast uppdaterad:** 2026-03-26

Det här dokumentet beskriver **preview-nivåer** för **användargenererad** kod i buildern (egen motor). Det är **inte** samma numrering som K-018 *Fas 1–4* i planerna.

## Tier 1 — Shim (`/api/preview-render`)

- **Vad:** Servergenererad HTML (snabb approximation), **inte** full Next.js-runtime.
- **Roll:** **Fallback** när sandbox saknas, misslyckas eller inte hunnit starta.
- **Produktprioritet:** Användaren ska **inte** bara tyst hamna här om sandbox var **avsedd** men felade — se logg/toast via `build-error` / stream-handlers och [`preview-and-sandbox-flow.md`](./preview-and-sandbox-flow.md).

## Tier 2 — Vercel Sandbox (`npm install` + `npm run dev`)

- **Vad:** Isolerad VM med riktig **Next dev-server**; närmare lokal `npm run dev` för **den genererade** appen.
- **Roll:** **Avsedd primär** preview i iframen när start lyckas.
- **Styrning:** `SAJTMASKIN_SANDBOX_PREVIEW_MODE` — standard i kod **`dev_only`** (ingen `npm run build` i sandlådan). Se [`runtime-url.ts`](../../src/lib/mcp/runtime-url.ts).

## Tier 3 — Byggverifiering i sandbox

- **Vad:** Samma sandbox som tier 2, plus att **`npm run build`** körts som **separat signal** (`prodBuildVerified`, ev. loggutdrag i UI). Utlöses när läget är `dev_then_build` eller `build_only`.
- **Roll:** Säkerställa att genererad kod **bygger**, utan att kräva att dev-preview ersätts av production-server.

## Sajtmaskin `npm run dev` vs genererad sajt

- **Sajtmaskin** (`npm run dev` i detta repo): Byggaren och API-routes körs lokalt. **Tier 2** kräver ändå att **Vercel Sandbox API** är autentiserat (`VERCEL_OIDC_TOKEN` efter `vercel link` + `vercel env pull`, eller access token + team + projekt). Utan det: **503** på `POST .../sandbox-preview` och shim förblir preview — se [vercel-sandbox-credentials.md](./vercel-sandbox-credentials.md).
- **Genererad sajt i sandbox:** Kör sitt eget `npm run dev` **i Vercel Sandbox**; det är oberoende av var Sajtmaskin hostas (lokal eller Vercel).

## Var i koden

| Del | Fil |
|-----|-----|
| Sandbox aktiverad? | [`isSandboxConfigured`](../../src/lib/mcp/runtime-url.ts) |
| Start / resume | [`sandbox-preview.ts`](../../src/lib/gen/sandbox-preview.ts), `src/app/api/v0/chats/[chatId]/sandbox-preview/route.ts` |
| UI-prioritet `sandboxUrl` | [`useBuilderPageController.ts`](../../src/app/builder/useBuilderPageController.ts) — `pickVersionPreviewUrl` |
| Iframe / badges | [`PreviewPanel.tsx`](../../src/components/builder/PreviewPanel.tsx) |

## Se även

- [preview-and-sandbox-flow.md](./preview-and-sandbox-flow.md) — SSE, `sandbox-ready`, demo-URL-kedja
- [vercel-sandbox-credentials.md](./vercel-sandbox-credentials.md) — autentisering
