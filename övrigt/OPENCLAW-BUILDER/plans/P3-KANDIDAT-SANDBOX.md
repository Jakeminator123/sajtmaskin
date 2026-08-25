# P3 — kandidat i sandbox

## Mål

Låta agenten skapa en komplett kodkandidat utan att kunna persistera eller
ändra officiell preview.

## Leveranser

- efemär sandbox per jobb
- rootless executor utan plattformshemligheter
- kandidat-overlay hydratiserad från exakt base
- `candidate.apply_patch`, `candidate.replace_files`, `project.diff`
- syntax/typecheck/check receipts
- idempotent `candidate.submit` till en icke-persistad artifactyta
- cleanup och retention

## Arbetssteg

1. Hydrera base snapshot och verifiera filhashar.
2. Ge agenten write endast i overlay.
3. Validera paths, filstorlek, total diff och secret patterns per operation.
4. Kör checkar i separat executor.
5. Skapa komplett snapshot och hash.
6. Submit med base revision, lineage och idempotency key.
7. Jämför offline mot classic; skapa ännu ingen användarversion.

## Acceptans

- inga writes utanför sandbox
- stale/cancelled/expired jobb kan inte submit
- retry skapar samma artifact, inte en kopia
- dependency scripts kan inte läsa controllersecrets eller nå fri internet
- cleanup lämnar ingen nästa-jobb-läsbar projektrest

## Stoppskäl

- agenten behöver direkt shell i credentialbärande service
- overlay kan påverka live preview
- paketinstallation saknar isolering
- candidate snapshot saknar deterministisk hash
