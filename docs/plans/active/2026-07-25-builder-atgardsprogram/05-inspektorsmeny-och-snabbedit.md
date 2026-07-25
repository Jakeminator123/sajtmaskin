---
status: active
owner: unassigned
created: 2026-07-25
topic: Direktmanipulation i previewen — meny vid muspekaren i inspect-läge med snabbeditering, borttagning och bildbyte, plus rektangelmarkering. Täcker Ö10 och Ö10b.
source: Användarens önskemål under observationssessionen 2026-07-25 (`.cursor/logg-internet/runs/2026-07-25_0302.md`, Ö10 + Ö10b). Kodverifierat mot master `57416834`.
parent: 00-master-plan.md
---

# Spår 05 — Inspektorsmeny och snabbeditering

## TL;DR

I dag leder ett klick i inspect-läge till kodinspektion. Önskemålet är att det
i stället ska öppna en liten meny **vid muspekaren** med direkta åtgärder:
snabbeditera texten i en overlay ovanpå iframen, ta bort elementet, och — där det
är rimligt — byta bild.

Det mesta av maskineriet finns redan. Två saker gör spåret icke-trivialt:
**borttagning** är svårare än den låter, och **skärmbild av en yta** kan inte
återanvända den befintliga capture-motorn i prod.

Detta spår startar först när spår 04 är mergat (inspect-läget byter hemvist där).

## Vad som redan finns

| Byggsten | Var | Ger |
|---|---|---|
| Bridge mot preview-iframen | `preview-panel/hooks/usePreviewInspectBridge.ts` | element-tagg, rect, klickkoordinat |
| Träff mot kod | samma | `filePath:lineNumber` |
| Elementkarta för hel sida | `POST /api/inspector-element-map` | alla element med rect |
| Punktbaserad skärmbild | `hooks/usePreviewPanelInspectCapture.ts` → `POST /api/inspector-capture` | `capturedUrl` + `clip` |
| Deterministisk filändring | `src/lib/gen/quick-edit/` (`replace_content`, `replace_text`, `delete_file`) | ändring utan LLM |

Quick-edit-API:t är alltså redan den rätta motorn för snabbeditering: det ändrar
filer deterministiskt, utan modellanrop, utan kostnad.

## Den kritiska begränsningen

Capture- och map-motorerna bygger på **Playwright**, som inte finns i
serverless. `usePreviewPanelInspectMapPlacement.ts` (rad ~117) loggar det
uttryckligen:

> Own-engine preview — map/capture engines require a local Playwright install
> (not available in serverless)

I prod körs alltså **bridge**-motorn (postMessage från iframen), inte capture.
En "printscreen av området" kan därför inte bara anropa `/api/inspector-capture`.
Två möjliga vägar:

| Väg | Hur | Bedömning |
|---|---|---|
| I iframen | canvas-rendering av det markerade området via bridgen | ingen ny infrastruktur, men begränsad av cross-origin-regler och renderar inte allt korrekt |
| På preview-hosten | Fly-VM:en kör redan sajten och kan ha Playwright | mest korrekt resultat, kräver ett nytt endpoint på hosten |

**Markera-flera-element** har inte samma problem: bridgen kan redan räkna fram
element och deras rect, så "alla element vars rect skär rektangeln" är ren
geometri på data som redan finns.

## Vad som går att snabbeditera — och vad som inte gör det

Detta är kärnan i Ö10 och måste avgöras innan menyn byggs, annars erbjuder menyn
åtgärder som misslyckas.

| Elementtyp | Snabbeditering | Mekanism | Svårighet |
|---|---|---|---|
| Ren textnod med literal i JSX | **ja** | `replace_text` på filens rad | låg |
| Text som kommer från en variabel/array (t.ex. en `features`-lista) | villkorat | måste hitta källan, inte JSX-raden | medel |
| Text från props flera nivåer upp | nej | erbjud inte åtgärden | — |
| `<img>`/`next/image` med literal `src` | **ja** — byt bild | `replace_text` på `src` | låg |
| Bild från en datalista | villkorat | samma som text ovan | medel |
| Ta bort ett helt element | **svårast** | måste ta bort en komplett JSX-nod, inte en rad | hög |

Menyn ska bara visa de åtgärder som faktiskt går att utföra på det element som
pekas på. En gråad-ut åtgärd är bättre än en som tystnar.

### Varför borttagning är svårt

`replace_text` räcker inte. Att ta bort ett element betyder att ta bort en
komplett JSX-nod med balanserade taggar, eventuella barn, och den omgivande
formateringen — och att inte lämna kvar en nu oanvänd import eller en tom
wrapper. Regexbaserad borttagning kommer att producera oparsbar JSX, precis som
Ö4:s navigationsinsättning gör (se spår 02).

Rimlig ansats: en AST-baserad borttagning (samma TypeScript-parser som autofix
använder) med samma parse-guard före skrivning. Utan AST bör åtgärden inte
levereras.

## Sekvens

### Steg 1 — klassificera element via bridgen

