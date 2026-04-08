# Template-library audit (spår 06)

## Scope

Källor:

- `övrigt/00-README-parallell-korning.md`
- `övrigt/06-template-library-audit.md`
- `5-steg.txt` (kontext)
- kod under `src/lib/gen/template-library/*`, `src/lib/gen/scaffolds/*`, `scripts/template-library/*`, `scripts/rebuild_artifacts.py`

## Plan för spår 06

1. Kartlägg faktisk dataresa: extern pipeline -> generated artifacts -> scaffold overlays -> runtimekonsumtion.
2. Bekräfta vad som inte längre sker i hot path.
3. Identifiera tysta drift-risker mellan artifacts.
4. Leverera ett litet, isolerat fix som gör mismatch tydligare.

## Nuläge (bekräftat i kod)

- Extern research kondenseras till generated artifacts:
  - `src/lib/gen/template-library/template-library.generated.json`
  - `src/lib/gen/template-library/template-library-embeddings.json`
  - `src/lib/gen/scaffolds/scaffold-research.generated.json`
- Aktiv own-engine prompt-injektion använder inte längre template-library-sökning direkt.
- Runtime använder scaffold overlays (`getScaffoldResearchOverrides`) där `referenceTemplates` förs in i scaffold-context.
- `scripts/template-library/validate-runtime-artifacts.ts` och testerna fångar flera mismatch-fel, men före denna ändring kunde runtime fortfarande läsa scaffold-research utan explicit fail på stale template-id i strict-läge.

## Dataflödeskarta (extern pipeline -> runtime/tooling)

1. Discovery in: `data/external-template-pipeline/raw-discovery/current/*`.
2. Kurering/kompilering: `scripts/template-library/build-template-library.ts`.
3. Outputs:
   - `src/lib/gen/template-library/template-library.generated.json` (kuraterad katalog)
   - `src/lib/gen/scaffolds/scaffold-research.generated.json` (scaffold-overrides med `referenceTemplates`)
   - `data/external-template-pipeline/reference-library/*` (dossiers/manifest för research)
4. Embeddings: `scripts/embeddings/generate-template-library-embeddings.ts` -> `src/lib/gen/template-library/template-library-embeddings.json`.
5. Runtimekonsumtion:
   - scaffold-registry läser `scaffold-research.generated.json` via `getScaffoldResearchOverrides`
   - systemprompt använder scaffoldens research-prioriteringar (inkl. template-referenser)
6. Tooling/validering:
   - `scripts/template-library/validate-runtime-artifacts.ts`
   - `src/lib/gen/template-library/search.ts` (lokal sök/tooling; ej aktiv prompt-hot-path)

## Runtime vs build vs research

- Runtime:
  - scaffold-registry + scaffold-research overrides
  - systempromptens scaffold research-prioriteringar
- Build/tooling:
  - template-library search/embeddings och validationskript
  - rebuild-pipeline och refresh-script
- Research:
  - `data/external-template-pipeline/*` dossiers/discovery (ingår inte direkt i generationens hot path)

## Bekräftat: vad som INTE längre sker

- Ingen direkt template-library-sökning i aktiv own-engine prompt-injektion.
- Runtime läser inte hela external dossiers direkt.
- `template-library` är inte ett separat “andra codegen-spår”; det är främst kuraterad referens + valideringsstöd.

## Runtime-beroenden vs falska beroenden

- Verkliga runtime-beroenden:
  - `src/lib/gen/scaffolds/scaffold-research.generated.json`
  - `src/lib/gen/template-library/template-library.generated.json` (för ID-validering och konsistenskontroller)
  - `src/lib/gen/scaffolds/registry.ts` + `src/lib/gen/system-prompt.ts`
- Build/tooling-beroenden (inte hot-path generation):
  - `scripts/template-library/build-template-library.ts`
  - `scripts/embeddings/generate-template-library-embeddings.ts`
  - `scripts/rebuild_artifacts.py`
  - `scripts/template-library/validate-runtime-artifacts.ts`
- Falska/övertolkade beroenden:
  - “Dossiers används direkt i runtime-generationen” -> falskt
  - “Template-library-search måste fungera för live-generering” -> falskt (men viktig för lokal kvalitet/tooling)

## Genomfört fix i detta pass

- `src/lib/gen/scaffolds/scaffold-research.ts` validerar nu i strict-läge att varje `referenceTemplates[].id` finns i template-library-katalogen.
- Vid mismatch kastas tydligt fel med exempel på saknade id:n.
- Valideringen hoppas över i rebuild-kontext för att inte bryta bootstrap/refresh-flöden där artifacts medvetet kan vara tomma temporärt.
- Ny testfil `src/lib/gen/scaffolds/scaffold-research.test.ts` verifierar både godkänd och felande referens-id-validering.
- `scripts/template-library/validate-runtime-artifacts.ts` har fått en explicit kontroll för id-alignment mellan:
  - `template-library.generated.json` (`entries[].id`)
  - `template-library-embeddings.json` (`embeddings[].id`)
  Scriptet ger nu hårt fel vid mismatch (saknade/orphan embeddings) i stället för tyst drift.
- `src/lib/gen/template-library/search.ts` failar nu också hårt i strict-läge när embeddings saknas eller har ID-mismatch mot katalogen (i stället för tyst fallback), vilket gör drift synlig även vid direkt sökning/tooling.

## Kvarstående risker / nästa steg

- `template-library` är fortsatt tung att förstå pga många artifacts och script-ingångar.
- Embeddings/catalog drift kan fortfarande förekomma utanför runtime-pathen; håll `template-library:validate-runtime` i CI eller release-gate.
- Om spår 05 landar större dead-tooling-rensning bör denna fil uppdateras med ny "canonical command path".
