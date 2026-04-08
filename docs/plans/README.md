# Plans

**Katalogsystem:** **`active/`** = filer som styr arbete nu · **`avklarat/`** = avklarat eller historiskt. Utkast under `active/` flyttas till `avklarat/` eller rensas när de är klara (eller litar du på git-historik).

**Länkar:** [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md) · [`avklarat/README.md`](./avklarat/README.md).

## Aktiva filer (`active/`)

Löpande ska **primärt** dessa ligga här:

- [`PROJECT-STATE-AND-DIRECTION.md`](./active/PROJECT-STATE-AND-DIRECTION.md) — kort kanonisk aktiv status med öppna spår, beslut och pekare vidare.
- [`step4-quality-hotspots-and-verification.md`](./active/step4-quality-hotspots-and-verification.md) — aktiv Steg 4-plan/leverans: rangordnade hotspots, verifieringsplan och doc-sync-ankare.

Nya tillfälliga planer skapas under **`docs/plans/active/`** och flyttas till **`avklarat/`** när spåret är avslutat. **Använd git-trackade filer här** i stället för Cursor-interna planfiler utanför repot — en sanning för teamet och CI. För den avslutade 5-stegsgenomgången finns en kort slutöversikt i repo-roten: `5-steg.txt`.

## Arkiv (`avklarat/`)

- [`README.md`](./avklarat/README.md) — kort historiktabell och pekare. Om äldre planfiler saknas i trädet, använd git-historik i stället för att återskapa brutna länkar här.
