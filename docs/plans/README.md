# Plans

**Katalogsystem:** **`active/`** = filer som styr arbete nu · **`avklarat/`** = avklarat eller historiskt. Utkast under `active/` flyttas till `avklarat/` eller rensas när de är klara (eller litar du på git-historik).

**Länkar:** [`documentation-lifecycle.md`](../architecture/documentation-lifecycle.md) · [`docs/architecture/README.md`](../architecture/README.md) · [`avklarat/README.md`](./avklarat/README.md).

## Aktiva filer (`active/`)

Arbetet drivs som smala uppföljningspass. **Index och kort bakgrund:** [`active/README.md`](./active/README.md). Övriga filer i `active/`.

Nuvarande orientering:

- **Arkitektur:** [`../architecture/README.md`](../architecture/README.md)
- **Fas 2-djupkarta:** [`../architecture/fas2-orchestration-and-build.md`](../architecture/fas2-orchestration-and-build.md)
- **Fas 3-karta (nästa fokus):** [`../architecture/fas3-preview-and-deploy.md`](../architecture/fas3-preview-and-deploy.md)

### Component uplift (P14–P16) — ARKIVERAT

Sparet reverterades i restore `1f4e86956` efter kvalitetsregression
(generationer for lika, fler importfel, tunnare art direction).
Detaljer finns i git-historik.

När ett nytt riktigt arbetsspår startar:

- skapa en ny smal fil under **`docs/plans/active/`**
- håll bara sådant där som verkligen styr arbete nu
- flytta eller rensa filen när spåret är avslutat

**Använd git-trackade filer här** i stället för Cursor-interna planfiler utanför repot — en sanning för teamet och CI.

### Arkivering / radering är önskvärt

`active/`-mappen ska representera **arbete som styr just nu** — inte ett museum. Så fort ett spår är avslutat:

- **Levererat och stabilt** → `git mv` filen till `docs/plans/avklarat/` så historik bevaras. Lägg en kort `## Postamble`-paragraf med commit-hash + datum innan flytten.
- **Daterad handoff/sessionsanteckning** (t.ex. `handoff-2026-MM-DD-next-session.md`) → `git rm` direkt när nästa session startat. Git-historiken bevarar innehållet; aktiv mapp ska inte vara en logg.
- **Övergivet utkast** (planerades, blev aldrig påbörjat) → `git rm` med kort commit-message som förklarar varför.
- **Pågående men sovande** (`blocked_by` annan plan) → behåll, men sätt `status: paused` i frontmatter så det syns i översikten.

Riktmärke: om `active/` växer förbi ~10 filer är det ett tecken på att en städ-runda är försenad. Då är det helt OK att radera utkast som inte längre känns viktiga — git-historiken är alltid en knapp bort.

## Arkiv (`avklarat/`)

- [`README.md`](./avklarat/README.md) — kort historiktabell och pekare. Om äldre planfiler saknas i trädet, använd git-historik i stället för att återskapa brutna länkar här.
