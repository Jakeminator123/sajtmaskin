# Spike: `shadcn/registry` program-API i en Next 16 server-route?

> Idé/lärdom (inte aktiv plan). Del av `docs/plans/avklarat/2026-07-22-shadcn-registry-beskriv-komposition.md` — **Fas 0**. Beslutet grindar Fas 1 & 4.

## Fråga

Ska Sajtmaskin importera shadcns program-API (`import { getRegistries, getRegistryItems, resolveRegistryItems, searchRegistries } from "shadcn/registry"`) i en Next 16 App Router-route (Node runtime) för discovery-lagret (Fas 1) och resolver-konsolideringen (Fas 4) — eller fortsätta med den befintliga HTTP-fetchen i `src/lib/shadcn/registry-service.ts`?

## Metod (2026-07-22)

- Temp-installerade `shadcn@4.13.1` med `npm install --no-save` (rörde inte `package.json`/`package-lock.json`; återställde efteråt med `npm ci`).
- **Node ESM-import-smoke:** `await import("shadcn/registry")` i en `.mjs` i repo-roten.
- **Statisk modulgraf-analys:** läste `node_modules/shadcn/dist/registry/index.js` + dess chunk-graf (`chunk-*.js`) och listade alla externa `import`/`require` som subpathen faktiskt drar in.
- **Peer-/dep-närvaro:** kollade vilka transitiva paket som är installerade respektive saknas.
- (Ingen full `next build`-probe kördes: den statiska grafen + saknade peer-deps är redan konklusiva, och en probe-route committades aldrig.)

## Fynd

1. **Importen fungerar i Node.** `shadcn` är `type: module` (ren ESM) och exponerar `./registry` som subpath. Alla program-API-funktioner finns: `getRegistries`, `getRegistriesIndex`, `getRegistry`, `getRegistryItems`, `resolveRegistryItems`, `searchRegistries`, `loadRegistry`, `loadRegistryItem` + fel-klasser.
2. **Subpathen är INTE isolerad från CLI:n.** `dist/registry/index.js` re-exporterar allt från en gemensam chunk (`chunk-UBIN4IG2.js`, ~169 KB) som statiskt importerar hela CLI-toolchainen:
   - `@babel/core`, `@babel/parser`, `@babel/plugin-transform-typescript`
   - `ts-morph` (drar in egen `typescript`, ~23 MB på disk)
   - `execa`, `child_process`, `prompts`, `ora` (interaktiva CLI-primitiver — meningslösa/riskabla i en serverless-route)
   - `fs-extra`, `fast-glob`, `recast`, `cosmiconfig`, `tsconfig-paths`, `undici`, `zod`
3. **Saknade peer-deps.** Chunk-grafen importerar även ikonpaket som **inte** är installerade: `@hugeicons/react`, `@hugeicons/core-free-icons`, `@tabler/icons-react`, `@phosphor-icons/react`, `@remixicon/react`. En Next-bundling av routen skulle kräva att dessa är resolverbara eller externaliserade, annars `Module not found` vid build.

## Bedömning

Att importera `shadcn/registry` i en runtime-route innebär i praktiken att man drar in hela CLI-verktygslådan (babel + ts-morph + execa + prompts + ora + ikonpaket) i den serverless-funktionen — bundle-svullnad på tiotals MB, interaktiva CLI-beroenden som inte hör hemma i en route, och sannolika `serverExternalPackages`-/NFT-justeringar plus fixar för saknade peer-deps. Programmatiskt API:t är alltså stabilt och dokumenterat, men **paketeringen** är byggd för CLI-kontext, inte för en RSC-serverless-route.

Det som discovery-/resolver-lagret faktiskt behöver — hämta registry-index, hämta item-JSON, ev. fuzzy-sök — gör den befintliga `registry-service.ts` redan över ren HTTP mot samma `/r/{name}.json`-endpoints (med style-fallback och cache), utan CLI-toolchainen.

## Beslut (konservativt — default per ägarens direktiv)

> **Rekommendation: fortsätt med HTTP-fetch. Lägg INTE till `shadcn` som runtime-dep nu.**

- Fas 1 (`/api/shadcn/describe`) och Fas 4 (resolver) byggs på befintlig `registry-service.ts`-HTTP-väg. `searchRegistries` semantik kan återskapas billigt (fuzzy över namn/beskrivning) eller ersättas av LLM-driven query + HTTP-hämtning enligt planen.
- shadcn MCP behålls för Cursor/dev (pinnad `shadcn@4.13.1`) — det är IDE-lokal integration, inte runtime.
- **Om program-API ändå ska tas in senare:** kräver (a) `shadcn` som runtime-`dependency` (en server-route importerar det, inte dev-verktyg), (b) `serverExternalPackages`-post + verifierad `next build`, (c) hantering av de saknade ikon-peer-deps, och (d) mätning av funktions-bundle-storlek. Ompröva bara om shadcn börjar publicera en lättare, CLI-fri registry-subpath.

## Konsekvens för planen

Fas 1 & 4 är grindade till **HTTP-fetch-spåret**. Ingen ny runtime-dep introduceras i Fas 0.
