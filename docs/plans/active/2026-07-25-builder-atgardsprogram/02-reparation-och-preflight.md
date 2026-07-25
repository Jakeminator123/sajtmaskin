---
status: active
owner: unassigned
created: 2026-07-25
topic: Reparationsärlighet — en falsk gate får aldrig bli en instruktion till modellen, ett preview-transform får aldrig hamna i sparade filer, och en reparation får aldrig göra artefakten sämre. Täcker F3, F4, F5, F10 och Ö4.
source: Observationssession 2026-07-25 (`.cursor/logg-internet/runs/2026-07-25_0302.md`). Kodverifierat mot master `57416834`.
parent: 00-master-plan.md
---

# Spår 02 — Reparation och preflight

## TL;DR

Tre genereringsvarv, alla underkända, och **reparationen gjorde det värre för
varje varv.** Varv 1 stoppades av en falsk beroendevarning; reparationen löste
den genom att hitta på ett npm-paket. Varv 2 och 3 stoppades av ett
preview-transform som skrivits in i de sparade filerna, och kom aldrig loss.

| Varv | Tid | Blockerare | Vad reparationen gjorde |
|---|---|---|---|
| 1 | 211,6 s | `crypto` inte pinnad i `package.json` | skrev in `"crypto": "^1"` |
| 2 | 37,8 s | strippad preview-import i sparade filer | fastnade |
| 3 | 49,2 s | samma | fastnade |

Alla tre skrev till **samma** version-id, så det finns ingen punkt att gå
tillbaka till.

## Rotorsaker

### F3 — preflight känner inte igen Node-inbyggda moduler

`src/lib/gen/validation/project-sanity.ts:35-56` definierar `BUILTIN_PACKAGES`.
Listan innehåller React, Next, Tailwind-kedjan — och `"node:"` som prefixregel
(`isBuiltinPackage`, rad 102–112, tillåter allt som börjar med `node:`).

Den innehåller **inte en enda Node-kärnmodul under sitt bara namn.** Inget
`crypto`, `fs`, `path`, `url`, `buffer`, `stream`, `os`, `http`, `zlib`.

Modellen skrev `import { createHash } from "crypto"` (utan prefix).
`normalizePackageName` (rad 93–100) ger `"crypto"`, `isBuiltinPackage` säger
nej, och rad 480 formulerar felet som en instruktion:

> `Imported third-party package "crypto" is used in code but not pinned in package.json`

Reparationsmodellen gjorde exakt vad texten bad om och skrev
`"crypto": "^1"` i `dependencies`. `crypto` på npm är en avvecklad platshållare
som kan skugga den inbyggda modulen — reparationen gjorde bygget sämre, inte
bättre.

Samma lucka finns i `src/lib/gen/autofix/dep-completer.ts:30-50`. Dess
`BUILTIN_PACKAGES` saknar både Node-kärnmoduler **och** `node:`-regeln, och dess
`normalizePackageName` (rad 190–196) lämnar `node:crypto` orört. Där hamnar det i
`unknownPackages` → varning i stället för fel, vilket förklarar
"varningar: 3" i telemetrin.

### F4 — preview-transformet skriver i den kanoniska artefakten

Det här är den allvarligaste: två lager i pipen motsäger varandra direkt.

| Lager | Vad det gör | Var |
|---|---|---|
| suspense-regeln | kommenterar bort `next/headers`, `next/og`, `server-only` och skriver `// … (stripped for preview compatibility)` | `src/lib/gen/suspense/default-rules.ts:269-284` |
| preflight | **underkänner** varje fil som innehåller den strängen | `src/lib/gen/validation/project-sanity.ts:281-288` |

Anledningen till att båda kan vara sanna samtidigt är att transformet ligger i
strömmen, inte i en preview-kopia: `SuspenseLineProcessor` körs inline i
`src/lib/providers/own-engine/generation-stream.ts:227` och i
`src/lib/own-engine/generate-site-from-prompt.ts:157`, och det transformerade
`accumulatedContent` är vad `finalizeAndSaveVersion` parsar till versionens
filer.

Alltså: **preview-anpassningen är inte preview-only.** Den är det enda
innehållet som finns. Ingen reparation kan lösa det, eftersom nästa varv
strömmar genom samma transform igen — vilket är precis vad varv 2 och 3 visar.

Följdfel i samma fil: `app/personal/page.tsx` anropar `createHash(...)` utan
import, eftersom raden som skulle ha importerat den aldrig fanns i den strippade
versionen.

