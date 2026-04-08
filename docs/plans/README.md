# Plans

**Katalogsystem:** **`active/`** = filer som styr arbete nu · **`avklarat/`** = avklarat eller historiskt. Utkast under `active/` flyttas till `avklarat/` eller rensas när de är klara (eller litar du på git-historik).

**Länkar:** [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md) · [`avklarat/README.md`](./avklarat/README.md).

## Aktiva filer (`active/`)

Löpande ska **primärt** dessa ligga här:

- [`PROJECT-STATE-AND-DIRECTION.md`](./active/PROJECT-STATE-AND-DIRECTION.md) — kort kanonisk aktiv status med öppna spår, beslut och pekare vidare.
- [`step4-quality-hotspots-and-verification.md`](./active/step4-quality-hotspots-and-verification.md) — aktiv Steg 4-plan/leverans: rangordnade hotspots, verifieringsplan och doc-sync-ankare.

Nya tillfälliga planer skapas under **`docs/plans/active/`** och flyttas till **`avklarat/`** när spåret är avslutat. **Använd git-trackade filer här** i stället för Cursor-interna planfiler utanför repot — en sanning för teamet och CI.

## Arkiv (`avklarat/`)

- [`STORDSTAD-repo-kod-databas.md`](./avklarat/STORDSTAD-repo-kod-databas.md) — storstädning repo/kod/docs (arkiverad 2026-03-31); pass-logg + **Fas D** som kvarstående DB-checklista vid medveten datastäd.
- [`POST-EPIC-CLEANUP.md`](./avklarat/POST-EPIC-CLEANUP.md) — post preview/sandbox-städ (avslutad 2026-03-30); historik + doc-register över berörda filer.
- [`KORPLAN-preview-url-api.md`](./avklarat/KORPLAN-preview-url-api.md) — preview-URL API/SSE (fas A+B avslutad 2026-03-30).
- [`CONSOLIDATED-own-engine-platform-and-quality-v2.md`](./avklarat/CONSOLIDATED-own-engine-platform-and-quality-v2.md) — stor historisk roadmap (plattform + kvalitet); operativ sanning = PROJECT-STATE + arkitekturdocs.
- [`LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md`](./avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md) — Git-milstolpe + stängd review (Del B).
- [`README.md`](./avklarat/README.md) — kort historiktabell och pekare.
