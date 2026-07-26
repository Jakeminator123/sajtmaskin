---
status: active
owner: unassigned
created: 2026-07-25
topic: Flytta builderns chrome dit användaren tittar och ge previewen tillbaka sin yta. Täcker Ö1, Ö2, Ö3, Ö5, Ö6, Ö7.
source: Användarens önskemål under observationssessionen 2026-07-25 (`.cursor/logg-internet/runs/2026-07-25_0302.md`, Ö1–Ö7). Kodverifierat mot master `57416834`.
parent: 00-master-plan.md
---

# Spår 04 — Verktygsrad och previewyta

## TL;DR

Previewpanelen har i dag en egen verktygsrad med sju kontroller
(`Bygg integrationer`, `Lägg till`, `Inspektera preview`, `Kod`, `Byggblock`,
`Rensa`, `Öppna`) plus en etiketterad sidremsa under previewen. Allt det äter
yta från det enda användaren egentligen vill se.

Önskemålet är enkelt att formulera och stökigt att bygga: **kontrollerna ska
flytta, men de äger delat tillstånd med panelen de sitter i.** Det är
state-lyftningen, inte knapparna, som är arbetet.

Detta spår måste landa **före** spår 03 och spår 05.

## Vad som ska flytta vart

| Ö | Kontroll | Från | Till |
|---|---|---|---|
| Ö1 | `+ Lägg till` | previewpanelens verktygsrad | Verktyg-raden ovanför chatinputen, intill `Avancerat` |
| Ö2 | `Inspektera preview` | samma | samma rad, intill den flyttade `Lägg till` |
| Ö5 | `Bygg integrationer`, `Kod`, `Byggblock`, `Rensa`, `Öppna` | samma | headern, på samma nivå som `Mer`, `Ny chat`, `Publicera` |
| Ö7 | etiketten "Sidor i skapad preview" | ovanför sidremsan | bort; remsan krymper |

Resultatet: previewpanelen har ingen egen verktygsrad kvar.

## Varför det inte är en ren flytt

### Ö1 + Ö2 är ett par, inte två knappar

`Lägg till` (composer) och `Inspektera preview` är **ömsesidigt uteslutande
lägen** i `PreviewPanelChrome.tsx`. `handleToggleComposer` och
`handleToggleInspect` stänger varandras läge, och knapparnas etiketter växlar
(`Stäng Lägg till`). Flyttar man bara en av dem hamnar togglarna i olika
komponenter och kan inte längre stänga varandra.

De måste därför flyttas i samma ändring, och lägestillståndet måste lyftas till
en gemensam förälder — i praktiken `BuilderShellContent.tsx`, som redan äger
`vm`-objektet som båda panelerna läser.

### Ö5 flyttar även popovers

`Kod` och `Byggblock` är inte knappar utan popover-triggers med eget innehåll
(kodvyn respektive byggblockspanelen). `Rensa` är dessutom villkorat disabled.
Att flytta dem till headern innebär att headern får ansvar för paneler som i dag
bor i previewpanelen — och headern är redan tät.

Praktisk konsekvens: headern behöver antingen en egen sekundärrad, eller så
måste några av de fem hamna under den befintliga `Mer`-menyn. Det är ett
designbeslut, inte en mekanisk flytt.

### Ö7 har en detalj som lätt tappas

Spinnern för pågående sidoperation (`pageOpBusy`) ligger i dag i samma container
som etiketten. Tas etiketten bort utan att spinnern får en ny hemvist försvinner
den enda återkopplingen på att "+ Sida" arbetar.

### Ö6 är ett rent CSS-problem med en produktfråga i sig

`src/components/openclaw/OpenClawChat.tsx` positionerar bubblan med
`fixed inset-x-3 bottom-3`. I mobilbredd hamnar den ovanpå `Skicka`-knappen i
chatinputen.

Frågan bakom: ska Sajtagenten alls ligga fritt över buildern, eller ska den ha en
builder-specifik placering? Ett `bottom`-offset löser symptomet; en
builder-medveten placering löser klassen.

