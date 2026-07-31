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
2. **Ö3 besvarad 2026-07-31: bara chatten centreras.** Maxbredden sätts alltså på
   chattbandet, inte på hela det nedre området. Lansering-panelen är ett eget
   beslut — se Del F.
3. Kontrollera responsivt läge: på smal skärm ska boxen fortfarande få rimlig
   bredd (centrering får inte bli en smal remsa på mobil).

## Del C — Previewverktygen i headern (N7)

| Knapp | Rad | Åtgärd |
|---|---|---|
| Rensa preview | 98–110 | **Behålls** (Ö5) — men görs ikon-only enligt Del E |
| Öppna i ny flik | 111–123 | Färgsätt tydligare, i stil med den lila F3-knappen |
| Bygg integrationer | 85–97 | Referens (`bg-violet-600`), oförändrad |

### Ö5 avgjord 2026-07-31: knappen behålls — kodverifierat

Frågan var om automatisk städning täcker det knappen finns för. **Den gör det
inte.** Preview-hosten har tre nivåer av automatik:

| Mekanism | Fönster | Full destroy? |
|---|---|---|
| Sessions-TTL (`PREVIEW_SESSION_TTL_MS`, `fly.toml`) | 2 h i prod | Ja |
| Bakgrunds-cleanup (`cleanupPreviewHostStorage`) | var 10:e min | Ja, för utgångna |
| Idle-reaper (`preview-host/src/runtime.js`) | 10 min utan trafik | **Nej** — stoppar runtime, session + workspace kvar |

Det avgörande: idle-reapern **stoppar aldrig en runtime som har en öppen socket**
(`runtime.js:89-91` — "en öppen socket ≈ en öppen iframe … stoppar aldrig en
runtime som fortfarande har en betraktare"). En hängande preview med buildern
öppen är alltså precis det fall som varken reapern eller hibernate täcker, och
`postPreviewDestroy` är enda UI-vägen till omedelbar full destroy. Sessionen
skulle annars leva kvar upp till 2 h och kosta körtid.

Normal livscykel läcker däremot inte: en ny version **uppdaterar** samma session
per `chatId` i stället för att skapa en till (`preview-session.ts:373-436`,
`server.js:514-545`), så borttagningen hade inte gett någon annan vinst än
utrymme. Det utrymmet får vi ändå via ikon-only.

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

## Del F — Lansering-panelen blir diskret (Ö6)

Ägaren vill att panelen "Lansering / Blockerar publicering" tas bort eller görs
mer anonym, och **delegerade beslutet 2026-07-31**. Föreslog själv att den kanske
kunde flyttas till versionshistoriken.

**Beslut: den raderas inte och flyttas inte — den kollapsas.** Tre delar.

### Vad panelen faktiskt bär (kodverifierat 2026-07-31)

Komponenten är `src/components/builder/LaunchReadinessCard.tsx`, monterad överst
i `#builder-chat-panel` (`BuilderShellContent.tsx:1116-1120`) och matad av
`GET /api/engine/chats/[chatId]/readiness` via `useChatReadiness`.

Den **döljer sig redan helt** när `status === "ready"` (rad 81–82), så den syns
bara när det finns något att säga. Det ägaren såg var `no-version`-läget.

| Signal | Finns den någon annanstans? |
|---|---|
| 8 hårda spärrar (`no-version`, `version-draft`, `version-failed`, `release-gate-not-green`, `missing-env`, m.fl.) | Delvis — Publicera-knappen är disablad och tooltipen visar **bara `blockers[0]`** |
| Spärr nr 2 och framåt | **Nej — bara här** |
| Rådgivande rader (`placeholder-env`, `seo-missing-*`, `preview-warning`, `repair-auto-accepted`, `feature-runtime-env`) | **Nej — bara här.** Vissa syns i diagnostikdialogen, men bara för den som redan navigerat dit |

Därför faller "radera" på planens egen regel: rådgivande rader och multi-spärr-
listan har ingen annan yta.

### F1 — `no-version` som enda post: dölj kortet helt

Är `blockers` exakt `[no-version]` och `warnings` tom, rendera `null`. Den
disablade Publicera-knappen säger redan samma sak i sin tooltip ("Välj eller
generera en version först.", `BuilderShellContent.tsx:310-311`). Det är
**dubblering, inte gömd status** — och det är exakt den vy ägaren reagerade på,
eftersom den möter varje ny chat innan något genererats.

### F2 — alla andra lägen: kollapsad rad som default

En rad med ikon + badge (`"2 spärrar"` / `"1 varning"` från
`deploy-readiness-ui.ts`) + "Visa", expanderbar till dagens innehåll. Rubrikerna
"Lansering" och "Blockerar publicering" behöver inte synas i kollapsat läge —
badgen bär signalen.

Uppfinn inget nytt mönster: `F3StatusSurface` i samma band är redan en diskret
rad med länk till diagnostik. Följ den.

### F3 — flytta INTE till versionshistoriken

Ägarens förslag, avvisat av två skäl: `VersionHistory` är en **högerdrawer som
är dold under `lg` och kan stängas** (`BuilderShellContent.tsx:1336-1349`), och
den är **per version**. Publiceringsberedskap är ett nu-tillstånd för hela
chatten, inte en egenskap hos en rad i en lista. En spärr som bara syns bakom
något stängbart är en gömd spärr.

### Tester som måste följa med

`LaunchReadinessCard.test.tsx` (rad 42–46, 66) matchar på "Blockerar publicering"
och "Rekommendationer — blockerar inte", och det finns en **snapshot**
(`__snapshots__/LaunchReadinessCard.test.tsx.snap`) med "Lansering" och "1 spärr".
Lägg till ett fall för F1 (`no-version` ensam → inget renderas) och ett för
kollapsat/expanderat läge.

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
| Preview-sessioner läcker när "Rensa preview" försvinner | **Avvärjd** — knappen behålls (Ö5, kodverifierat) |
| Rådgivande readiness-rader tappar sin enda yta när panelen görs diskret | Del F2 — kollapsad, inte borttagen. Bara `no-version`-läget döljs helt, och det är dubblering av Publicera-tooltipen |
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
- Nedfälld chatt är en centrerad box — **bara chatten**, inte hela bandet (Ö3).
- Previewverktygen följer ett bestämt ikonspråk. "Rensa preview" finns kvar som
  ikon (Ö5). **`Ö4` är fortfarande öppen — rör inte "Bygg integrationer".**
- Lägesknapparna är ikon-only med bevarad a11y och avläsbart läge.
- Lansering-panelen döljs helt när `no-version` är enda posten, och är kollapsad
  i övriga lägen (Del F). Inga rådgivande rader har tappat sin enda yta.
- Ikonspråksregeln (del E) står nedskriven i denna fil.
