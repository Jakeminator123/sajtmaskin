# Deploy preflight (pre-check)

Kod: `src/app/api/v0/deployments/route.ts` — funktionen **`applyPreDeployFixes`** och kedjan därefter (miljökrav, `buildDeployReadiness`, ev. Vercel).

## Syfte

Innan filer skickas till Vercel normaliseras snapshoten så att typiska generatorfel inte saboterar `next build` i molnet: t.ex. saknad `package.json`, felaktiga CSS-`@utility`-block, saknat `"use client"` i App Router-filer som använder hooks, samt borttag av `pnpm`/`yarn`-lockfiler så att **`npm install`** används konsekvent.

## Auto-fixar (för närvarande alltid på)

| Åtgärd | Kommentar |
|--------|-----------|
| Ta bort `pnpm-lock.yaml`, `yarn.lock` m.fl. | Undviker fel installer på Vercel när projektet är tänkt för npm. |
| Skapa eller komplettera `package.json` | Lägger till saknade dependencies utifrån import-scan + versionskarta (`getDeployVersionMap`). |
| `"use client"` | Infogas i `app/**` när hooks används utan direktiv; hoppas över om filen exporterar `metadata`. |
| Instrument Serif `weight` | Justerar ogiltiga viktarrayer som annars kan krascha build. |
| Trasiga `@utility`-block i `.css` | Bästa-effekt-borttagning när block saknar avslutande `}`. |

Varningar som inte stoppar deploy (t.ex. saknade versionsnycklar i intern karta) hamnar i `preDeployWarnings` och i `deployReadiness.warnings`.

## Miljökrav (hård spärr)

Efter auto-fix beräknas obligatoriska miljövariabler via `resolveEnvRequirementsFromVersionFiles` + projektets konfigurerade env (`resolveProjectEnv`).

- **`POST /api/v0/deployments`** returnerar **409** med `code: "DEPLOY_MISSING_ENV"` om någon nyckel saknas — **innan** deployment-rad skapas eller Vercel anropas. Det speglar publiceringskollen i `GET .../readiness` (klienten bör redan vara blockerad; detta är **försvar på API-nivå**).

## `precheckOnly` (bakåtkompatibelt)

I JSON-body: `"precheckOnly": true` (tillsammans med `chatId`, `versionId`, ev. `projectId`).

- Kör samma auth-/ägarskap-/fil-flöde och samma `applyPreDeployFixes` + env-beräkning.
- **Ingen** credit-debitering, **ingen** `deployments`-rad, **inget** Vercel-anrop.
- Svar **200** med `deployReadiness`, `fixesApplied`, `preDeployWarnings`, `fileCount`.

Användbart för verktyg och felsökning utan att publicera.

## Observability

`devLogAppend` skriver `site.deploy.precheck` med `fixesApplied`, `warnings` och `deployReadiness` när en riktig deploy fortsätter efter godkänd preflight.
