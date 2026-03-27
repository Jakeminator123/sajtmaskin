# Research Area

**Arkitektur (ingång):** [`docs/architecture/README.md`](../docs/architecture/README.md).

Non-runtime inputs: primarily **`external-templates/`** (raw discovery + curated dossiers → prompt enrichment, inbäddningar, scaffolds). Product vocabulary: [`docs/architecture/repository-and-platform.md`](../docs/architecture/repository-and-platform.md) · djup: [arkiv `structure-and-terminology.md`](../docs/architecture/archive/pre-2026-03-consolidation/structure-and-terminology.md).

Runtime code should not depend directly on this tree. Committed artifacts under `src/lib/gen/` bridge research into runtime behavior.

## Plan 17 / WS-5 (policy)

- **Syfte:** extern rådata, mall-discovery-output och liknande — **inte** hårdkrav för `npm run dev` eller CI om filer saknas lokalt.
- **Placering:** håll material **utanför `src/`**; stora genererade JSON-filer ska vara **gitignorerade** eller hanteras via git-lfs / build-time generation om de växer över ~1 MB (kör ny repo-scan vid behov).
- **Backlog / Plan 17:** [`docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`](../docs/plans/active/PROJECT-STATE-AND-DIRECTION.md) §8
