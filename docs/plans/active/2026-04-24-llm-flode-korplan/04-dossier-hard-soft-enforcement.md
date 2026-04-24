---
status: active
created: 2026-04-24
spår: 4 av 7 (LLM-flöde-körplan, REVIDERAD efter deep-prefab feedback + verifiering)
prio: P4 (preventiv kvalitet — viktigare ju fler dossiers vi lägger till)
estimat: 2–3 dagar
---

# Spår 4 — Dossier hard/soft kontrakt-enforcement

## Bakgrund

Tidigare plan 03 fokuserade på manifest-validering. Deep-prefab-agent och en verifieringsagent visade att den **verkliga** bristen är djupare:

> "För hard/soft dossiers behöver reglerna vara tydligare: hard dossiers ska materialiseras exakt och importeras, inte återuppfinnas."

**Verifieringen visade:**

1. Schema (`docs/schemas/strict/dossier.schema.json` L37-40) tillåter bara `verbatim` och `rewritable` (inte `frozen`/`instructions-only`).
2. **Hard-klass ≠ alltid verbatim**: `mailchimp-newsletter`, `openai-chat`, `resend-contact-form` har dossier-nivå `rewritable` (med per-fil `verbatim` för API-routes).
3. **`mergeVersionFilesWithWarnings` (`src/lib/gen/version-manager.ts` rad 227-294) har INGEN dossier-/verbatim-policy.** LLM vinner alltid i merge.
4. `cross-file-import-checker` skapar **tomma stubs** även för dossier-exposed paths.
5. För `eb152443`: `CanvasErrorBoundary` blev en tom stub (`return null`). Acceptabelt för error-boundary, men **om samma logik träffat Stripe/Clerk är det säkerhetshål**.

## Konkret riskmatris (verifierad)

| Dossier | codeFidelity (manifest) | Per-fil verbatim? | Risk om LLM skriver om |
|---|---|---|---|
| `clerk-auth` | verbatim | `clerk-provider-shell.tsx`, `middleware.ts` | **HÖG** — auth-bypass |
| `stripe-checkout` | verbatim | `api/checkout-session/route.ts` | **HÖG** — payment-bypass |
| `sentry-error-tracking` | verbatim | Alla 4 filer | **MEDIUM** — error-tracking inkonsekvent |
| `mailchimp-newsletter` | rewritable | `api/newsletter-subscribe/route.ts` | Medium — fake form |
| `openai-chat` | rewritable | `api/chat/route.ts` | Medium — broken API |
| `resend-contact-form` | rewritable | `api/contact/route.ts` | Medium — emails går aldrig |
| `plausible-analytics` | verbatim | Hela | Låg — analytics saknas |
| `vercel-analytics` | verbatim | Hela | Låg — analytics saknas |
| 9 soft (cmdk, embla, faq, marquee, parallax×2, pricing, testimonials, three-fiber) | rewritable | Inga | Låg — UI-kosmetik |

**Inga tester verifierar att verbatim-filer skyddas.** `src/lib/gen/dossiers/system-prompt-integration.test.ts` testar bara att verbatim-block **renderas i prompten**, inte att LLM faktiskt **håller sig till** dem.

## Två oberoende risker att hantera

### Risk 1: LLM kan korrumpera verbatim-fil

Modellen skriver `## File: components/clerk-provider-shell.tsx` med felaktig kod → `mergeVersionFilesWithWarnings` skriver över originalet utan att jämföra mot dossier-källan.

### Risk 2: Tom stub för dossier-exposed komponent

`cross-file-import-checker` (`src/lib/gen/autofix/rules/cross-file-import-checker.ts` rad 156-174) skapar:

| Komponent-mönster | Stub-innehåll |
|---|---|
| `Provider`/`Context` | Returnerar `children` |
| `useX` (hook) | Returnerar `{}` (tomma objekt) |
| Lowercase-funktion | Returnerar `null` |
| Övrig PascalCase | Returnerar `null` |

