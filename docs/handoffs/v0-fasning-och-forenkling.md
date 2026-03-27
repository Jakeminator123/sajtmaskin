# Handoff: V0-fasning och förenkling

**Mål:** Ta bort beroende på V0 Platform (`v0-sdk`) och `src/lib/v0/`-mappen, flytta generiska hjälpfunktioner till neutrala moduler, och lämna kvar ett tydligt own-engine-only-byggspår.

**Prioritet:** Hög — blockerar “own-engine som enda spår” och minskar förvirring mellan `/api/v0/` (HTTP API-version) och V0 Platform.

**Kanoniska källor:**  
[`docs/handoffs/gpt-external-review.txt`](gpt-external-review.txt) · [`docs/architecture/v0-platform-sunset-audit.md`](../architecture/v0-platform-sunset-audit.md) (om den finns) · [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc)

---

## 1. Bakgrund (skilj tre värden)

| Begrepp | Vad det är |
|--------|------------|
| **`/api/v0/`** | Sajtmaskins egen REST-API-version — **behåll** om du inte vill byta om hela klienten. |
| **`src/lib/v0/`** | Repokatalog som ska flyttas bort / tömmas. |
| **`v0-sdk` + V0 Platform API** | Extern leverantör — **skas bort** från produktflödet. |

Own-engine codegen (`src/lib/gen/`, `src/lib/own-engine/`) får **inte** importera `v0-sdk` eller `@/lib/v0/*` — se [`src/lib/own-engine/own-engine-v0-boundary.test.ts`](../../src/lib/own-engine/own-engine-v0-boundary.test.ts).

---

## 2. Nuvarande yta (vad som måste flyttas eller ersättas)

### 2.1 `v0-sdk` och `v0-generator`

