---
status: active
owner: unassigned
created: 2026-07-30
topic: Block-galleriet visar samma pusselbits-platshållare för allt utan förhandsbild, vilket döljer skillnaden mellan "saknas by design" och "bilden 404:ar"
source: Observationssession 2026-07-30, notering N8. Kodverifierat samma dag mot working tree; ej mätt i nätverkspanelen
---

# 04 — Miniatyrer i block-galleriet

Ägaren såg ett galleri där varje kort hade en grå pusselbit i stället för
förhandsbild (sökning `chart-bar`, 10 kort). **Börja med en mätning, inte kod** —
det finns en trolig förklaring som inte är en bugg, och en möjlig bugg som göms
bakom den.

Del av [`00-master-plan.md`](00-master-plan.md).

## Utgångsläge (kodverifierat 2026-07-30)

| Del | Fil | Rad |
|---|---|---|
| Pusselbits-fallbacken | `src/components/builder/preview-panel/RegistryItemThumb.tsx` | 50 |
| `ImageOff`-fallback med etikett (detaljvyn) | samma | 41–48 |
| Vilken URL ett kort får | `src/components/builder/preview-panel/PreviewPanelBrowseGallery.tsx` | 308–311 (`thumbnailUrl`) |
| Kortens användning | samma | 348, 434 |
| Beskriv-fliken | `src/components/builder/preview-panel/PreviewPanelDescribeTab.tsx` | 268 |
| URL-byggaren | `src/lib/shadcn/registry-service.ts` | 195–206 (`buildPreviewImageUrl`) |
| Metadata som redan finns per post | samma | 444–448 (`lightImageUrl`, `darkImageUrl`, `previewKind`, `iconKey`) |

## Mätningen är körd — utfall 2026-07-31

**Steg 1 är gjort, och det välte hypotesen.** Mätt direkt mot `ui.shadcn.com` med
exakt de URL:er `buildPreviewImageUrl()` bygger, och med blocknamn hämtade ur
registerindexet (`{base}/r/styles/new-york-v4/registry.json`, 471 poster) i
stället för gissade namn.

| Mängd | PNG-status på `new-york` |
|---|---|
| `chart-bar*` — **exakt de 10 kort ägaren såg** | **404 på alla 10** |
| `chart-*` blocks (20 av 70 testade) | **404 på alla 20** |
| Layout-blocks: `dashboard-01`, `sidebar-01`…`sidebar-14` (15 st) | **200 `image/png` på alla 15** |
| Vad som helst på `new-york-v4` | 404 — bekräftar att `resolvePreviewImageStyle`-omvägen är load-bearing |

**Alla 10 `chart-bar*`-poster är `registry:block`**, inte components. De får alltså
en miniatyr-URL, hämtar den, får 404 och faller till pusselbiten via `onError`.

## Två separata orsaker — och det var den andra

### Orsak 1: **avfärdad för det observerade fallet**

Hypotesen var att `chart-bar` ger components/charts som saknar bild by design, och
att `thumbnailUrl()` därför returnerar `null` innan något nätverksanrop sker. Det
stämmer inte: posterna är blocks. Mekanismen finns kvar för **andra** typer —
registret har 239 `registry:example`, 61 `registry:ui`, 52 `registry:font` m.fl.
som alla faller till `null` — men den förklarar inte ägarens skärmbild.

### Orsak 2: **verklig, och det är den ägaren såg**

Men inte av den orsak planen antog. Det är **inte** att PNG-vägen flyttat igen:
layout-blocks svarar 200 på samma väg i samma stund. Det är att shadcn **inte
publicerar PNG:er för chart-blocks alls** — en kategoriglugg uppströms, inte en
trasig style-väg hos oss.

Det har en konsekvens för åtgärden: **steg 2 nedan går inte att utföra.** Det
finns ingen alternativ style-väg att peka om till, eftersom bilderna inte finns
någonstans. Kvar är steg 3 (skilj lägena åt) och eventuellt steg 4 (egna
miniatyrer) för chart-kategorin.

