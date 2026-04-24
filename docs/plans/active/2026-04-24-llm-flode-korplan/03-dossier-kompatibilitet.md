---
status: active
created: 2026-04-24
spår: 3 av 5 (LLM-flöde-körplan)
prio: P4 (preventiv kvalitet, blir viktigare när dossier-poolen växer)
estimat: 2–3 dagar
---

# Spår 3 — Dossier-kompatibilitet (säkerställ att alla 17 dossiers fungerar med alla scaffolds)

## Symtom (observerat)

I körning `eb152443-...`:

- Dossier `three-fiber-canvas` (soft, capability `visual-3d`) injicerade `components/three-canvas-shell.tsx` i prompten.
- LLM:en regenererade shellen, men introducerade `import { CanvasErrorBoundary } from "@/components/canvas-error-boundary"` — en fil som varken finns i scaffold-fröet (`src/lib/gen/scaffolds/landing-page/files/`) eller i dossierns `manifest.json:files[]`.
- `cross-file-import-checker` auto-stubbade en tom `components/canvas-error-boundary.tsx` med 7 rader (skyddsnät).
- Resultat: byggde, men med en tom error-boundary istället för riktig implementation.

## Rotorsak

Två oberoende svagheter:

### A. Manifest-validatorn kollar inte import-stängning

`src/lib/gen/dossiers/validate-manifest.ts` rad 59-93 gör **endast** AJV-validering + `id` vs katalog-namn-match. Ingen grep:ning av komponentkoden efter `import`-statements.

Konsekvens: en dossier kan deklarera `files: ["components/foo.tsx"]` där `foo.tsx` importerar `@/components/bar`, men om `bar.tsx` inte finns i `files[]` (eller scaffold-fröet) går det inte fångas vid manifest-validering — bara vid runtime när LLM:en regenererar shellen och cross-file-checker kickar in.

### B. Inget compat-test mellan dossier × scaffold

Det finns scaffold-validation (`src/lib/gen/scaffolds/scaffold-manifest-validation.test.ts`, körs via `npm run scaffolds:validate` i `package.json` rad 63), men **inget motsvarande för dossier × scaffold-kombinationer**.

Konsekvens: en ny dossier kan släppas utan att verifieras mot alla 9 scaffolds. Konflikter (t.ex. dossier förutsätter en komponent som scaffolden inte har) syns först i produktion.

### C. Dossier-instruktioner är för svaga om "behåll exportform"

`src/lib/gen/system-prompt/sections/dossiers.ts` rad 80-91 (`renderDossierBlocks`) instruerar inte LLM:en att **behålla samma exportform** som referensen. Resultat: LLM tappar `default export`, byter `export function` → `const X =`, eller refaktorerar bort hjälpfiler.

### D. `cross-file-import-checker` används som primär lösning, inte skyddsnät

Verifierat i `src/lib/providers/own-engine/generation-stream-post-finalize.ts` rad 218-261: stub-skapande loggas som `warning` med `category: "merge:cross-file-stub"` i `engine_version_error_logs`. Bra! Men `meta`-fältet inkluderar inte `dossierId`/`capability`, så vi kan inte aggregera per dossier i telemetri.

## Inventering — finns problemet i flera dossiers?

Audit-agenten gick igenom alla 17 manifest under `data/dossiers/{hard,soft}/`:

| Dossier | `@/`-imports utanför `files[]`? |
|---|---|
| 8 hard (clerk-auth, mailchimp-newsletter, openai-chat, plausible-analytics, resend-contact-form, sentry-error-tracking, stripe-checkout, vercel-analytics) | Inga |
| 9 soft (cmdk, embla, faq, marquee, pricing, scroll-parallax, testimonials, three-fiber-canvas) | Inga (alla nuvarande shells är "korrekt slutna") |
| `pointer-parallax` | Importerar `@/components/use-pointer-parallax` — finns i `files[]` ✓ |

**Slutsats:** Aktuella dossiers är korrekt slutna **on-disk**. Felet i `eb152443`-körningen var **LLM-regenerering** som introducerade en *ny* import som inte fanns i originalet. Skyddet behövs ändå för:

1. Framtida dossiers som skrivs av människor (lätt att glömma transitiv import).
2. LLM-regenererings-fall där modellen "förbättrar" shellen och introducerar nya beroenden.

## Föreslagna fixar

### Fix A — Manifest-validator import-closure

**A1. Ny validator-funktion** i `src/lib/gen/dossiers/validate-manifest.ts` (eller ny fil bredvid):

```ts
export function validateDossierImportClosure(
  manifest: DossierManifest,
  scaffoldFileSet: Set<string>,
): ValidationResult {
  // För varje fil i manifest.files med .ts/.tsx/.jsx/.js:
  //   - Parsa import-deklarationer
  //   - För varje '@/'-import (eller relativ): kontrollera om mål finns i:
  //     a) manifest.files (efter normalisering)
  //     b) scaffoldFileSet (för aktuell scaffold)
  //     c) isRuntimeProvidedImport() (next/react/lucide etc)
  //   - Om inget av ovan: warning eller error
}
```

Använd samma `normalizeToProjectPath`-logik som `cross-file-import-checker` (rad 26-38).

**A2. Anrop från CI-script:** `scripts/dossiers/validate-all.ts` rad 4-12 lägger till `validateDossierImportClosure(manifest, scaffoldFiles)` per (manifest × scaffold)-par.

**A3. Acceptable runtime-imports allowlist:** tas från `src/lib/gen/autofix/runtime-imports.ts` (`isRuntimeProvidedImport`).

