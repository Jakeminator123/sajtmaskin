# Du är plan-06-agenten — Deep Brief + follow-up som delta-operation + capability-classifier

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-06-deep-brief-delta` i Sajtmaskin-repot. Du arbetar **parallellt** med plan-07-agenten i wave 3. Ni rör inte varandras filer (se hårda begränsningar nedan). När du är klar öppnar du PR mot `master`.

## Repo-state du ärver

- HEAD: `master @ <senaste wave-2-merge>` (efter plan 03 + plan 05 mergade)
- Plan 02 (modal-truth + cross-file-stub-warning) är mergad. Du kan lita på att modalen är ärlig.
- Plan 03 (auto-repair labeling) är mergad. `promptOrchestration.ts` har troligen fått ett `source: "user" | "auto_repair"`-fält eller liknande discriminator. Använd den.
- Plan 04 (fixer-matrix) + plan 05 (single fixer entrypoint + lane-tag) är mergade.
- **Läs `STATUS-DOSSIER-CONFUSION-AUDIT.md`** — den dokumenterar var dossier-systemet står (18 dossiers, capability-driven, healthy) och var den verkliga buggen sitter (capability-classifier fyller inte `requestedCapabilities` på follow-ups).

## Den centrala insikten (din input)

Plan 01 smoke run 2 ("Skapa en 3d-kaffekopp som hoovrar och flyger ovanför"):
- `baseVersionId: c7bad76a` bevarades korrekt — delta-semantik finns redan i basen ✅
- `followUpIntent: neutral` — classifier flaggade INTE detta som `capability-add`
- `requestedCapabilities` förblev tom → `selectDossiersForRequest` fick noll → `three-fiber-canvas`-dossiern injicerades aldrig
- LLM:n improviserade ett tomt `coffee-cup-3d.tsx`-skal istället

Det är **inte ett dossier-bug**. Det är en **fas 1-bug** där brief / capability-classifier inte detekterar capability-signaler i follow-up-text.

## Användarens spectrum-modell (viktig design-input)

Capability-detection är inte binär — det är en **3-stegs spectrum**:

| Specifitet | Beslut | Exempel |
|---|---|---|
| **Generisk capability** | Använd dossier verbatim | "lägg till en 3D-grej" → `three-fiber-canvas` shell |
| **Specifik beteende på capability** | Dossier som bas + LLM-generering ovanpå | "3D-canvas där man målar, animation skiftar nyanser medan man målar" → `three-fiber-canvas` shell + custom scen-fil |
| **Helt utanför dossier-range** | Fullt LLM-custom (ingen dossier) | "physics-simulation av studsande tomater" |

Plan 06:s jobb är att få **detection + routing** rätt. Plan 07:s jobb är att få **3D-specifika capability-paths** rätt.

## Planens mål

1. **Capability-detection på follow-ups** — extrahera `requestedCapabilities` från follow-up-text, inte bara init-prompts.
   - Använd capability-map-vokabulären från `data/dossiers/_index/capability-map.json` (16 capabilities) som grund.
   - Lägg till svenska + engelska heuristics (t.ex. "3d", "3D", "tre dimensioner", "interaktiv canvas" → `visual-3d`; "betalning", "stripe", "checkout" → `payments`; "kontaktform", "skicka mail" → `contact-form`).
   - Returnera **både capability-id OCH specifitets-tier** (`generic | specific | beyond-dossier`).

2. **`followUpIntent` rätt-klassad:** följ-up med capability-signal ska bli `capability-add` (eller motsvarande), INTE `neutral`.

3. **`selectDossiersForRequest` honoreras på follow-ups** — när `capability-add` triggas och tier är `generic` eller `specific`, dossiern injiceras i den synthetic follow-up-prompten (capability-refresh).

4. **Deep Brief smal-kontrakt** — bekräfta i kod/doc att Deep Brief inte glider tillbaka till "nästan init":
   - Återanvänd scaffold/variant från `baseVersionId` som default
   - capability-refresh ENDAST när ny signal är stark (= tier `specific` eller `beyond-dossier` med tydlig keyword)
   - Inga capability-removes i follow-up — capabilities adderas, raderas inte (om inte uttryckligen "ta bort 3D")

5. **Regressionstester:**
   - Test: follow-up "lägg till en kontaktform" → `contact-form` capability detekteras → `resend-contact-form` dossier injiceras → `package.json` får `resend`-dep
   - Test: follow-up "Skapa en 3d-kaffekopp som hoovrar" → `visual-3d` capability detekteras → tier `generic` → `three-fiber-canvas` dossier injiceras → `package.json` får three/fiber-deps
   - Test: follow-up "ändra färgen på knappen" → ingen capability detekterad → `followup_general`, INGEN dossier-injection
   - Test: follow-up "lägg till physics-simulation av studsande tomater" → `visual-3d` capability + tier `beyond-dossier` → dossier injiceras MEN med signal till LLM "use as base, then write custom scene"

## Hårda begränsningar

- Rör INTE plan-07-filer: `data/dossiers/`, `src/lib/gen/dossiers/**`, **specifikt 3D-injection-orchestration** (3D-specifika fall som package.json-mutation, capability-pack-injektion etc — det är plan 07).
- Rör INTE plan 02/03/04/05-filer som de just landat i. Speciellt `src/lib/gen/autofix/**` (plan 04/05), `src/lib/builder/promptOrchestration.ts` discriminator-tillägg (plan 03 — du **får** läsa, inte ändra).
- **Inget dossier-system-bygge.** Använd `selectDossiersForRequest` som det är. Plan 06 är fas 1 (intent + brief + delta), inte dossier-internals.
- Maxbudget: ~12 filer rörda.

## Acceptans

- Capability-detection fungerar på follow-up-text (svenska + engelska).
- `selectDossiersForRequest` får `requestedCapabilities` från follow-ups, inte tom array.
- Specifitets-tier finns på `DossierSelectionResult` (eller motsvarande struktur) — så plan 07 vet om den ska generera custom scen ovanpå dossier-shell.
- Deep Brief klassningar är dokumenterade i kod/doc — vad får den göra, vad får den inte göra.
- 4 regressionstester finns och passerar.

## Var du börjar leta

- `src/lib/builder/promptOrchestration.ts` — `detectPromptType`, `looksTechnicalMessage`. Här lever capability-detection om någonstans.
- `src/lib/builder/server-auto-brief-policy.ts` + `server-auto-brief-policy.test.ts` — när server-auto-brief körs (skippar follow-ups idag enligt rad 22).
- `src/lib/gen/dossiers/select.ts` — `selectDossiersForRequest`, läser `requestedCapabilities`.
- `src/lib/gen/build-spec/builder.ts` + `references.ts` — där brief och capabilities matas in.
- `src/lib/gen/orchestrate.ts` — orchestration-koordinatorn.
- `src/lib/gen/dossiers/types.ts` — `DossierSelectionResult` typ-definition.
- `data/dossiers/_index/capability-map.json` — vokabulären (16 capabilities + dossier-id-mappning).

## Workflow

1. **Sätt en kort plan** (vilka filer + capability-detection-strategi) innan du kodar.
2. **Implementera capability-detection** först — ren funktion, lätt att testa.
3. **Wire upp den** i follow-up-flödet.
4. **Lägg till specifitets-tier** i return-typen.
5. **Skriv tester** (4 stycken enligt acceptans).
6. **Kör `npm run lint && npm run typecheck && npm run test:ci`** lokalt.
7. **Commit** i logiska steg med prefix `plan-06:`.
8. **Skriv `STATUS-06-deep-brief-and-delta.md`** med:
   - capability-detection-strategin (vilka heuristics, vilka keywords)
   - hur specifitets-tier räknas
   - före/efter-exempel på de 4 testfallen
   - bekräftelse att planen blev `short-medium`, inte `full`
9. **Push branchen** och **öppna PR mot master** med `gh pr create`. PR-titel: `plan 06 (short-medium): capability-detection on follow-ups + Deep Brief delta-contract`.

## Stoppregler

- Om capability-detection visar sig kräva LLM-anrop (för att språk-heuristics inte räcker): STOPPA, beskriv i STATUS-06 och föreslå att en LLM-classifier-pass läggs till i plan 11/12 istället.
- Om dossier-injection på follow-up kräver structural ändring i `selectDossiersForRequest`: STOPPA och beskriv. Det är plan 07-territorium om det kräver mer än "fyll requestedCapabilities".

## Klart =

PR är öppnad mot master, STATUS-06 är committad, branchen är pushad.
