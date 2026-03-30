# Plans

**Katalogsystem:** **`active/`** = filer som styr arbete nu · **`avklarat/`** = avklarat eller historiskt. Utkast under `active/` flyttas till `avklarat/` eller rensas när de är klara (eller litar du på git-historik).

**Länkar:** [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md) · [`avklarat/README.md`](./avklarat/README.md).

## Aktiva filer (`active/`)

Löpande ska bara dessa två planfiler ligga här:

- [`PROJECT-STATE-AND-DIRECTION.md`](./active/PROJECT-STATE-AND-DIRECTION.md) — kanonisk operativ backlog (K-rader, Plan 17, beslut).
- [`POST-EPIC-CLEANUP.md`](./active/POST-EPIC-CLEANUP.md) — tillfällig städlista efter preview/sandbox-epiken (hålls utanför PROJECT-STATE).

Nya tillfälliga planer skapas under **`docs/plans/active/`** och flyttas till **`avklarat/`** när spåret är avslutat.

## Arkiv (`avklarat/`)

- [`CONSOLIDATED-own-engine-platform-and-quality-v2.md`](./avklarat/CONSOLIDATED-own-engine-platform-and-quality-v2.md) — stor historisk roadmap (plattform + kvalitet); operativ sanning = PROJECT-STATE + arkitekturdocs.
- [`LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md`](./avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md) — Git-milstolpe + stängd review (Del B).
- [`README.md`](./avklarat/README.md) — kort historiktabell och pekare.