### Fix B — Compat-matrix integrationstest

**Ny fil:** `src/lib/gen/dossiers/dossier-scaffold-compat.integration.test.ts`

**Skelett:**

```ts
describe("dossier × scaffold compat matrix", () => {
  for (const scaffold of SCAFFOLDS) {
    for (const dossier of DOSSIERS) {
      it(`${scaffold.id} + ${dossier.id} compiles`, async () => {
        const files = mergeScaffoldSeed(scaffold) + materializeDossierFiles(dossier);
        await writeMiniProject(tmp, files, minimalNextStub);
        expect(execSync(`npx tsc -p ${tmp}/tsconfig.json --noEmit`, { cwd: tmp }).status).toBe(0);
      });
    }
  }
});
```

**Nytt npm-script:** `package.json`:

```json
"dossiers:compat": "vitest run src/lib/gen/dossiers/dossier-scaffold-compat.integration.test.ts"
```

**Risker:**
- 9 scaffolds × 17 dossiers = 153 kombinationer × ~10 s/test = 25 min. **För långt för CI per-PR.** Kör som nattlig job eller pre-release-gate.
- Kräver `os.tmpdir()` workspace + `npm install` cache. Förbered med `--pool=forks`.

### Fix C — Snapshot-test per dossier

**Ny fil:** `src/lib/gen/dossiers/dossier-finalize-snapshot.test.ts` (parameteriserad, inte per-id):

```ts
describe.each(DOSSIER_IDS)("dossier finalize snapshot — %s", (dossierId) => {
  it("merge + cross-file checker leaves no stubs when shell matches dossier files", async () => {
    const dossier = getDossierEntry("soft", dossierId);
    const llmFiles = [
      { path: "components/<shell>.tsx", content: dossierShellSource, language: "tsx" },
    ];
    const merged = mergeGeneratedProjectFiles({
      chatId: "test",
      originalFilesJson: "{}",
      generatedFiles: llmFiles,
      resolvedScaffold: landingPageManifest,
    });
    expect(merged.crossFileStubs).toEqual([]);
  });
});
```

Säkerställer att om LLM returnerar exakt dossier-shellen som den är, ska inga auto-stubs skapas. Snabbt (per-test < 1 s).

### Fix D — Förstärk dossier-instruktioner

`src/lib/gen/system-prompt/sections/dossiers.ts`:

**D1. Efter rad ~145-150 (verbatim-intro):** För filer med `codeFidelity: "rewritable"` som *inte* listas under "Dossier Files To Emit Verbatim", lägg en hård rad:

> "All `import ... from "@/..."` in your generated code MUST point to files that either (a) already exist in the project context, or (b) are included in your `## File:`-output. Do NOT introduce new `@/components/...` imports without emitting the corresponding file."

**D2. I "Selected Dossier Instructions"-inledningen (rad ~85):** Utöka "do not paste blindly":

> "Preserve the same export form as the reference (named `export function X` vs `default export`). Do NOT refactor helper modules — if the reference has them inline, keep them inline; if separate, emit them separately."

### Fix E — Telemetri-utökning

`src/lib/providers/own-engine/generation-stream-post-finalize.ts` rad 235-240, utöka `meta`-fältet i cross-file-stub-loggen med:

```ts
meta: {
  sourceFile,
  missingImport,
  stubFile,
  dossierId: matchingDossierId ?? null,        // NY
  capability: matchingCapability ?? null,      // NY
}
```

Kräver att `requestedDossierCapabilities` (eller vald dossier-lista) finns i scope. Kontrollera om det redan trådas in.

### Fix F — Test som verifierar telemetri

I `src/lib/providers/own-engine/generation-stream-post-finalize.test.ts` rad 433+ (befintligt test "emits warning-level diagnostic row per cross-file-import-checker stub"):
- Lägg `expect(warning.meta.dossierId).toBe("three-fiber-canvas")` när stub är från en dossier-fil.

## Acceptanskriterier

- [ ] `validateDossierImportClosure` finns och anropas i `validate-all.ts`.
- [ ] CI-job `dossiers:compat` finns (även om körs nattligt, inte per-PR).
- [ ] Snapshot-test per dossier passerar för alla 17.
- [ ] `dossier-stub-created`-events har `dossierId` + `capability`.
- [ ] Manuell verifiering: skapa ny dossier med "broken import" → manifest-validatorn ska faila INNAN den når runtime.

## Risker

- **CI-tid:** 153 kombinationer × tsc är dyrt. Måste backas av cache + parallell execution.
- **Snapshot-tester kan bli sköra:** om dossier-shell uppdateras måste snapshot regenereras.

## Filer att läsa innan implementation

- `src/lib/gen/dossiers/validate-manifest.ts` (hela)
- `src/lib/gen/dossiers/registry.ts` (rad 1-100)
- `data/dossiers/soft/three-fiber-canvas/manifest.json` + `components/three-canvas-shell.tsx` (referens)
- `src/lib/gen/system-prompt/sections/dossiers.ts` (rad 60-230)
- `src/lib/gen/autofix/rules/cross-file-import-checker.ts` (rad 156-321)
- `src/lib/gen/stream/finalize-merge.ts` (rad 1-80 — `crossFileStubs`-interface)
- `src/lib/providers/own-engine/generation-stream-post-finalize.ts` (rad 218-261)
- `scripts/dossiers/validate-all.ts`
- `package.json` (rad 60-65 för script-namn-konvention)

## Källa

Audit-agent #3 (claude-4.6-sonnet-medium-thinking) 2026-04-24, prompt fokus: dossier-kompatibilitet + auto-test.
