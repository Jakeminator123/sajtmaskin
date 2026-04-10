# Plans

**Katalogsystem:** **`active/`** = filer som styr arbete nu · **`avklarat/`** = avklarat eller historiskt. Utkast under `active/` flyttas till `avklarat/` eller rensas när de är klara (eller litar du på git-historik).

**Länkar:** [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md) · [`avklarat/README.md`](./avklarat/README.md).

## Aktiva filer (`active/`)

Efter den avslutade 5-stegsgenomgången ar arbetet normalt smala uppfoljningspass.

Nuvarande orientering:

- **Samlad slutoversikt:** [`../../5-steg.txt`](../../5-steg.txt)
- **Kvarvarande fokus / nasta pass:** [`active/remaining-focus-after-5-step.md`](active/remaining-focus-after-5-step.md)
- **Steg 4-djupkarta:** [`../architecture/step4-post-generation.md`](../architecture/step4-post-generation.md)

### Component uplift (P14–P16)

Sammankopplat spar for capability-driven komponentinjektion, enhancement packs och nya scaffolds.

- **Oversikt och rationale:** [`active/component-uplift-overview.md`](active/component-uplift-overview.md)
- **P14 — Capability → dep-injektion:** [`active/P14-capability-dep-injection.md`](active/P14-capability-dep-injection.md) (hog prio)
- **P15 — Enhancement packs:** [`active/P15-enhancement-packs.md`](active/P15-enhancement-packs.md) (medel-hog, beror pa P14)
- **P16 — Nya scaffold-shells:** [`active/P16-missing-scaffold-shells.md`](active/P16-missing-scaffold-shells.md) (medel)

När ett nytt riktigt arbetsspår startar:

- skapa en ny smal fil under **`docs/plans/active/`**
- håll bara sådant där som verkligen styr arbete nu
- flytta eller rensa filen när spåret är avslutat

**Använd git-trackade filer här** i stället för Cursor-interna planfiler utanför repot — en sanning för teamet och CI.

## Arkiv (`avklarat/`)

- [`README.md`](./avklarat/README.md) — kort historiktabell och pekare. Om äldre planfiler saknas i trädet, använd git-historik i stället för att återskapa brutna länkar här.
