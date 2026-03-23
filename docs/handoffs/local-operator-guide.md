# Lokal operatör — vad som behövs för att testa (2026-03)

Den här guiden samlar svar på återkommande frågor: **scaffolds**, **komponentbibliotek**, **shadcn.io-speglade repon**, **sandbox/quality gate**, och **vad du behöver göra** om du bara kör `npm run dev`.

## Vad du behöver göra som utvecklare/testare

| Situation | Åtgärd |
|-----------|--------|
| Testa generering, preview, autofix i utveckling | `npm run dev` räcker. **Ingen** ny embedding-körning eller manuell kuratering krävs om repot redan innehåller genererade artefakter (`scaffold-embeddings.json`, `template-library-embeddings.json`, m.m.). |
| Uppdatera referenskatalog eller scaffold-research efter scrape | Kör pipeline enligt [`docs/architecture/scaffold-system.md`](../../architecture/scaffold-system.md) — t.ex. `research:normalize`, `template-library:rebuild`, `scaffolds:build`. |
| Felsöka path-hygien i JSON | `npm run verify:generated-paths` |

## Hur hänger scaffolds ihop med template-library?

- **Template-library** = normaliserad referenskatalog från Vercel-skrapning. Används som prompt-referens vid generering.
- **Scaffolds** = runtime-basprojekt (10 st i `src/lib/gen/scaffolds/`). Matchas mot prompten via **embedding-similarity**.
- Scaffolds och template-library är oberoende: scaffolds styr *hur* sajten byggs, template-library ger *referenskontext*.

## Finns det redan ett "komponentbibliotek"?

**Ja, men inte som 150 nedladdade GitHub-repon.**

| Del | Roll |
|-----|------|
| **`src/components/ui/`** (shadcn/ui i ert repo) | Faktiska komponenter som preview och generering kan importera. |
| **Officiellt shadcn registry** | Uppdateras cache:at; används bl.a. för kontextberikning (`registry-enricher` m.fl.). |
| **`docs-snippets` / inbäddade mönster** | Statiska guider i promptstöd. |
| **Template library** (`template-library.generated.json` + embeddings) | Referensrader för semantisk matchning i systemprompten — metadata och kodsnuttar, inte en monterad komponentkatalog. |

De **~150 shallow-klonerna** under `_template_refs/shadcn-io-mirror/` är **Zone 1** (lokal cache) enligt [`docs/architecture/scaffold-lane-model.md`](../../architecture/scaffold-lane-model.md). De matar **inte** appen automatiskt vid `npm run dev`.

### Möjliga framtida användningar av speglingen (utan att ändra runtime)

- **Kurera** några repon som nya `template-library`-poster.
- Bygg ett **metadata-index** (manifest + taggar) från `manifest.json` / `clone_report.json` för offline-analys.

## Sandbox och quality gate

### `NEXT_PUBLIC_SANDBOX_AUTO` — preview efter sandlåda

Sätt i `.env.local` (giltiga värden: `yes`, `y`, `true`, `1`, `on` — case-insensitive):

```bash
NEXT_PUBLIC_SANDBOX_AUTO=yes
```

När detta är aktivt **väntar** byggaren med att sätta preview-URL (`demoUrl`) tills **quality gate** (sandlåda med `tsc` / `next build`) har körts klart. Kräver att sandlådan är **konfigurerad** (se nedan); annars returnerar API 501 och preview visas direkt som vanligt.

Implementation: [`sandbox-auto.ts`](../../../src/lib/sandbox/sandbox-auto.ts), [`stream-handlers.ts`](../../../src/lib/hooks/chat/stream-handlers.ts), [`post-checks.ts`](../../../src/lib/hooks/chat/post-checks.ts).

### Credentials för sandlåda

1. **Quality gate** (`/api/v0/chats/[chatId]/quality-gate`) använder `@vercel/sandbox` och `isSandboxConfigured()`:
   - **Lokalt:** `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` måste vara satta.
   - **På Vercel hosting:** sandlåde-SDK kan använda plattformens OIDC.

2. **Utan `SANDBOX_AUTO`:** efter generering anropar `post-checks.ts` quality gate parallellt med att preview redan kan visas. Om sandlådan inte är konfigurerad returnerar API:t 501 och UI visar att steget hoppades över.

3. **MCP `generateSite`** har `scaffoldMode: "auto"` — det gäller vilket internt scaffold som väljs, inte sandbox.

### Kort översikt preview vs sandbox

| Läge | Vad det är |
|------|------------|
| **Intern preview** (`/api/preview-render`) | Snabb, begränsad HTML/React — inte full Next.js. |
| **Sandbox quality gate** | Riktig isolerad miljö för `tsc` / `next build` (kräver credentials). |

## Relaterad dokumentation

| Dokument | Innehåll |
|----------|----------|
| [`unified-repair-flow.md`](unified-repair-flow.md) | Autofix + delad LLM-reparation |
| [`docs/architecture/scaffold-system.md`](../../architecture/scaffold-system.md) | Scaffold-matchning (embedding-baserad) |
| [`docs/architecture/structure-and-terminology.md`](../../architecture/structure-and-terminology.md) | Terminologi |
| [`docs/architecture/scaffold-lane-model.md`](../../architecture/scaffold-lane-model.md) | Zone 1-3 |