Om `<ClerkProvider>` saknas i LLM-output blir den en stub som returnerar `children` utan auth → tyst auth-bypass.

## Föreslagen fix

### Fix A — Verbatim-enforcement i merge

**A1.** I `src/lib/gen/version-manager.ts` `mergeVersionFilesWithWarnings` (rad 227-294), efter shrink/structural-guards, lägg till en dossier-policy:

```ts
import { getActiveDossiers, getDossierFileContent } from "@/lib/gen/dossiers/registry";

function applyDossierVerbatimPolicy(
  llmFiles: CodeFile[],
  selectedDossiers: DossierEntry[],
): { files: CodeFile[]; restored: Array<{ path: string; dossierId: string; reason: string }> } {
  const restored: Array<{...}> = [];
  for (const dossier of selectedDossiers) {
    for (const file of dossier.files) {
      if (file.injectionMode !== "verbatim") continue;
      const llmFile = llmFiles.find(f => f.path === file.path);
      if (llmFile) {
        const canonical = getDossierFileContent(dossier.class, dossier.id, file.path);
        if (llmFile.content !== canonical) {
          // LLM modifierade en verbatim-fil — återställ
          llmFile.content = canonical;
          restored.push({
            path: file.path,
            dossierId: dossier.id,
            reason: "verbatim_content_drift",
          });
        }
      }
    }
  }
  return { files: llmFiles, restored };
}
```

Anropas från `mergeVersionFilesWithWarnings` innan persistens. `restored`-listan loggas som warning-event `dossier_verbatim_restored`.

**A2.** Telemetri-event:
```ts
devLogAppend("in-progress", {
  type: "dossier_verbatim_restored",
  count: restored.length,
  files: restored.map(r => `${r.dossierId}:${r.path}`),
  reason: "verbatim_content_drift",
});
```

### Fix B — Stoppa LLM från att stubba dossier-exposed komponenter

**B1.** I `src/lib/gen/autofix/rules/cross-file-import-checker.ts` rad 156+, lägg till en check innan `createStubFile`:

```ts
import { getDossierExposesByImportPath } from "@/lib/gen/dossiers/registry";

function shouldRefuseStub(missingImportPath: string): { refuse: boolean; reason?: string } {
  const dossierMatch = getDossierExposesByImportPath(missingImportPath);
  if (dossierMatch) {
    return {
      refuse: true,
      reason: `dossier_exposed_path:${dossierMatch.dossierId}`,
    };
  }
  return { refuse: false };
}
```

Om en saknad import matchar en dossiers `exposes`-path:
- **Kasta inte stub** — tomt skydd är värre än tydligt fel.
- Logga `dossier_stub_refused`-event.
- Lägg `previewBlocked: true` med `previewBlockingReason: "dossier_export_missing:<dossierId>"`.

**Risk:** detta gör previewBlock striktare. Måste vara opt-in via flagga första veckan (`SAJTMASKIN_REFUSE_DOSSIER_STUBS=1`).

### Fix C — Manifest-validator import-closure (från gamla planen 03)

Behålls från gamla planen — dossier-import-closure-validering vid CI:

**C1.** Ny export i `src/lib/gen/dossiers/validate-manifest.ts`:
```ts
export function validateDossierImportClosure(
  manifest: DossierManifest,
  scaffoldFileSet: Set<string>,
): ValidationResult;
```

**C2.** Anrop från `scripts/dossiers/validate-all.ts` rad 4-12.

**C3.** Acceptable runtime-imports från `src/lib/gen/autofix/runtime-imports.ts` (`isRuntimeProvidedImport`).

### Fix D — Förstärk dossier-instruktioner i prompten

**D1.** `src/lib/gen/system-prompt/sections/dossiers.ts` rad 80-91 (`renderDossierBlocks`):