### F5 — autofix la till fel import

`app/api/personal-auth/route.ts` använder `NextRequest` och `NextResponse` men
importerar ingen av dem. Autofix rapporterade i stället:

> Added missing next/navigation imports: redirect

`nextjs-navigation-import-fixer` la till `redirect` från `next/navigation` — en
symbol som inte behövdes — och missade de två som faktiskt saknades från
`next/server`. Fixaren täcker `next/navigation` men inte `next/server`-typerna i
route handlers.

### F10 — reparationer har ingen återgångspunkt

Alla tre varv rapporterade `Version: f4aabb03-f708-4583-b520-89ce0ed3d0e1` och
`Filer i versionen: 31`. Reparationen skriver över raden i stället för att skapa
en ny version. Konsekvenser:

- användaren kan inte gå tillbaka till läget före en misslyckad reparation
- versionsnumreringen speglar inte hur många gånger innehållet ändrats
- verdikt och kvitton som hänger på `versionId` beskriver ett innehåll som inte
  längre finns — vilket är exakt luckan som
  [`2026-07-25-innehallsrevision-verifieringskvitton.md`](../2026-07-25-innehallsrevision-verifieringskvitton.md)
  beskriver

**Detta spår ska inte lösa F10.** Det är samma primitiv som den planen äger.
Här räcker det att F10 refereras dit, så att ingen bygger en parallell fix.

### Ö4 — "+ Sida" kan skapa en trasig sida

`buildNewPageContent` (`src/lib/builder/preview-page-ops.ts`) producerar en
komplett sida med platshållartext — den delen är redan bra. Risken sitter i
nästa steg: `buildAddNavLinkOps` (rad 663–696) muterar en befintlig fil via
`insertDataNavEntry` eller `insertJsxNavLink`, och skriver resultatet direkt som
`replace_content` utan att kontrollera att filen fortfarande går att parsa.

En regex-baserad JSX-insättning som hamnar fel ger en trasig navigationsfil —
vilket matchar användarens beskrivning av "webpackproblem eller annan errorlogg"
efter ett klick på "+ Sida".

## Sekvens

Steg 1–3 kan köras parallellt av samma agent (olika filer). Steg 4 är beroende av
att steg 2 landat.

### Steg 1 — F3: Node-kärnmoduler är inte tredjepartspaket

- Lägg en delad, kanonisk lista över Node-kärnmoduler (både bart namn och
  `node:`-form) på ett ställe, och konsumera den från **båda** ställena:
  `project-sanity.ts` och `dep-completer.ts`. Duplicera inte listan.
- `Module.builtinModules` från Node är den naturliga källan; hårdkoda bara om
  runtime-miljön inte tillåter det.
- Formulera om feltexten så att den inte kan läsas som en instruktion att pinna:
  ange vad som saknas, inte vad modellen ska skriva.
- Ny test: `import { createHash } from "crypto"` ger **noll** preflight-fynd.
- Ny test: en `package.json` som deklarerar en Node-kärnmodul som dependency ger
  ett **fel** (det är den riktiga defekten, och den saknar i dag detektion).

### Steg 2 — F4: dela regeluppsättningen, inte pipelinen

Kärnfrågan är arkitektonisk: vilka transformationer hör till **artefakten** och
vilka hör till **previewen**?

