---
status: active
owner: unassigned
created: 2026-07-30
topic: Nedfälld chatt som centrerad box med flik i stället för textrad, plus ett gemensamt ikonspråk för previewverktygen i headern och lägesknapparna i chattverktygsraden
source: Observationssession 2026-07-30, noteringar N5, N7 och N9. Kodverifierat samma dag mot working tree
---

# 03 — Chattytans layout och ikonspråk

Tre noteringar som alla handlar om samma sak: buildern har för mycket utskriven
text i kontroller, och nedfällt läge tar hela bredden. **Ta dem i en PR** — annars
blir ikonspråket spretigt.

Del av [`00-master-plan.md`](00-master-plan.md).

## Utgångsläge (kodverifierat 2026-07-30)

| Yta | Fil | Rad |
|---|---|---|
| Fäll-ned-raden | `src/components/builder/ChatOutputCollapseBar.tsx` | hela filen; etiketter 36–39 |
| Chattutdata-containern | `src/app/builder/BuilderShellContent.tsx` | 1142 (`id="builder-chat-output"`) |
| Previewverktygen i headern | `src/components/builder/BuilderPreviewTools.tsx` | 62–124 |
| — "Bygg integrationer" (lila referensfärg) | samma | 85–97 (`bg-violet-600`) |
| — "Rensa preview" | samma | 98–110 |
| — "Öppna i ny flik" | samma | 111–123 |
| `handleClearPreview` (river preview-sessionen) | `src/app/builder/BuilderShellContent.tsx` | 857+ (`postPreviewDestroy`) |
| Lägesknappar i chattverktygsraden | `src/components/builder/ChatInterface.tsx` | 826–857 |

## Del A — Fäll-ned-kontrollen blir en flik (N5)

Ägaren: knappen ska "bara vara som en flik", inte en textrad.

1. Byt textetiketten mot ett kompakt flik-/handtagsutseende (chevron + eventuell
   räknare). Behåll `aria-label` med det fulla namnet och `title` som tooltip.
2. **Statusen får inte försvinna.** Raden bär i dag två saker som måste synas
   även när utdata är dolt — läs komponentens egen kommentar (rad 12–17):
   - `isStreaming` → "Bygger …" med spinner (59–63),
   - `statusText` → t.ex. en blockerare (64–66).
   En ren ikon-flik har ingen plats för dem. Ge dem en egen plats i den nya
   layouten (t.ex. bredvid fliken eller i boxens överkant). Detta är hela
   poängen med komponenten; tappas det göms fel användaren behöver se.
3. `src/components/builder/ChatOutputCollapseBar.test.tsx` matchar på synlig text
   (rad 23, 39). Uppdatera testerna i samma ändring — helst till `aria-label`
   så framtida textändringar inte bryter dem.

## Del B — Nedfällt läge blir en centrerad box (N5)

I dag breder nedfälld chatt ut sig över hela bredden längst ned. Ägaren vill ha
"mer som en box i mitten".

1. Ge det nedfällda bandet en maxbredd och centrering i stället för full bredd.
2. **Ö3 (ägarbeslut):** skärmbilden visade att panelen "Lansering / Blockerar
   publicering — Ingen version är vald" ligger i full bredd precis ovanför.
   Ska boxen omfatta hela det nedre bandet eller bara chatten? Fråga innan du
   bygger — det avgör var maxbredden ska sättas.
3. Kontrollera responsivt läge: på smal skärm ska boxen fortfarande få rimlig
   bredd (centrering får inte bli en smal remsa på mobil).

## Del C — Previewverktygen i headern (N7)

| Knapp | Rad | Åtgärd |
|---|---|---|
| Rensa preview | 98–110 | **Ta bort** — men läs varningen nedan |
| Öppna i ny flik | 111–123 | Färgsätt tydligare, i stil med den lila F3-knappen |
| Bygg integrationer | 85–97 | Referens (`bg-violet-600`), oförändrad |