- [`src/lib/v0.ts`](../../src/lib/v0.ts) — `createClient` från `v0-sdk.
- [`src/lib/v0/v0-generator.ts`](../../src/lib/v0/v0-generator.ts) — mall/registry, `generateFromTemplate`, `initFromRegistry`, m.m.

**Importer som fortfarande når v0:**

- [`src/app/api/template/route.ts`](../../src/app/api/template/route.ts) — `generateFromTemplate`, `findMainFile`, `sanitizeV0Metadata`
- [`src/app/api/v0/chats/init/route.ts`](../../src/app/api/v0/chats/init/route.ts) — `assertV0Key`, `v0`, `sanitizeV0Metadata`
- [`src/app/api/v0/chats/init-registry/route.ts`](../../src/app/api/v0/chats/init-registry/route.ts) — `initFromRegistry`, `v0-url-parser`
- [`src/app/api/github/export/route.ts`](../../src/app/api/github/export/route.ts) — `assertV0Key`, `v0`

### 2.2 Generiska hjälpfunktioner (ska inte bero på “v0”-namn)

- [`src/lib/v0/errors.ts`](../../src/lib/v0/errors.ts) — `normalizeV0Error` → flytta till t.ex. `src/lib/providers/errors/normalize-provider-error.ts` (provider-neutral HTTP-felnormalisering).
- [`src/lib/v0/sanitize-metadata.ts`](../../src/lib/v0/sanitize-metadata.ts) → t.ex. `src/lib/sanitize/sanitize-metadata.ts` (djupgående rensning av metadata för log/webhook).
- [`src/lib/v0/v0-url-parser.ts`](../../src/lib/v0/v0-url-parser.ts) — shadcn-registry URL:er → t.ex. `src/lib/shadcn/registry-url.ts` (uppdatera alla importer från builder, API routes och `shadcn-registry-*`).

**Importer av `normalizeV0Error`:** egna stream/files routes under `src/app/api/v0/chats/`.

**Importer av `v0-url-parser`:** `src/app/api/shadcn/registry/*`, `src/lib/shadcn-registry-*.ts`, `UiElementPicker.tsx`, `UnifiedElementPicker.tsx`.

---

## 3. Arbetsordning (pragmatisk migration)

### Steg A — Flytta utilities utan att ändra beteende

1. Skapa ny modul för `normalize-provider-error` (kopia av logik från `errors.ts`, neutral namngivning).
2. Skapa `sanitize-metadata` under neutral path.
3. Flytta registry-URL-helpers till `registry-url.ts` (eller liknande).
4. **Uppdatera alla call sites** till nya paths.
5. Lämna tunna re-exports i gamla filer **temporärt** om det minskar risk — eller ta bort direkt om inga kvarvarande importer.

### Steg B — Feature flag för V0 Platform

- Inför t.ex. `SAJTMASKIN_V0_PLATFORM_ENABLED` (default `false` i nya miljöer).
- När `false`: routes som anropar `v0.chats.*` / `generateFromTemplate` returnerar **tydligt fel** (410/501 + JSON med “use own-engine scaffold flow”) — inte halvtrasiga tillstånd.

### Steg C — Ersätt template-init med own-engine

- **Målbild:** `POST /api/template` (eller efterföljare) skapar engine-chat, väljer scaffold (`matchScaffoldWithEmbeddings` / registry), hydrerar via befintlig merge/finalize-spår — **utan** att klona v0-output.
- Återanvänd: [`src/lib/gen/orchestrate.ts`](../../src/lib/gen/orchestrate.ts), [`src/lib/gen/stream/finalize-merge.ts`](../../src/lib/gen/stream/finalize-merge.ts), [`src/lib/gen/scaffolds/`](../../src/lib/gen/scaffolds/).

### Steg D — GitHub export

- Granska [`src/app/api/github/export/route.ts`](../../src/app/api/github/export/route.ts): om `v0` bara används för ZIP/ID — byt till **engine_versions** / `files_json` (samma som own-engine ZIP-flödet i [`src/lib/gen/engine-version-zip.ts`](../../src/lib/gen/engine-version-zip.ts) om det finns).

### Steg E — Ta bort paket och mapp

1. Ta bort `v0-sdk` från [`package.json`](../../package.json).
2. Ta bort `src/lib/v0.ts` och `src/lib/v0/` när inga importer kvar.
3. Uppdatera [`src/lib/own-engine/own-engine-v0-boundary.test.ts`](../../src/lib/own-engine/own-engine-v0-boundary.test.ts): valfritt **skärp** till “mappen `src/lib/v0` får inte existera” (om testbar på disk).

### Steg F — `V0_API_KEY` och `V0_FALLBACK_BUILDER`

- [`src/lib/env.ts`](../../src/lib/env.ts), [`docs/ENV.md`](../ENV.md): markera som **deprecated** eller ta bort när inga routes behöver dem.
- Verifiera om `NEXT_PUBLIC_V0_BUILDER_PREVIEW_FALLBACK` i [`next.config.ts`](../../next.config.ts) fortfarande används — **ta bort död kod** om inga referenser i `src/`.

---

## 4. Acceptanskriterier

- [ ] `npm ls v0-sdk` visar inget (eller paketet borttaget).
- [ ] Inga `import ... from "@/lib/v0"` eller `from "v0-sdk"` i produktionskod (testmocks kan uppdateras).
- [ ] Builder och own-engine codegen fungerar utan `V0_API_KEY`.
- [ ] Mall/template-init antingen bort eller ersatt med scaffold-hydration.
- [ ] Shadcn/registry fungerar efter flytt av URL-parser.

---

## 5. Tester att köra efter ändringar

- `npm test` / relevanta vitest för `src/app/api/v0/chats` routes.
- `src/lib/own-engine/own-engine-v0-boundary.test.ts`.
- Manuell: skapa ny sajt från UI utan v0-nycklar.

---

## 6. Begränsningar

- Ändra inte **planfiler** i `.cursor/plans/` om inte uttryckligen ombedd.
- Behåll **SSE-kontrakt** (`builder-stream-contract`) — byt inte händelsenamn i samma PR som stor flytt om det går att undvika.

---

*Handoff skapad för own-engine-upprustning. Se även `llm-kedja-och-generationskvalitet.md` och `kontrakt-forenkling-och-integrationer.md` för parallellt arbete.*