> **Rättelse efter Codex-granskning (P1, PR #614):** ett tidigare utkast föreslog
> att flytta hela `SuspenseLineProcessor` till efter persisteringen. Det vore
> fel. `createDefaultRules()` innehåller inte bara import-strippningen — den
> expanderar komprimerade URL-alias, lagar ogiltiga JSX-attribut, materialiserar
> bildplatshållare och gör andra **kanoniska** reparationer. Att spara den råa
> strömmen skulle alltså persistera trasiga och platshållarfyllda filer i stället
> för att lösa problemet. Rätt åtgärd är att **dela regeluppsättningen.**

- Klassificera varje regel i `src/lib/gen/suspense/default-rules.ts` som
  **kanonisk** (hör till den sparade artefakten) eller **preview-only** (hör bara
  till preview-renderingen).
- `forbiddenImportStrip` (rad 275–284, `BLOCK_ENTIRELY`) är den enda kända
  preview-only-regeln i dag: den kommenterar bort `next/headers`, `next/og` och
  `server-only` eftersom preview-VM:en inte klarar dem. Den hör inte i sparad kod.
- Låt `createDefaultRules()` ta en parameter, eller exponera två uppsättningar, så
  att genereringsströmmen kör de kanoniska reglerna och preview-lanen kör
  kanoniska + preview-only.
- Gå igenom regellistan noggrant innan uppdelningen. Varje felklassad regel blir
  antingen en trasig sparad fil eller en trasig preview, och båda är dyrare än
  det fel vi lagar.
- Ny test: en fil som importerar `next/headers` sparas **med** importen intakt och
  passerar `project-sanity` utan `code_structure_failure`.
- Ny test: samma fil får den strippade varianten i previewen.
- Ny test (regressionsskydd för rättelsen ovan): en sparad fil har fortfarande
  expanderade URL:er, lagade JSX-attribut och materialiserade bildplatshållare —
  dvs. de kanoniska reglerna kördes.

### Steg 3 — F5: `next/server`-typer i route handlers

- Utöka fixaren så att `NextRequest`/`NextResponse` importeras från
  `next/server` när de används i en `app/api/**/route.ts`.
- Lägg till en guard: fixaren får inte lägga till en symbol som inte används i
  filen (det som hände med `redirect`).
- Ny test: en route som använder båda symbolerna utan import får korrekt
  `import type { NextRequest }` + `import { NextResponse }`, och `redirect`
  läggs **inte** till.

### Steg 4 — reparationen får inte introducera nya blockerare

Detta är regeln som gör F3 och F4 ofarliga även om något liknande återkommer.

- Efter varje reparationsvarv: jämför blockerar-mängden före och efter.
- Om reparationen **introducerar** en blockerare som inte fanns före: förkasta
  reparationen, behåll föregående innehåll och rapportera det till användaren.
- Om samma blockerare kvarstår efter två varv: sluta försöka och säg vad som är
  fel, i stället för att köra ett tredje identiskt varv.
- Ny test: en reparation som byter en blockerare mot en ny blockerare rullas
  tillbaka.

### Steg 5 — Ö4: validera innan skrivning

- `buildAddNavLinkOps` ska parsa det muterade innehållet innan det returneras som
  en `replace_content`-op. Samma parser-kontroll som autofix använder
  (`countParseErrors` i `src/lib/gen/autofix/rules/import-binding-ast.ts`).
- Om parse-antalet ökar: hoppa över navigationslänken och returnera
  `navUpdated: false`. Sidan skapas ändå; användaren kan be om länken i chatten.
- Ny test: en navigationsfil vars JSX-struktur inte matchar insättningsmönstret
  lämnas orörd i stället för att skrivas trasig.

## Definition of done

| # | Krav | Bevis |
|---|---|---|
| 1 | Node-kärnmoduler flaggas inte som tredjepartspaket i något av de två lagren | nya tester i `project-sanity` + `dep-completer` |
| 2 | En Node-kärnmodul deklarerad som dependency ger fel | nytt test |
| 3 | Sparade filer innehåller aldrig `(stripped for preview compatibility)` | nytt test + acceptanskörningen |
| 4 | Previewen fungerar fortfarande för `next/headers`-filer | nytt test |
| 5 | `NextRequest`/`NextResponse` importeras korrekt; oanvända symboler läggs inte till | nytt test |
| 6 | En reparation som introducerar en ny blockerare rullas tillbaka | nytt test |
| 7 | "+ Sida" kan inte skriva en oparsbar navigationsfil | nytt test |
| 8 | F10 är hänvisad till innehållsrevisions-planen, inte fixad här | rad i `BUG-SWARM-BACKLOG.md` |

## Risker

| Risk | Hantering |
|---|---|
| Uppdelningen av regeluppsättningen felklassar en regel | lås båda sidorna med tester **före** refaktoreringen: kanoniska reparationer syns i sparad fil, preview-strippningen syns bara i preview |
| `Module.builtinModules` kan skilja mellan Node-versioner | Volta pinnar 22.23.1; lägg ett test som låser att `crypto` och `fs` finns i mängden |
| Rollback av reparation kan låsa en sajt i ett trasigt läge utan försök | begränsa till fallet "ny blockerare tillkom"; kvarstående blockerare får fortfarande ett andra försök |
| Parse-guarden i Ö4 gör att navigationslänken tystnar | rapportera `navUpdated: false` i UI så användaren vet att länken saknas |
