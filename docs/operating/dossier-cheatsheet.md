# Dossier cheatsheet

Snabbreferens för dossier-systemet (v2). Full spec: `docs/architecture/dossier-system.md`.

## Embeddings — finns det några?

**Nej.** Det nya dossier-systemet använder **inga embeddings alls**. Urvalet är deterministic:

- Brief-LLM:n deklarerar `requestedCapabilities: string[]` (t.ex. `["payments", "ai-chat"]`).
- `selectDossiersForRequest` matchar varje capability 1:1 mot en dossier i `data/dossiers/{hard|soft}/<id>/`.
- Tie-break: `defaultForCapability: true` vinner; annars id-sort.

Alla gamla embedding-filer ligger i `archive/dossiers-legacy-2026-04-20/index/dossier-embeddings.json` (gitignored, läses inte av runtime). Det finns inget skript att köra för att bygga embeddings.

OBS: scaffold-systemet (separat från dossiers) **använder fortfarande embeddings** för scaffold-pick. Den lever i `src/lib/gen/scaffolds/scaffold-embeddings.json` och regenereras med `npx tsx scripts/embeddings/generate-scaffold-embeddings.ts`. Den har inget med dossiers att göra.

## Toggle on/off

```
SAJTMASKIN_DOSSIER_PIPELINE=true   # på (default i development)
SAJTMASKIN_DOSSIER_PIPELINE=false  # av (default i production)
```

Sätt i `.env.local` lokalt eller via `vercel env add SAJTMASKIN_DOSSIER_PIPELINE` per miljö.

## Lägg till en ny dossier

### A. Hand-skriven (snabb om du vet vad du vill)

1. Skapa mapp `data/dossiers/<hard|soft>/<id>/`.
2. Skriv `manifest.json` (validera mot `docs/schemas/strict/dossier.schema.json`).
3. Skriv `instructions.md` med fem sektioner: When to use / How to integrate / UX rules / Avoid / Verification.
4. Lägg ev. komponentfiler under `<id>/components/`.
5. Backoffice → "Dossiers" → "Capability map" → "Bygg om" så `_index/capability-map.json` uppdateras.

### B. AI-kuration från ett klonat upstream-repo

Förutsättning: repo-mappen finns under `data/template-references/repos/<reference-id>/`.

```bash
npm run dossiers:curate -- \
  --reference=<reference-id> \
  --class=<hard|soft> \
  --id=<dossier-id>
```

Exempel:

```bash
# Stripe
npm run dossiers:curate -- --reference=payments-simple-online-store-with-stripe --class=hard --id=stripe-store

# Clerk
npm run dossiers:curate -- --reference=auth-clerk-authentication-starter --class=hard --id=clerk

# Fal image generator
npm run dossiers:curate -- --reference=ai-fal-image-generator --class=hard --id=fal-image-gen
```

Skriptet:
1. Läser `README.md`, `package.json`, `.env.example`, ~6 source-filer från upstream-repo.
2. Skickar till GPT-4o-mini med structured output schema.
3. Skriver `manifest.json` + `instructions.md` till `data/dossiers/<class>/<id>/`.
4. Vägrar skriva över befintlig dossier (lägg till `--force` om det är meningen).

Kostnad: ~$0.01-0.05 per dossier. Tid: ~10-30 sek.

**Granska alltid utkastet** i backoffice (Dossiers-sidan → Redigera-tab) innan du litar på det. Dossier-id sätts till exakt vad du angav (`--id=`). `lastVerified` sätts till dagens datum men markera om efter manuell verifiering.

## Verifiera generering

Efter att du satt `SAJTMASKIN_DOSSIER_PIPELINE=true`, trigga en generering med en prompt som behöver en capability och kolla loggen:

```
[orchestrate] dossiers_selected { count: 1, byCapability: { payments: ["stripe-checkout"] } }
```

Om brief-LLM:n deklarerar en capability som ingen dossier täcker:

```
[orchestrate] dossier_capability_unresolved { requested: ["mailing-list"], resolved: [], unresolved: ["mailing-list"] }
```

→ Lägg till en dossier för den capability eller justera brief-prompten.

Om en hard-dossier saknar env-vars renderas `[UNCONFIGURED — render placeholder UI]` i system-promptens `## Available Dossiers`-block och codegen-LLM:n får instruktion att bygga en placeholder.

## Mappstruktur

```
data/
  dossiers/                              ← runtime
    hard/<id>/manifest.json + instructions.md + components/
    soft/<id>/manifest.json + instructions.md + components/
    _index/capability-map.json           ← genererad översikt
  template-references/                   ← input till AI-kuration (gitignored)
    repos/<reference-id>/
    _metadata/<reference-id>.github.json

archive/dossiers-legacy-2026-04-20/      ← gamla pipen, gitignored, läses inte
```

## Vanliga filändringar

| Vad | Var |
|---|---|
| Lägg till capability LLM kan deklarera | `src/lib/builder/site-brief-generation.ts` (BRIEF_SYSTEM_PROMPT) |
| Ändra urvalsalgoritm | `src/lib/gen/dossiers/select.ts` |
| Ändra hur dossiers renderas i prompten | `src/lib/gen/system-prompt.ts` (rad ~770-895) |
| Ändra schema | `docs/schemas/strict/dossier.schema.json` + `src/lib/gen/dossiers/types.ts` |
| Backoffice-UI | `backoffice/pages/dossiers.py` |

## När arkivet kan raderas

`archive/dossiers-legacy-2026-04-20/` är säkert att radera när:

1. v2-pipen kört utan dossier-relaterade fel i development i 1-2 veckor.
2. Du inte längre planerar att kurera in fler från arkivet med `npm run dossiers:curate`.

`data/template-references/repos/` kan behållas oavsett — den används bara av AI-kuration on demand.
