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

## Två separata orsaker — skilj dem åt

### Orsak 1 (trolig, inte en bugg): kategorin har aldrig någon bild

```text
function thumbnailUrl(item: ComponentItem): string | null {
  if (item.type !== "block") return null;
  ...
}
```

Allt som inte är `type === "block"` får `null` och faller direkt till pusselbiten.
Ägarens sökning `chart-bar` ger **components/charts**, inte blocks. Att panelen
hade togglats av och på är sannolikt en tillfällighet, inte orsaken.

### Orsak 2 (möjlig bugg): block-PNG:erna 404:ar

För riktiga blocks byggs URL:en mot `ui.shadcn.com`
(`{base}/r/styles/new-york/{name}-light.png`). Kodkommentaren i
`registry-service.ts` 201–204 dokumenterar att shadcn-redesignen i juli 2026
flyttade PNG-vägen en gång redan. Slår det till igen faller korten till samma
pusselbit via `onError` — **visuellt identiskt med orsak 1**.

Det är den egentliga defekten: UI:t skiljer inte på "det finns ingen bild" och
"bilden gick inte att hämta", så ett verkligt trasigt CDN ser normalt ut.

## Steg

### Steg 1 — Mät (gör detta först)

1. Öppna Bläddra-galleriet i prod med nätverksfliken på.
2. Sök på något som ger **blocks** (t.ex. `login`, `hero`, `dashboard`) — inte
   `chart-bar`.
3. Notera statuskoden för `*-light.png`-anropen mot `ui.shadcn.com`.

| Utfall | Slutsats |
|---|---|
| 200 | Orsak 2 finns inte just nu. Gå till steg 3 (bara presentation) |
| 404/403 | Orsak 2 är verklig och är en **P2-bugg** — logga i `BUG-SWARM-BACKLOG.md` och fixa URL-vägen |

Skriv ned mätresultatet med datum i denna fil.

### Steg 2 — Fixa URL-vägen (endast om steg 1 gav 404)

`resolvePreviewImageStyle` i `registry-service.ts` styr vilken style-väg PNG:erna
hämtas från. `src/lib/shadcn/registry-service.test.ts` (rad 64–108) låser dagens
utdata — uppdatera testerna tillsammans med fixen, de är avsiktligt strikta.

### Steg 3 — Skilj de två lägena åt visuellt

Oavsett steg 1 ska de sluta se likadana ut:

- **Ingen bild finns** (components/charts): rendera en meningsfull ikon per typ.
  Datan finns redan — `previewKind` och `iconKey` sätts i `registry-service.ts`
  444–448 men används inte av `RegistryItemThumb`. Det ger ett galleri med
  begripliga symboler i stället för identiska pusselbitar.
- **Bilden gick inte att ladda** (`onError`): behåll en tydligt annorlunda
  markering, t.ex. `ImageOff` som redan används i detaljvyns fallback (41–48).

### Steg 4 (valfritt) — egna miniatyrer

Om ikoner inte räcker: generera egna miniatyrer för components/charts och cachea
dem i Blob. Större jobb; ta det bara om ägaren efterfrågar det efter steg 3.

## Risker

| Risk | Hantering |
|---|---|
| Symptomet döljs utan att 404:orna upptäcks | Steg 1 före all kod |
| `registry-service.test.ts` bryts av en URL-ändring | Uppdatera i samma commit; testerna är avsiktligt strikta mot style-alias |
| Ikon-per-typ blir lika intetsägande som pusselbiten | Använd `previewKind`/`iconKey`, inte en enda generisk ikon |

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

- Mätresultatet från steg 1 står nedskrivet här med datum.
- En trasig bildhämtning går att skilja från en post som aldrig har någon bild.
- Components/charts visar begriplig typ-ikon i stället för generisk pusselbit.
