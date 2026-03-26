# Research Area

Non-runtime inputs: primarily **`external-templates/`** (raw discovery + curated dossiers → prompt enrichment, inbäddningar, scaffolds). Product vocabulary: [`docs/architecture/structure-and-terminology.md`](../docs/architecture/structure-and-terminology.md).

Runtime code should not depend directly on this tree. Committed artifacts under `src/lib/gen/` bridge research into runtime behavior.

## Plan 17 / WS-5 (policy)

- **Syfte:** extern rådata, mall-discovery-output och liknande — **inte** hårdkrav för `npm run dev` eller CI om filer saknas lokalt.
- **Placering:** håll material **utanför `src/`**; stora genererade JSON-filer ska vara **gitignorerade** eller hanteras via git-lfs / build-time generation om de växer över ~1 MB (kör ny repo-scan vid behov).
- **Körplan:** [`docs/plans/active/SAJTMASKIN-EXECUTION-PLAN.md`](../docs/plans/active/SAJTMASKIN-EXECUTION-PLAN.md) §1.E
