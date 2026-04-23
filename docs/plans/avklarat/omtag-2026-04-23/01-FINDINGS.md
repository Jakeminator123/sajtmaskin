# OMTAG 01 — Embedding-diagnos findings

Branch: `omtag/01-embedding-diagnos`
Status: rotorsak identifierad, fix levererad (scripts + CI-gate). Runtime-staleness av `scaffold-embeddings.json` åtgärdad genom manuell regenerering 2026-04-23 (Jake).

---

## Orsak

`scaffold-embeddings.json` drev gradvis ur synk med scaffold-registret för att (a) ingen `npm`-skriptalias fanns, (b) ingen pre-build/CI-gate fångade out-of-sync, och (c) filen står i `.gitignore` men är samtidigt git-spårad — en subtil tvivelfälla där lokala kloner/CI utan fräsch regenerering kan arbeta mot stale vektorer utan tydlig varning. Scaffold-manifest (`description`, `tags`, `promptHints`, `files`) har ändrats i 10+ commits sedan `b0b1a11bf` utan att generatorn kördes; parity-testet (`scaffold-embeddings-parity.test.ts`) validerar bara ID-mängd, inte innehåll. Dossiers delar *inte* problemet — de använder deterministisk capability-matchning i `src/lib/gen/dossiers/select.ts` och har medvetet noll embeddings (kördokumentet 01's scope-text var föråldrad på den punkten).

## Bevis

1. **`.gitignore:87`** — `src/lib/gen/scaffolds/scaffold-embeddings.json` är gitignorerad men `git ls-files --error-unmatch` visar att den också är spårad. Samma dubbelstatus för `template-library-embeddings.json` (rad 89).
2. **Manuell regenerering 2026-04-23** (via `npx tsx scripts/embeddings/generate-scaffold-embeddings.ts`) gav diff = enbart `_meta.generated`-tidsstämpel → vektorerna var redan "rätt" för *nuvarande* manifest-text. Men senaste faktiska regenerering enligt git var `b0b1a11bf` (2026-04-xx), och sedan dess har `registry.ts`, `matcher.ts`, `scaffold-search.ts`, `scaffold-research.ts`, plus flera `manifest.ts`/`files/` ändrats — tur att inputtexten i `buildEmbeddingText()` (scaffold-embeddings-core.ts:27–51) inte råkade bero på någon av de ändrade fälten.
3. **`package.json`** (pre-change): `templates:embeddings` + `scaffolds:variant-embeddings` har skriptaliaser, men `scaffolds:embeddings` (bas-scaffolds) saknades. Utvecklaren måste minnas fullt CLI-anrop.
4. **`prebuild`** körde enbart `preflight:common` (systemprompt/lucide/unicode-regex) → ingen guard mot stale embeddings innan Next-build bundlar `require("./scaffold-embeddings.json")` in i server-bundlen.
5. **Parity-testet** (`scaffold-embeddings-parity.test.ts`) läser fil + registry och jämför ID-set. Det skyddar mot att scaffolds läggs till/tas bort utan regen, men *inte* mot att manifest-texten ändras (beskrivning, tags, prompt hints). Ett fält-ändring ger falska träffar i `searchScaffoldsWithDiagnostics` utan att något test faller.
6. **Dossiers**: `src/lib/gen/dossiers/select.ts:15` — "No embeddings. No fuzzy match." `orchestrate.ts:659–695` använder `selectDossiersForRequest({ requestedCapabilities })`. Inget generate-dossier-embeddings-script behövs.

## Fix — levererat i branch (< 1 h)

- `package.json`:
  - Nytt alias `scaffolds:embeddings` → `npx tsx scripts/embeddings/generate-scaffold-embeddings.ts`.
  - Nytt alias `scaffolds:embeddings:check` → `npx tsx scripts/embeddings/check-scaffold-embeddings.ts`.
  - `prebuild` kedjat med `scaffolds:embeddings:check` (efter `preflight:common`).
- `scripts/embeddings/check-scaffold-embeddings.ts`: läser `scaffold-embeddings.json`, jämför mot `getAllScaffolds()` (count + ID-set), exiterar 1 med återställningsinstruktion om out-of-sync eller saknad. Säker vid frånvaro av `OPENAI_API_KEY` (ingen API-kall).
- `src/lib/gen/scaffolds/scaffold-embeddings.json`: tidsstämpel uppdaterad via Jakes manuella regenerering (vektorer oförändrade).

## Fix — större, gate till fas 2

Skyddet mot *innehållsdrift* (manifest-fält ändras utan regen) kräver:

1. Utöka `ScaffoldEmbeddingsFile._meta` med `inputHash` — sha256 av `getScaffoldEmbeddingInputs()` (stabilt deterministiskt JSON-stringifier).
2. `check-scaffold-embeddings.ts` jämför färskt hash mot stored hash → fail om drift.
3. Uppdatera `generate-scaffold-embeddings.ts` så den skriver `inputHash`.
4. Första efterföljande körning måste regenerera filen en gång för att plantera hashen.
5. Ägare: kan läggas på slutet av 03-wave-split-heatspots (samma kod-området, liten diff) eller som egen 15-min PR efter 01 mergeas.

Rekommendation: låt det bli en egen ~30-min PR efter 01 — scope-säker, inga ägarkonflikter. Parity-testet uppdateras samtidigt att assert:a `inputHash` non-null.

## Acceptance criteria

- [x] `OMTAG/01-FINDINGS.md` ≤ 100 rader.
- [x] `npm run scaffolds:embeddings:check` grönt lokalt efter manuell regen.
- [x] `npx vitest run src/lib/gen/scaffolds src/lib/gen/dossiers` — inte sämre än master (se nedan).
- [x] `npm run typecheck` + `npm run lint` grönt.

Scope-noteringar: `package.json` + `scripts/embeddings/check-scaffold-embeddings.ts` ligger utanför `owner_files` i kördokumentet — men explicit begärt av Jake (a–d i uppdragsmejlet). `select.ts`-testets pre-existing fail är orelaterat till embedding-staleness och ska åtgärdas i separat PR (capability-driven selection klarar sig utan embeddings).
