---
status: active
owner: unassigned
created: 2026-07-30
topic: Flytta genereringsstatus från osynliga toasts till chatten, ge chattloggen en ärlig fasindikator, och gör skillnad på "preview laddar" och "preview klar"
source: Observationssession 2026-07-30, noteringar N4 och N6. Kodverifierat samma dag mot working tree
---

# 02 — Statusytor under generering

Två problem från samma körning:

1. Statusnotiser hamnar i en toast uppe till höger som ägaren beskrev som
   "ett typ osynligt fält med vit text" — de missas.
2. Chattloggen säger för lite om vad som faktiskt pågår. Ägaren vill se
   "vad AI:n tänker eller vad som faktiskt görs", gärna som en barometer.

Del av [`00-master-plan.md`](00-master-plan.md). Detta är planens största post.

## Utgångsläge (kodverifierat 2026-07-30)

| Yta | Fil | Rad |
|---|---|---|
| Statusnotisen "Skapar brief och dynamiska instruktioner…" | `src/lib/hooks/useInitBrief.ts` | 99 (`toast.loading`) |
| Toast-mount | `src/app/layout.tsx` | 95 (`<Toaster position="top-right" />`) |
| Toast-styling | `src/components/ui/sonner.tsx` | 27–34 (`--normal-bg: var(--popover)` m.fl.) |
| "Slutsteg (N) — visa detaljer" | `src/components/builder/BuilderMessageTooling.tsx` | 171 |
| Befintlig fas-indikator (reparation) | `src/components/builder/MessageList.tsx` | 771–800 (`RepairProgressIndicator`) |
| Preview-overlay ("Laddar…") | `src/components/builder/preview-panel/PreviewPanelFrame.tsx` | 179–186 |
| Tomt-läge "Genererar kod / AI tänker…" | `src/components/builder/preview-panel/PreviewPanelEmptyState.tsx` | 141, 157 |

## Del A — Toasten syns inte (N4, delfråga 1)

### A1. Mät först, fixa sedan

Innan något byggs om: reproducera i prod eller lokalt och läs **computed style**
på toast-elementet (`li[data-sonner-toast]`). Ägarens DOM-utdrag visade
`class=""` på elementet. Fastställ vilket det är:

- bakgrunden är transparent/saknas → CSS-bugg i `sonner.tsx`-variablerna, eller
- toasten renderas bakom/utanför synligt område → positions-/z-index-problem.

Skriv ned vilket det var i denna fil. Bygg inte om placeringen för att dölja en
CSS-bugg som även drabbar fel-toasts.

**Fastställt 2026-07-31: CSS-bugg, inte positions-/z-index-problem.**
`globals.css`/`tailwind.config.cjs` definierar `--popover`, `--popover-foreground`
och `--border` som råa "H S% L%"-tripplar (t.ex. `--popover: 220 14% 12%;`) —
avsedda att användas inuti `hsl(...)` (`bg-popover` kompilerar till
`hsl(var(--popover))`). `sonner.tsx` satte i stället sina egna
`--normal-bg`/`--normal-text`/`--normal-border`-variabler till dessa värden
**owrappade** (`"--normal-bg": "var(--popover)"`), och sonners egen stilmall
(`node_modules/sonner/dist/styles.css`) konsumerar dem direkt som färgvärden
(`background: var(--normal-bg)`). Resultatet blev en ogiltig CSS-färg som
webbläsaren ignorerar — bakgrunden föll tillbaka till transparent medan texten
(ärvd ljus sidfärg) förblev läsbar. Exakt "ett typ osynligt fält med vit text".
Åtgärdat genom att `hsl()`-wrappa de tre värdena i `sonner.tsx`; `--border-radius`
behövde ingen ändring (`--radius` är redan ett giltigt längdvärde).

### A2. Flytta flödesstatus till chatten

Init-brief-statusen hör hemma där blicken är. Publicera den som en statusrad i
chatten i stället för `toast.loading` — samma yta och stil som
`RepairProgressIndicator` (`MessageList.tsx` 771–800), placerad vid den
streamande AI-bubblan.

`useInitBrief.ts` ska alltså rapportera status till chat-state i stället för att
kalla `toast` direkt.

**Levererat 2026-07-31.** Deep Brief körs innan chatten (och därmed
`AgentLogCard`/den streamande AI-bubblan) ens finns — se P22-guarden i
`useInitBrief.ts`, `forceDeepBrief` är init-only. Det finns alltså inget
meddelande att fästa en `AgentLogCard` vid ännu. Den redan levererade ytan som
faktiskt täcker exakt det här fönstret är den befintliga "Förbereder
prompt..."-statusraden i `ChatInterface.tsx` (renderas direkt under
composern, dvs i chattpanelen, styrd av `isPreparingPrompt`). `useInitBrief.ts`
kallar inte längre `toast.loading`/`toast.success` för flödesstatus — den
dispatchar ett window-event (`INIT_BRIEF_STATUS_EVENT`) som `ChatInterface.tsx`
lyssnar på och visar i den befintliga raden i stället för den generiska texten.
Ingen ny parallell statusyta — samma statusrad, riktigare text.

