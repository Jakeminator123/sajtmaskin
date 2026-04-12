# Plans

**Katalogsystem:** **`active/`** = filer som styr arbete nu · **`avklarat/`** = avklarat eller historiskt. Utkast under `active/` flyttas till `avklarat/` eller rensas när de är klara (eller litar du på git-historik).

**Länkar:** [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md) · [`avklarat/README.md`](./avklarat/README.md).

## Aktiva filer (`active/`)

Efter den avslutade 5-stegsgenomgången ar arbetet normalt smala uppfoljningspass.

Nuvarande orientering:

- **Samlad slutoversikt:** [`../../5-steg.txt`](../../5-steg.txt)
- **Steg 4-djupkarta:** [`../architecture/step4-post-generation.md`](../architecture/step4-post-generation.md)

### Component uplift (P14–P16) — ARKIVERAT

Sparet reverterades i restore `1f4e86956` — orsakade kvalitetsregression (generationer for lika, fler importfel, tunnare art direction). Planfiler flyttade till `archived/`.

- [`archived/component-uplift-overview.md`](archived/component-uplift-overview.md)
- [`archived/P14-capability-dep-injection.md`](archived/P14-capability-dep-injection.md)
- [`archived/P15-enhancement-packs.md`](archived/P15-enhancement-packs.md)
- [`archived/P16-missing-scaffold-shells.md`](archived/P16-missing-scaffold-shells.md)

När ett nytt riktigt arbetsspår startar:

- skapa en ny smal fil under **`docs/plans/active/`**
- håll bara sådant där som verkligen styr arbete nu
- flytta eller rensa filen när spåret är avslutat

**Använd git-trackade filer här** i stället för Cursor-interna planfiler utanför repot — en sanning för teamet och CI.

## Arkiv (`avklarat/`)

- [`README.md`](./avklarat/README.md) — kort historiktabell och pekare. Om äldre planfiler saknas i trädet, använd git-historik i stället för att återskapa brutna länkar här.
