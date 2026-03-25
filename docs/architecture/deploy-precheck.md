# Deploy preflight (pre-check)

Kod: `src/app/api/v0/deployments/route.ts` — funktionen **`applyPreDeployFixes`** och kedjan därefter (miljökrav, `buildDeployReadiness`, ev. Vercel).

## Syfte

Innan filer skickas till Vercel normaliseras snapshoten så att typiska generatorfel inte saboterar `next build` i molnet: t.ex. saknad `package.json`, felaktiga CSS-`@utility`-block, saknat `"use client"` i App Router-filer som använder hooks, samt borttag av `pnpm`/`yarn`-lockfiler så att **`npm install`** används konsekvent.

## Auto-fixar (standard på, kan stängas av för felsökning)

| Åtgärd | Kommentar |
|--------|-----------|
| Ta bort `pnpm-lock.yaml`, `yarn.lock` m.fl. | Undviker fel installer på Vercel när projektet är tänkt för npm. |
| Skapa eller komplettera `package.json` | Lägger till saknade dependencies utifrån import-scan + versionskarta (`getDeployVersionMap`). |
| `"use client"` | Infogas i `app/**` när hooks används utan direktiv; hoppas över om filen exporterar `metadata`. |
| Instrument Serif `weight` | Justerar ogiltiga viktarrayer som annars kan krascha build. |
| Trasiga `@utility`-block i `.css` | Bästa-effekt-borttagning när block saknar avslutande `}`. |

Varningar som inte stoppar deploy (t.ex. saknade versionsnycklar i intern karta) hamnar i `preDeployWarnings` och i `deployReadiness.warnings`.

Om `package.json` inte går att parsa under dependency-patchning läggs **`package.json`** i `deployReadiness.invalidFiles` (samma svar som `precheckOnly` / 409-svaret). Fältet är **observabilitet**: `deployReadiness.ready` styrs fortfarande bara av saknade obligatoriska env-nycklar — men klienter kan visa att filen behöver manuell rättning.

### Canonical path: sparad version vs andra anrop

**`resolveEnvRequirementsFromVersionFiles`** / **`detectIntegrationsFromVersionFiles`** (manifest + heuristik på versionfiler) är källan för **readiness**, **files-GET** och **deploy-POST** efter preflight. Andra anrop (t.ex. live-kod i paneler) som använder `detectIntegrations(code)` direkt är avsiktliga shortcuts; de ska inte ersätta sanningen för en **sparad** version.

### Stäng av auto-fix (opt-out)

- **Miljö:** `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX=1` eller `DEPLOY_DISABLE_AUTO_FIX=1`.
- **Body:** `"skipAutoFix": true` i samma JSON som `chatId` / `versionId` (gäller både riktig deploy och `precheckOnly`).

Då körs **ingen** `applyPreDeployFixes`; `fixesApplied` innehåller en rad som förklarar att fixar hoppats över, och miljökrav beräknas på **ofixade** filer. Avsett för debugging — i produktion ska auto-fix normalt vara på så att Vercel-build inte misslyckas på triviala generatorfel.

## Miljökrav (hård spärr)

Efter auto-fix (eller efter hopphopp om auto-fix är av) beräknas obligatoriska miljövariabler via `resolveEnvRequirementsFromVersionFiles` + projektets konfigurerade env (`resolveProjectEnv`).

- **`POST /api/v0/deployments`** returnerar **409** med `code: "DEPLOY_MISSING_ENV"` om någon nyckel saknas — **innan** deployment-rad skapas eller Vercel anropas. Det speglar publiceringskollen i `GET .../readiness` (klienten bör redan vara blockerad; detta är **försvar på API-nivå**).

## `precheckOnly` (bakåtkompatibelt)

I JSON-body: `"precheckOnly": true` (tillsammans med `chatId`, `versionId`, ev. `projectId`).

- Kör samma auth-/ägarskap-/fil-flöde och samma pre-deploy-pipeline (`applyPreDeployFixes` om auto-fix inte är avstängd) + env-beräkning.
- **Ingen** credit-debitering, **ingen** `deployments`-rad, **inget** Vercel-anrop.
- Svar **200** med `deployReadiness`, `fixesApplied`, `preDeployWarnings`, `fileCount`.

Användbart för verktyg och felsökning utan att publicera.

## Observability

`devLogAppend` skriver `site.deploy.precheck` med `fixesApplied`, `warnings` och `deployReadiness` när en riktig deploy fortsätter efter godkänd preflight.

## Builder (klient)

Om användaren ändå triggar deploy när servern svarar **409** `DEPLOY_MISSING_ENV`, visar byggaren ett fel som **listar saknade nycklar** (från `deployReadiness.missingEnv`) och pekar kort mot **Projektets miljövariabler** (samma kolumn som **Lansering** överst). Samma händelse kan loggas på versionen under kategori `deploy`.