### A3. Behåll toasten för systemhändelser

Toasten är rätt yta för sådant som händer **utanför** chattflödet: fel, sparat,
publicerat. Fixa bakgrunden (A1) och låt de ligga kvar. Riv inte ut sonner.

**Levererat 2026-07-31.** Fel-vägarna i `useInitBrief.ts` (timeout, parse-fel,
generiskt fel, ogiltig modell) kallar fortfarande `toast.error`/`toast` precis
som förut — bara de två *flödesstatus*-anropen (`toast.loading`/`toast.success`)
flyttade till A2:s statusrad.

## Del B — Levande chattlogg (N4, delfråga 2)

### B0. Krav som inte får brytas

- **Behåll `Slutsteg (N) — visa detaljer`** (`BuilderMessageTooling.tsx` 171).
  Ägaren var uttrycklig. Den får gärna bli "slutläget" som panelen fälls ihop
  till, men innehållet ska vara kvar.
- **Visa aldrig en fas som inte mäts.** `RepairProgressIndicator` gissar redan
  fas utifrån väggklocka (se kodkommentaren 749–760: "the phase shown will lag
  reality"). En barometer byggd på samma sätt ser exakt ut som riktig telemetri
  men är gissning — det är false-green mot användaren. Bygg B3 först **efter**
  B1.

### B1. Inventera vilka fas-event som faktiskt strömmar

Läs SSE-strömmen från own-engine och skriv ned i denna fil vilka fas-/progress-
event som finns i dag (start, brief klar, plan klar, filer skrivna, normalize,
RenderGate, preview-session startad, klar). Router: `docs/architecture/llm-pipeline.md`
och `src/lib/gen/`.

Utfallet avgör om B3 är möjlig eller om den ska strykas.

**Inventerat 2026-07-31.** Builder-kontraktet strömmar redan riktiga
`progress`-event från codegen och framåt:

- generation: `start`, `reasoning`, `reasoning-slow`, `awaiting-output`,
  `streaming`, `tool`, `done`,
- finalize: `url_expand`, `autofix`, `validate_syntax`,
  `materialize_images`, `verifier`, `parse_merge_preflight`,
- preview: `starting`, `preview-ready` och explicita byggfel,
- efterkontroller: klientägda tool-parts med pågående/slutförd state.

Deep Brief och serverorkestrering sker däremot före att SSE-svaret öppnas.
De kan därför inte visas som mätta delsteg i nuvarande transport. En full
barometer från brief till preview kräver early-SSE; UI:t får tills dess bara
säga den ärliga samlingsstatusen att byggunderlaget förbereds.

### B2. "Tänker just nu"-panel (går att bygga oavsett B1)

En panel i chatten under pågående körning med:

- aktuell aktivitet (från de event som redan finns),
- en tidräknare,
- antal skrivna filer när de tickar in,
- mjuka övergångar: shimmer på pågående rad, fade-in per nytt steg.

När körningen är klar fälls panelen ihop till den befintliga
`Slutsteg (N) — visa detaljer`.

**Levererad 2026-07-31 i `feat/live-generation-activity`:**

- `AgentLogCard` är automatiskt öppen medan ett stream- eller tool-steg pågår,
  visar den senaste mätta statusraden, spinner och tidräknare,
- före första SSE-eventet visas den begränsade, sanna statusen
  "Förbereder byggunderlag och startar own-engine",
- färdiga steg får kvitto och aktuell rad markeras som pågående,
- panelen fälls ihop till `Slutsteg (N)` när allt arbete är klart,
- den tidigare raden med roterande produktfakta är borttagen så den inte
  konkurrerar med faktisk runtime-status.

Filantal tickar inte under codegen eftersom strömmen saknar ett sådant event;
antalet blir känt först i finalize. UI:t gissar därför inte.

### B3. Fasbarometer (endast om B1 ger riktiga event) — STRUKEN 2026-07-31

Stegad indikator: brief → plan → generering → normalize → RenderGate → klar,
med aktiv fas markerad. **Lägg in preview-VM-bootet som en egen synlig fas** —
se del C, det är i dag ett dolt väntesteg som ser ut som att inget händer.

Saknas eventen: hoppa över B3 och notera i denna fil varför. Fejka inte faser.

**Struken, byggs inte.** B1:s inventering (ovan) är entydig: Deep Brief och
serverorkestrering sker **innan SSE-svaret öppnas** — de kan därför inte visas
som mätta delsteg i nuvarande transport. En barometer som ändå ritade ut
brief/plan-stegen skulle gissa utifrån väggklocka precis som
`RepairProgressIndicator` redan gör (kodkommentar 749–760: "the phase shown
will lag reality") — dvs se ut som riktig telemetri men vara påhitt. Det är
false-green mot användaren och uttryckligen förbjudet av spelreglerna i
`00-master-plan.md` ("Visa aldrig en fas som inte mäts"). En hederlig
barometer förutsätter early-SSE (event redan innan brief/orkestrering startar)
— utanför scope för denna städning. B2 (redan levererad) täcker det som *går*
att mäta ärligt.

## Del C — Preview-overlayen är tvetydig (N6)

Ägaren trodde spinnern ~5 s in i körningen var en "AI tänker"-symbol. Den är
iframens laddningsoverlay. Sekvensen i dag:

| Läge | Vad användaren ser | Var |
|---|---|---|
| AI genererar | "Genererar kod — AI tänker… preview kommer strax." | `PreviewPanelEmptyState.tsx` 141, 157 |
| Preview-URL finns, iframe laddar | Spinner-overlay "Laddar…" (350 ms debounce) | `PreviewPanelFrame.tsx` 179–186, konstant 44 |
| Efter 6 s | Overlayen **tvingas bort** oavsett om iframen laddat | `LOADING_OVERLAY_HARD_CAP_MS`, rad 51 |

**Problemet:** hard-capen gör att en kall preview-host-boot (>6 s) ger en tom
svart yta **utan** spinner — visuellt identiskt med en trasig preview.
Kodkommentaren (46–50) är medveten om avvägningen, men löser bara halva:
det är rätt att sluta snurra, fel att inte säga något alls.

**Åtgärd:** ersätt "overlay försvinner tyst" med ett ärligt läge efter hard-capen,
t.ex. en diskret rad "Previewn tar längre tid än vanligt — startar miljön…" med
möjlighet att öppna i ny flik eller reparera. Rör inte hard-capen i sig; den
finns för att inte låsa en halvfärdig preview bakom en evig spinner.

Hänger ihop med B3: preview-boot bör vara en synlig fas, inte ett tyst glapp.

**Levererat 2026-07-31.** `PreviewPanelFrame.tsx` visar nu en diskret,
icke-blockerande rad ("Previewn tar längre tid än vanligt — startar miljön…")
med "Öppna i ny flik"- och "Reparera"-länkar när `isLoading` är sant och
hard-capen är nådd. Den försvinner så fort laddningen faktiskt blir klar
(`isLoading` → false) och visas aldrig samtidigt som fel-overlayen (samma
"error wins"-princip som `VersionMismatchOverlay` redan följer). `hardCapReached`/
`LOADING_OVERLAY_HARD_CAP_MS` är oförändrade — bara det tysta glappet efteråt
är stängt. B3 (den riktiga fasbarometern med preview-boot som egen fas) är
struken ovan; den här raden är den ärliga, icke-mätta ersättningen för just
preview-overlayens tysta försvinnande.

## Risker

| Risk | Hantering |
|---|---|
| En snygg barometer som gissar faser | B0 + B1. Hellre färre, sanna steg än många påhittade |
| Statusen flyttas till chatten och göms när chatten är nedfälld | Se fil 03 — den nedfällda raden bär redan `isStreaming`/`statusText`. Koordinera |
| Toasten rivs ut helt och fel-meddelanden försvinner | A3 — bara flödesstatus flyttar |

## Verifiering

```powershell
npm run typecheck
npx vitest run src/components/builder
npm run lint
```

Riktat: `npx vitest run src/components/builder/MessageList.test.tsx`.
Manuellt: kör en riktig generering och bekräfta att status syns i chatten, att
`Slutsteg` finns kvar efteråt, och att en långsam preview inte hamnar i tyst
svart läge.

## Klart när

- [x] Init-brief-statusen syns i chatten, inte som osynlig toast. (A2, 2026-07-31)
- [x] Orsaken till den osynliga toasten är fastställd och åtgärdad (A1, 2026-07-31).
- [x] Chattloggen visar pågående arbete med animation, och `Slutsteg` finns kvar.
      (B2, levererat i #681/#686 — se ovan.)
- [x] B1:s inventering står nedskriven här, och B3 är antingen byggd på riktiga
      event eller struken med motivering. (Struken 2026-07-31, se B3 ovan.)
- [x] En preview som tar >6 s säger något, i stället för att bli tyst svart.
      (Del C, 2026-07-31.)

Alla punkter klara. Filen raderas enligt `plan-lifecycle.mdc` — git-historiken
(`git log --follow -- docs/plans/active/2026-07-30-builder-ui-observation/02-status-under-generering.md`)
är det fullständiga arkivet.