## Sekvens

Stegen är sekventiella. Steg 1 är ett ägarbeslut som styr copy i tre ytor.

### Steg 1 — ägarbeslut B3: vad ska `+ Lägg till` heta?

Knappen hette tidigare "Composer". Den öppnar ytan där man lägger till
byggblock/innehåll i previewen. Namnet måste fungera intill `Avancerat` och
`Inspektera preview`, dvs. kort och verbaktigt.

Kandidater att välja bland (ej beslutat): `Lägg till block`, `Bygg ut`,
`Innehåll`, `Sätt in`.

Beslutet påverkar: knappens etikett, dess stängda läge ("Stäng …"), och tooltip.

### Steg 2 — lyft lägestillståndet

- Flytta `composerOpen`/`inspectMode` (eller motsvarande) från
  `PreviewPanelChrome.tsx` till den gemensamma föräldern.
- Behåll den ömsesidiga uteslutningen i **ett** ställe — inte två synkade
  useState.
- Inga UI-ändringar i detta steg. Det ska vara en ren refaktorering med gröna
  tester, så nästa steg blir små.

### Steg 3 — Ö1 + Ö2: rendera paret i Verktyg-raden

- Lägg de två kontrollerna i `ChatInterface.tsx`, i samma rad som `Avancerat`.
- Ta bort dem ur previewpanelen i samma ändring — ingen dubblering ens tillfälligt,
  eftersom två togglar mot samma state förvirrar mer än den hjälper.
- Verifiera att `Inspektera preview` fortfarande fungerar när previewpanelen är
  maximerad respektive kollapsad.

### Steg 4 — Ö5: designbeslut + flytt av de fem

- Bestäm placering: sekundärrad i headern, eller under `Mer`. Skriv ned valet här
  innan implementationen.
- Flytta popover-innehållet med triggern; dela inte upp trigger och innehåll
  mellan komponenter.
- `Rensa` ska behålla sitt disabled-villkor.
- Efter detta steg ska previewpanelen inte ha någon verktygsrad kvar.

### Steg 5 — Ö7: krymp sidremsan

- Ta bort etiketten "Sidor i skapad preview".
- Ge `pageOpBusy`-spinnern en ny hemvist — rimligast som ett tillstånd på
  `+ Sida`-knappen själv (den vet redan när den är upptagen).
- Minska containerhöjden så sidchipsen flyttar upp.

### Steg 6 — Ö6: Sajtagenten ska inte täcka Skicka

- Kortsiktigt: höj `bottom`-offset i mobilbredd så bubblan hamnar ovanför
  chatinputens knappar.
- Bättre: låt buildern ange en placering (t.ex. via en context-prop) så bubblan
  vet att den delar botten med en input.
- Verifiera i faktisk mobilbredd, inte bara i en smal desktopruta — chatinputens
  knappar wrappar.

## Definition of done

| # | Krav | Bevis |
|---|---|---|
| 1 | B3 är beslutat och namnet är konsekvent i alla tre copy-ytor | ägarens rad nedan |
| 2 | Lägestillståndet för composer/inspect har **en** ägare | kodgranskning + befintliga tester gröna |
| 3 | `Lägg till` och `Inspektera preview` finns i Verktyg-raden och ingen annanstans | manuell körning |
| 4 | Previewpanelen har ingen egen verktygsrad | manuell körning |
| 5 | `Kod`, `Byggblock`, `Bygg integrationer`, `Rensa`, `Öppna` fungerar från sin nya plats, inkl. popover-innehåll och disabled-villkor | manuell körning per kontroll |
| 6 | Etiketten "Sidor i skapad preview" är borta och remsan är lägre | manuell körning |
| 7 | Pågående sidoperation syns fortfarande | manuell körning |
| 8 | Sajtagent-bubblan täcker inte `Skicka` i mobilbredd | manuell körning i mobilviewport |
| 9 | Previewens användbara yta är mätbart större än före spåret | före/efter-skärmbild i PR |