- Utöka bridgen så att den, för ett träffat element, returnerar tillräcklig
  information för att avgöra vilka åtgärder som är möjliga: elementtyp,
  om textinnehållet är en literal i filen, om `src` är en literal.
- Detta är läs-only och kan levereras och testas för sig.
- Ny test: klassificeringen skiljer en JSX-literal från en variabelrefererad text.

### Steg 2 — menyn vid muspekaren

- Klick i inspect-läge öppnar en liten meny på klickpunkten i stället för att
  skicka en punkt till chatten.
- Menyn visar åtgärder baserade på steg 1:s klassificering. Ej möjliga åtgärder
  visas gråade med en kort orsak.
- Nuvarande beteende (skicka punkt till chatten) ska finnas kvar som ett
  menyval, inte försvinna — det är fortfarande den enda vägen för komplexa
  ändringar.

### Steg 3 — snabbeditering av text i overlay

- Textåtgärden öppnar en redigeringsruta **ovanpå** iframen, inte i kodvyn.
- Spara → `replace_text` via quick-edit → previewen uppdateras.
- Ingen LLM, ingen scaffold-ombyggnad.

> **Rättelse efter Codex-granskning (P1, PR #614):** ett tidigare utkast antydde
> att snabbeditering borde undvika att skapa en ny version. Det vore fel.
> `src/lib/gen/quick-edit/service.ts:46-55` persisterar redan medvetet en
> **immutabel minorversion** (`quick_edit`) med majorversionen som förälder, och
> buildern väljer det barnet för att undvika stale-base-konflikter. Att återanvända
> basversionens id skulle återskapa F10: rullbackshistoriken försvinner och
> verifieringskvitton kan beskriva innehållet före ändringen. **Behåll
> minorversions-kontraktet.**

- Ny test: en literal textändring ger exakt en `replace_text`-op mot rätt fil och
  rad.
- Ny test: ändringen persisteras som en ny minorversion; basversionen är oförändrad.

### Steg 4 — byt bild

- Samma mönster som steg 3, men mot `src`.
- Återanvänd den befintliga mediahanteringen för uppladdning/val; inför inte en
  andra bildväg.

### Steg 5 — ta bort element (AST)

- AST-baserad borttagning av en komplett JSX-nod.
- Parse-guard före skrivning: ökar parse-felen, förkasta ändringen.
- Städa oanvända importer i samma operation, eller låt autofix göra det.
- Ny test: borttagning av ett element med barn lämnar filen parsbar och tar bort
  hela noden.
- Ny test: en borttagning som skulle göra filen oparsbar utförs inte.

### Steg 6 — Ö10b: rektangelmarkering

- Vänsterklick + dra i inspect-läge ritar en rektangel. På släpp visas två val:
  **markera elementen i ytan** eller **ta en bild av ytan**.
- Markera-flera bygger på bridgens elementkarta och rect-geometri — leverera
  detta först, det är den enkla halvan.
- Bild-av-ytan kräver ett beslut mellan iframe-canvas och preview-host. Skriv ned
  valet här innan implementationen.

## Definition of done

| # | Krav | Bevis |
|---|---|---|
| 1 | Klick i inspect-läge öppnar en meny vid muspekaren | manuell körning |
| 2 | Menyn visar bara utförbara åtgärder; övriga är gråade med orsak | manuell körning på minst tre elementtyper |
| 3 | Textändring i overlay uppdaterar previewen utan att öppna kodvyn | manuell körning + nytt test |
| 4 | Bildbyte fungerar för literal `src` | manuell körning |
| 5 | Borttagning lämnar filen parsbar; annars utförs den inte | nya tester |
| 6 | Rektangel → markera flera element fungerar | manuell körning |
| 7 | Beslut om bild-av-ytan (iframe vs preview-host) är dokumenterat och implementerat eller uttryckligen skjutet | rad nedan |
| 8 | "Skicka punkt till chatten" finns kvar som menyval | manuell körning |

## Risker

| Risk | Hantering |
|---|---|
| Varje snabbeditering skapar en ny version och spär ut versionslistan | **lös det i presentationen, inte i identiteten** — gruppera minorversioner under sin major i versionslistan. Skriv aldrig om basversionen (se rättelsen under steg 3) |
| Regexbaserad borttagning shippas i brådska och trasar sönder filer | steg 5 levereras **bara** med AST + parse-guard; annars skjuts åtgärden |
| Menyn erbjuder åtgärder som tystnar | steg 1 (klassificering) måste vara klart före steg 2 |
| Playwright-antagandet smyger tillbaka i bild-av-ytan | testa i prod, inte lokalt, innan funktionen räknas som klar |
| Overlay-editorn hamnar fel vid scroll i iframen | positionera via bridgens rect, inte via en engångskoordinat |

## Ägarbeslut

- **Bild-av-ytan: iframe-canvas eller preview-host?** _(ej beslutat)_
- ~~Ska snabbeditering skapa ny version?~~ **Avgjort** — ja, immutabel minorversion,
  precis som `quick-edit/service.ts` redan gör. Ingen ändring av identitetsmodellen.
