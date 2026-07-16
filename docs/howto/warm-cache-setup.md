# Warm-cache setup för pre-VM typecheck och lokal lintdiagnostik

**Syfte:** aktivera warm typecheck i dev och, separat, valfri lokal
ESLint-diagnostik. VM-ReleaseGate är alltid auktoritativ för F3-lint.

`runPreVmTypecheck` kan mata befintlig RepairGate före persist. `runPreVmEslint`
är däremot explicit icke-auktoritativ: finalize anropar den inte, den muterar
inga filer och startar aldrig repair eller promotion.

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

## Aktivera warm typecheck och valfri diagnostik

I `.env.local`:

```
SAJTMASKIN_PRE_VM_TYPECHECK="true"
SAJTMASKIN_BLOCKING_ESLINT="true"
```

Warm typecheck kör i `validateAndFix` efter esbuild-syntax. Warm ESLint-flaggan
är endast för direkt/lokal diagnostik mot cachen; dess resultat påverkar inte
produktens kontrollflöde.

## Vilka scaffolds är provisionerade?

**Alla aktiva scaffolds** — listan ägs av [`scripts/warm-cache-scaffolds.json`](../../scripts/warm-cache-scaffolds.json) (läses av både provisioneringsscriptet och smoke-checken). Med symlink-strategin är kostnaden per scaffold bara `tsconfig.json` + `eslint.config.mjs` (några KB) + en symlink, så det finns ingen anledning att bara täcka `landing-page` — det gapet gjorde tidigare att F2-generationer på andra scaffolds tyst skippade warm-passen med `cache_cold`. Ny scaffold i `src/lib/gen/scaffolds/`? Lägg till dess id i JSON-listan och kör om provisioneringen.

## Verifiera cachen (smoke-check)

```powershell
npm run warm-cache:smoke
```

Kollar per scaffold att cache-dir, `node_modules`-symlink, `tsconfig.json` och `eslint.config.*` finns, samt att `npx --no-install tsc/eslint --version` fungerar inne i cachen. Exit 1 med tydlig `COLD`-rad om något saknas.

## Uppdatera cachen

Kör om scriptet efter att:
- Du har uppgraderat en scaffold (`src/lib/gen/scaffolds/<id>/files/`)
- Repots `tsconfig.json` eller `eslint.config.mjs` har ändrats (symlink-strategin gör att `node_modules` alltid är i sync, men config-filerna är kopior)

```powershell
npm run provision:warm-cache:force
```

`--force` tar bort existerande **symlink** (bara symlinken; aldrig en riktig katalog som råkar ligga där) och skriver om configs.

## Verifiera att det fungerar

1. Provisionera cachen och kör `npm run warm-cache:smoke` → allt grönt.
2. Sätt typecheck-flaggan och, om önskat, den lokala lintflaggan i `.env.local`.
3. Starta `npm run dev`.
4. Generera en sida med en medveten type-only-import-bug (t.ex. `import type { Star } from "lucide-react"; <Star />`). Förväntat:
   - Finalize-pipelinen fångar TS1361 i blocking-passet
   - LLM-fixern kickar in **innan** version sparas
   - Ingen 118s bakgrunds-repair-pass
   - Version landar clean

## Observability: körde passen verkligen?

Varje finalize skriver `warmTsc` och ett legacy-kompatibelt `warmEslint`-block till `site.done` i
`logs/generationslogg/<run>/timeline.ndjson`:

```json
{ "warmTsc": { "enabled": true, "ran": false, "skipped": "cache_cold", "scaffoldId": "portfolio", "durationMs": 3 } }
```

- `ran: true` → passet körde på riktigt.
- `enabled: true` + `skipped: "cache_cold"` → **falsk trygghet**: flaggan är på men cachen saknas (server-loggen får också en `console.warn`). Kör om provisioneringen.
- `warmEslint.enabled: false` + `skipped: "not_reached"` → finalize anropar inte
  warm ESLint; lint ägs av VM-ReleaseGate.

Backoffice-sidan **LLM-flöde telemetri** (`backoffice/pages/llm_flode_telemetry.py`) aggregerar samma status per kategori och varnar när flagga-på-men-kall-cache förekommer. Schema: `docs/schemas/strict/site-done-telemetry.schema.json`.

## Caveats + uppföljning

- **CI/Vercel-provisionering** är out-of-scope för denna how-to. Det kräver antingen (a) en build-step som kör scriptet, eller (b) en prebuilt cache-layer i Vercel-container. Se P34 Fas D-planen för CI-delen.
- **Disk**: symlink-strategin betyder i praktiken noll extra disk per scaffold; men om du någon gång raderar repots `node_modules` går alla cache-symlinks dead. Kör då om provisioneringsscriptet.
- **Scaffold-version-skew** — vi använder repots deps som superset av scaffoldens. I 99% av fallen stämmer det, men om en scaffold någon gång får en `package.json`-dep som repot inte har, måste `SCAFFOLD_IDS`-flödet ändras till att göra ett riktigt `npm install` per scaffold-dir. Flagga när det inträffar.