Defekten i vårt UI kvarstår oförändrad och är nu bevisat verklig: **UI:t skiljer
inte på "det finns ingen bild" och "bilden gick inte att hämta"**, så 70
chart-blocks som faktiskt 404:ar ser exakt ut som en kategori utan bilder.

## Steg

### Steg 1 — Mät — **KLAR 2026-07-31**, se mätningen ovan

Utfallet var 404 för chart-blocks och 200 för layout-blocks. Enligt beslutstabellen
betyder 404 att orsak 2 är verklig och ska loggas som **P2** — det är gjort i
[`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md).

Vill du mäta om (shadcn kan börja publicera chart-PNG:er): hämta blocknamn ur
`{base}/r/styles/new-york-v4/registry.json` och HEAD:a
`{base}/r/styles/new-york/{name}-light.png`. Gissa **inte** blocknamn — mätningen
gjordes först på gissade namn, och `hero-01`/`products-01` som inte finns i
registret gav 404 av fel skäl, vilket nästan blev en falsk slutsats.

### Steg 2 — Fixa URL-vägen: **går inte, hoppa över**

Mätningen visar att det inte är en vägfråga. Layout-blocks svarar 200 på
`new-york` i samma stund som chart-blocks svarar 404, och `new-york-v4` svarar 404
på allt. Bilderna finns alltså inte på någon style-väg — `resolvePreviewImageStyle`
är redan rätt och dess omväg är load-bearing. Peka inte om den.

Kvar av 04 är därmed steg 3, och steg 4 blir mer relevant än planen antog:
70 chart-blocks har ingen förhandsbild att hämta.

### Steg 3 — Skilj de två lägena åt visuellt

Detta är nu huvudarbetet i 04. De ska sluta se likadana ut:

- **Ingen bild finns** (components/charts): rendera en meningsfull ikon per typ.
  Datan finns redan — `previewKind` och `iconKey` sätts i `registry-service.ts`
  444–448 men används inte av `RegistryItemThumb`. Det ger ett galleri med
  begripliga symboler i stället för identiska pusselbitar.
- **Bilden gick inte att ladda** (`onError`): behåll en tydligt annorlunda
  markering, t.ex. `ImageOff` som redan används i detaljvyns fallback (41–48).

### Steg 4 (valfritt, men mer motiverat efter mätningen) — egna miniatyrer

Om ikoner inte räcker: generera egna miniatyrer och cachea dem i Blob. Mätningen
flyttade tyngdpunkten hit — det är **70 chart-blocks** som saknar förhandsbild
uppströms, inte bara components utan bild by design. Fortfarande ett större jobb;
ta det bara om ägaren efterfrågar det efter steg 3.

## Risker

| Risk | Hantering |
|---|---|
| Symptomet döljs utan att 404:orna upptäcks | **Avvärjd** — mätningen är körd och 404:orna är bevisade (2026-07-31) |
| Någon "fixar" style-vägen ändå | Steg 2 är överhoppat med skäl: layout-blocks svarar 200 på samma väg, så vägen är inte fel. En omskrivning skulle bryta det som fungerar |
| Ikon-per-typ blir lika intetsägande som pusselbiten | Använd `previewKind`/`iconKey`, inte en enda generisk ikon |
| Steg 3 gör 404:orna *snyggare* i stället för synliga | 404-läget ska förbli visuellt distinkt (`ImageOff`), inte få en fin typ-ikon som döljer att hämtningen misslyckades |

## Verifiering

```powershell
npm run typecheck
npx vitest run src/lib/shadcn/registry-service.test.ts
npx vitest run src/components/builder
npm run lint
```

Manuellt: sök på både ett block (`login`) och en component (`chart-bar`) och
bekräfta att de två fallen ser olika ut.

## Klart när

- ~~Mätresultatet från steg 1 står nedskrivet här med datum.~~ **Klart 2026-07-31.**
- En trasig bildhämtning går att skilja från en post som aldrig har någon bild.
- Poster utan bild (`registry:example`/`ui`/`font`) visar begriplig typ-ikon i
  stället för generisk pusselbit.
- De 70 chart-blocks som 404:ar visar **404-markeringen**, inte typ-ikonen — de
  *har* en bild-URL, den svarar bara inte.
