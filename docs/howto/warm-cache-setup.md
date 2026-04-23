# Warm-cache setup för pre-VM typecheck + eslint

**Syfte:** göra `runPreVmTypecheck` och `runPreVmEslint` faktiskt **blocking** i dev, så TS1361, `react-hooks/*`, missing imports m.m. fångas **innan** version sparas och bakgrunds-repair-pass behöver kickas in.

Bakgrund: [`src/lib/gen/preview/warm-typecheck.ts`](../../src/lib/gen/preview/warm-typecheck.ts) + [`src/lib/gen/preview/warm-eslint.ts`](../../src/lib/gen/preview/warm-eslint.ts) är båda designade fail-open. Om scaffold-cachen inte existerar returnerar de `cache_cold` och finalize-pipelinen fortsätter utan blocking typecheck/lint. Empirisk kostnad 2026-04-23: en `/showcase`-sida shippades med `import type` + JSX-användning (TS1361), fångades inte förrän VM-build försökte bygga, 118s bakgrunds-repair-pass. Åtgärden: provisionera cachen en gång.

## En gångs-setup

```powershell
npm run provision:warm-cache
```

Scriptet skapar `<TEMP>/sajtmaskin/typecheck-cache/<scaffoldId>/` med:
- `package.json` (minimal, bara för att npm/eslint ska orka slå upp)
- `node_modules/` (symlink/junction till repots egna `node_modules` — O(1), delad med resten av utvecklingsträdet)
- `tsconfig.json` (kopia av repots)
- `eslint.config.mjs` (kopia av repots)

På Windows kan symlink-skapande kräva **Developer Mode** (Inställningar → Sekretess & säkerhet → För utvecklare). Om det fallerar printar scriptet en tydlig instruktion och avslutar med exit 2.

## Aktivera blocking passes

I `.env.local`:

```
SAJTMASKIN_PRE_VM_TYPECHECK="true"
SAJTMASKIN_BLOCKING_ESLINT="true"
```

Båda är default AV. När `true` **och** cachen är provisionerad kör de inne i `validateAndFix`-loopen efter esbuild-syntax, och eventuella fel matas in till LLM-fixern innan version landar i DB.

## Vilka scaffolds är provisionerade?

Just nu bara **`landing-page`** — det är den scaffold som matchar flest real-världs-prompts. `SCAFFOLD_IDS`-arrayen överst i [`scripts/provision-warm-cache.ts`](../../scripts/provision-warm-cache.ts) lägger du till fler när diskkostnad + latens mätts. Med symlink-strategin är kostnaden per scaffold bara `tsconfig.json` + `eslint.config.mjs` (några KB) + en symlink — så 10 scaffolds är triviala att provisionera om man vill.

## Uppdatera cachen

Kör om scriptet efter att:
- Du har uppgraderat en scaffold (`src/lib/gen/scaffolds/<id>/files/`)
- Repots `tsconfig.json` eller `eslint.config.mjs` har ändrats (symlink-strategin gör att `node_modules` alltid är i sync, men config-filerna är kopior)

```powershell
npm run provision:warm-cache:force
```

`--force` tar bort existerande **symlink** (bara symlinken; aldrig en riktig katalog som råkar ligga där) och skriver om configs.

## Verifiera att det fungerar

1. Provisionera cachen.
2. Sätt flaggorna i `.env.local`.
3. Starta `npm run dev`.
4. Generera en sida med en medveten type-only-import-bug (t.ex. `import type { Star } from "lucide-react"; <Star />`). Förväntat:
   - Finalize-pipelinen fångar TS1361 i blocking-passet
   - LLM-fixern kickar in **innan** version sparas
   - Ingen 118s bakgrunds-repair-pass
   - Version landar clean

## Caveats + uppföljning

- **CI/Vercel-provisionering** är out-of-scope för denna how-to. Det kräver antingen (a) en build-step som kör scriptet, eller (b) en prebuilt cache-layer i Vercel-container. Se P34 Fas D-planen för CI-delen.
- **Disk**: symlink-strategin betyder i praktiken noll extra disk per scaffold; men om du någon gång raderar repots `node_modules` går alla cache-symlinks dead. Kör då om provisioneringsscriptet.
- **Scaffold-version-skew** — vi använder repots deps som superset av scaffoldens. I 99% av fallen stämmer det, men om en scaffold någon gång får en `package.json`-dep som repot inte har, måste `SCAFFOLD_IDS`-flödet ändras till att göra ett riktigt `npm install` per scaffold-dir. Flagga när det inträffar.