**Ö5 — varning innan "Rensa preview" tas bort.** Knappen är inte kosmetisk:
`handleClearPreview` (`BuilderShellContent.tsx` 857+) anropar `postPreviewDestroy`
och river preview-sessionen på VM:en. Tas den bort försvinner den enda manuella
vägen att döda en hängande session, vilket kan lämna VM-sessioner igång och kosta
körtid. Kontrollera **först** att sessionen städas automatiskt (timeout på
preview-hosten eller vid ny version) eller att reparera-flödet täcker samma sak.
Gör den inte det: lyft frågan till ägaren i stället för att bara radera knappen.

**Färgsättningen av "Öppna i ny flik":** ger man den samma lila som
"Bygg integrationer" blir en ofarlig åtgärd visuellt likvärdig med en som drar
igång ett riktigt integrationsbygge. Välj en annan accent eller lägre mättnad så
hierarkin står kvar.

**Ö4:** ägarens mening om "Bygg integrationer" bröts mitt i ("… är"). Fråga vad
som saknades innan den knappen rörs.

## Del D — Lägesknapparna blir symboler (N9)

`ChatInterface.tsx` 826–857. Båda knapparna har redan ikoner (`Plus` 838,
`Search` 854) plus text som växlar med läget.

1. Gör dem ikon-only. `aria-label` bär namnet, `title` behålls som tooltip.
2. **Av/på-läget måste fortfarande synas.** I dag bärs det av både texten
   ("Lägg till block" → "Stäng block", "Inspektera preview" → "Sluta inspektera")
   och färgen (violett för composer, emerald för inspektor). Utan text måste
   färg + `aria-pressed` + eventuellt ikonbyte bära hela signalen. Testa att
   det går att se på en skärmdump vilket läge som är aktivt.
3. `src/components/builder/ChatInterface.preview-modes.test.tsx` matchar på
   synlig text (rad 57–122, bl.a. `getByRole("button", { name: "Stäng block" })`).
   Uppdatera till `aria-label`-matchning i samma ändring.

## Del E — Ett gemensamt ikonspråk

C och D är samma önskan på två ytor. Bestäm en gång:

- Vilken storlek och vilket avstånd ikonknappar har i buildern.
- Hur "aktivt läge" markeras (färgad ram + fylld bakgrund?).
- Hur destruktiva/tunga åtgärder skiljs från lätta (mättnad, inte bara nyans).

Skriv ned regeln här när den är satt, så nästa yta inte uppfinner en egen.

## Risker

| Risk | Hantering |
|---|---|
| Blockerarstatus göms när chatten fälls ned | Del A punkt 2 — kravet är explicit i komponentens kodkommentar |
| Ikon-only utan `aria-label` → knappar blir namnlösa för skärmläsare | Del A/D — a11y-attribut i samma commit som texten tas bort |
| Preview-sessioner läcker när "Rensa preview" försvinner | Ö5 — verifiera automatisk städning först |
| Två tester låser knapptexter och går sönder | `ChatOutputCollapseBar.test.tsx`, `ChatInterface.preview-modes.test.tsx` |

## Verifiering

```powershell
npm run typecheck
npx vitest run src/components/builder/ChatOutputCollapseBar.test.tsx src/components/builder/ChatInterface.preview-modes.test.tsx
npx vitest run src/components/builder
npm run lint
```

Manuellt: fäll ned och upp chatten under pågående generering och bekräfta att
"Bygger …" syns i båda lägena. Bekräfta att aktivt block-/inspektionsläge går att
avgöra utan text.

## Klart när

- Fäll-ned-kontrollen är en flik och statusen syns fortfarande i nedfällt läge.
- Nedfälld chatt är en centrerad box (Ö3 besvarad).
- Previewverktygen följer ett bestämt ikonspråk, och Ö4/Ö5 är besvarade.
- Lägesknapparna är ikon-only med bevarad a11y och avläsbart läge.
- Ikonspråksregeln (del E) står nedskriven i denna fil.
