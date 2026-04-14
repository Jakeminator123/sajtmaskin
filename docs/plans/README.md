# Plans

**Katalogsystem:** **`active/`** = filer som styr arbete nu · **`avklarat/`** = avklarat eller historiskt. Utkast under `active/` flyttas till `avklarat/` eller rensas när de är klara (eller litar du på git-historik).

**Länkar:** [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md) · [`avklarat/README.md`](./avklarat/README.md).

## Aktiva filer (`active/`)

Arbetet drivs som smala uppföljningspass. **Index och kort bakgrund:** [`active/README.md`](./active/README.md). Övriga filer i `active/`.

Nuvarande orientering:

- **Arkitektur:** [`../architecture/builder-generation.md`](../architecture/builder-generation.md)
- **Fas 2-djupkarta:** [`../architecture/fas2-orchestration-and-build.md`](../architecture/fas2-orchestration-and-build.md)

### Component uplift (P14–P16) — ARKIVERAT

Sparet reverterades i restore `1f4e86956` efter kvalitetsregression
(generationer for lika, fler importfel, tunnare art direction).
Detaljer finns i git-historik.

När ett nytt riktigt arbetsspår startar:

- skapa en ny smal fil under **`docs/plans/active/`**
- håll bara sådant där som verkligen styr arbete nu
- flytta eller rensa filen när spåret är avslutat

**Använd git-trackade filer här** i stället för Cursor-interna planfiler utanför repot — en sanning för teamet och CI.

## Arkiv (`avklarat/`)

- [`README.md`](./avklarat/README.md) — kort historiktabell och pekare. Om äldre planfiler saknas i trädet, använd git-historik i stället för att återskapa brutna länkar här.