## Risker

| Risk | Hantering |
|---|---|
| Headern blir överfull och sämre än den rad vi tog bort | avgör placeringen i steg 4 **innan** flytten; en sekundärrad i headern är tillåtet |
| State-lyftningen ger extra renderingar i previewpanelen | det finns redan ett prejudikat: commit `8e3d241a` dedupade placement-state av samma skäl — följ det mönstret |
| Inspect-läget flyttas medan spår 05 bygger på det | spår 05 startar först när detta spår är mergat |
| Mobilfixen för Ö6 döljer bubblan helt på små skärmar | verifiera att den fortfarande går att öppna och stänga |

## Ägarbeslut

- **B3 (namn på `+ Lägg till`):** **`Lägg till block`** — beslutat 2026-07-26.
  Stängt läge: `Stäng block`. Tooltip: *"Lägg till färdiga block och innehåll i
  previewen"*. Namnet valdes framför `Bygg ut`, `Innehåll` och `Sätt in` eftersom
  det är det enda som säger både verbet och objektet, och eftersom "block" redan
  är etablerad vokabulär i produkten via Byggblock-panelen.
- **Ö5-placering (sekundärrad vs `Mer`-meny):** **ikonkluster i headerns högersida**
  — beslutat 2026-07-26. Ingen sekundärrad (den hade ätit lika mycket höjd som
  raden vi tar bort) och ingen `Mer`-meny för `Kod`/`Byggblock` (popover i
  dropdown är en känd fälla). De fem hamnar så här:

  | Kontroll | Ny hemvist |
  |---|---|
  | `Kod` | ikonknapp i klustret, popover-innehållet följer med triggern |
  | `Byggblock` | ikonknapp i klustret, popover-innehållet följer med triggern |
  | `Öppna` | ikonknapp i klustret |
  | `Rensa` | ikonknapp i klustret, behåller sitt disabled-villkor |
  | `Bygg integrationer` | ikonknapp i klustret, `PreviewPanelF3Trigger` flyttas med sina callbacks |

  Klustret ligger som en avgränsad grupp omedelbart före `Ny chat`, ikon-only med
  tooltip som bär namnet. Hela klustret döljs när `previewUrl` saknas, så headern
  inte växer innan det finns en preview att styra.


## Implementationsbevis (2026-07-26)

Steg 2-6 implementerade. Ingen commit.

| Krav | Status | Bevis |
|---|---|---|
| 2 | klar | `usePreviewSurfaceMode.ts` — ett enda `surfaceMode`-fält (`"none" \| "composer" \| "inspect"`) ägt av `BuilderShellContent`. Test: `usePreviewSurfaceMode.test.ts` (6 tester) |
| 3 | klar | `Lägg till block` / `Inspektera preview` i `ChatInterface`s Verktyg-rad. Test: `ChatInterface.preview-modes.test.tsx` (7 tester, inkl. att previewpanelen saknar dem) |
| 4 | klar | `BuilderPreviewTools.tsx` — ikonkluster i headern före `Ny chat`. Previewpanelens verktygsrad borttagen |
| 5 | klar | Etiketten borta, remsan `py-2` → `py-1` |
| 6 | klar | `pageOpBusy` visas nu som spinner i `+ Sida`-knappen (`aria-busy`) |
| 7 | klar | `Ångra`/`Gör om` flyttade till composer-overlayens infokort |
| 8 | klar | Sajtagent-bubblan lyfts till `bottom-28` på `/builder` i mobilbredd |
| 9 | delvis | ~77 px återvunnen höjd räknat i klasser (49 px verktygsrad + ~28 px sidremsa). Före/efter-skärmbild återstår |

Verifiering: `npx vitest run src/components/builder src/components/openclaw` → 27 filer / 180 tester gröna. `npx eslint` på ändrade filer → rent. `npx tsc --noEmit` → inga fel i spårets filer (kvarvarande fel ligger i `src/lib/gen/preview/preview-only-files.test.ts`, annat spår).