För **`verbatim`-dossier-filer**, lägg till hård rad:
> "Files marked **VERBATIM** below MUST be emitted exactly as shown. Any modification will be silently restored to the canonical version. If you need to ADAPT behavior, use a separate file or wrap the verbatim component."

För **`rewritable`-dossier-filer**, lägg till:
> "You MAY adapt these files, but you MUST preserve all `export` statements (named + default) listed in the dossier's `exposes`. Failure to export an exposed name will refuse the build (no auto-stub fallback)."

### Fix E — Snapshot-test per dossier (från gamla planen 03)

**E1.** Ny fil: `src/lib/gen/dossiers/dossier-finalize-snapshot.test.ts`
```ts
describe.each(DOSSIER_IDS)("dossier finalize snapshot — %s", (dossierId) => {
  it("LLM-output matching dossier shell triggers no auto-stub", async () => {
    // ...
  });
  
  it("LLM-output rewriting verbatim file is restored to canonical", async () => {
    // Test fix A
  });
  
  it("LLM-output missing exposed export triggers refuse, not stub", async () => {
    // Test fix B
  });
});
```

### Fix F — Compat-matrix CI (från gamla planen 03, oförändrad)

153 (scaffold × dossier)-kombinationer × `tsc --noEmit`. Nattlig, inte per-PR. Behålls i nya planen.

## Acceptanskriterier

- [ ] Verbatim-content-drift återställs i merge + loggas som `dossier_verbatim_restored`.
- [ ] `cross-file-import-checker` refuserar stub för dossier-exposed paths (bakom flagga).
- [ ] Manifest-validator har import-closure-check.
- [ ] Snapshot-test per dossier passerar för alla 17.
- [ ] Compat-matrix-CI nattlig.
- [ ] Manuell verifiering: simulera LLM-output som ändrar `clerk-provider-shell.tsx` → ska återställas.
- [ ] Manuell verifiering: simulera LLM-output utan `<CanvasErrorBoundary>` med refuse-flag aktiverat → previewBlocked, inte stub.

## Risker

- **A (verbatim restore)** — LLM kan ha haft *bra* skäl att modifiera (env-värden, conditional logic). Bara verbatim-filer ska restoras, inte rewritable. Testa noggrant.
- **B (refuse stub)** — striktare gate. Bakom flagga första veckan, mäta `dossier_stub_refused`-frekvens innan default.
- **F (compat-matrix)** — 153 × ~10s = 25 min CI. Per-PR är för långt. Nattlig + pre-release.

## Filer att läsa innan implementation

- `src/lib/gen/version-manager.ts` (rad 220-300 — `mergeVersionFilesWithWarnings`)
- `src/lib/gen/dossiers/registry.ts` (`getDossierFileContent`, `getActiveDossiers`)
- `src/lib/gen/dossiers/validate-manifest.ts` (rad 1-100)
- `src/lib/gen/dossiers/system-prompt-integration.test.ts` (rad 121-186 för befintliga test-mönster)
- `src/lib/gen/system-prompt/sections/dossiers.ts` (rad 60-230)
- `src/lib/gen/autofix/rules/cross-file-import-checker.ts` (rad 156-321)
- `src/lib/gen/stream/finalize-merge.ts` (rad 1-80 — `crossFileStubs`-interface)
- `data/dossiers/hard/clerk-auth/manifest.json` (referens för verbatim per-fil)
- `docs/schemas/strict/dossier.schema.json` (rad 37-40 + 95-98 — codeFidelity-enum)
- `scripts/dossiers/validate-all.ts`

## Källor

- Audit-agent #3 (claude-4.6-sonnet-medium-thinking) 2026-04-24, första pass — manifest-fokus
- Audit-agent V4 (claude-4.6-sonnet-medium-thinking) 2026-04-24, verifiering — visade att merge saknar enforcement
- Deep-prefab-agentens svar i `svar_gpt`: "Hard dossiers ska materialiseras exakt och importeras, inte återuppfinnas"
