# 05 — Builder-UX: man ska fatta vad som hände, vad som är byggt och vad som fungerar

**Mål:** användaren i buildern ska utan förkunskap förstå (a) vad som just hände, (b) vilken
status varje byggblock/version är i, (c) när något byggdes och om det kör demo eller live.
**Byggmodell:** tvåfas — designfasen med stark tänkande modell (t.ex. `claude-opus-5-thinking-xhigh`
**endast efter ägarens kostnads-OK**, annars `claude-sonnet-5-thinking-high`); implementationsfasen
`cursor-grok-4.5` eller sonnet. **Beroenden:** inga (rör builder, inte projektionen) — parallell med 01–04.

## Hård ram (mvp-scope-freeze)

Denna plan får INTE fritt lägga nya visuella ytor. Ordningen är:
**ta bort redundant → slå ihop → förbättra befintligt → (sist, efter explicit ägar-OK) nytt element.**
Noll nya begrepp: bara orden som redan finns i `dossier-axes.ts`/`dossier-overview.ts` får synas.

## Fas A — inventering + förslag (leverans: kort beslutstext till ägaren, ingen kod)

**Status: klar 2026-08-11.** Inventeringen (14 statusytor, sju överlapp) levererades i chatten och
ägaren svarade per punkt — se § Ägarbeslut nedan.

1. Inventera ALLA statusytor i buildern och vad de påstår:
   F3-statusraden (`F3StatusSurface`), kravytan (`F3RequirementsSurface`), Byggblock-popoverns
   badges + gula punkt, versionspanelen, publiceringsknappens lägen (Publicera/Publicera
   ändringar/Publicerad/Bygger), chattens slutsteg ("Planerad — kopplas in i nästa steg"),
   preview-panelens strips. Lista överlapp och motsägelser (samma fakta på två ställen med
   olika ord = kandidat för sammanslagning).
2. Identifiera de tre största "vad hände just?"-luckorna. Kända kandidater från ägarens
   beskrivning och tidigare prodkörningar:
   - **Demo→live-flippen är tyst:** när en nyckel sparas och `Byggd — demo aktiv` blir
     `Byggd — live` finns inget kvitto i närheten av där användaren skrev nyckeln.
   - **"När byggdes det?" saknas:** dossier-raden säger status men inte vilken version statusen
     gäller. Rättelse efter fas A: `fileEvidenceDossierIds` räcker **inte** för "levererades i v4" —
     fältet ligger i chattens orchestration-snapshot med **ett** `lastVersionId` + `capturedAt` för
     hela chattens senaste finalize, inte per byggblock. Det som går utan ny signal är versionens
     identitet: `/dossiers` returnerar redan `versionId` och klienten har `versionNumber` +
     `createdAt` i versionslistan.
   - **F3-utfall kräver tolkning:** "ReleaseGate godkänd" är gate-språk; raden borde säga
     vad användaren FÅR ("integrationerna är inbyggda — X kör live, Y kör demo tills nyckel finns").
3. Skriv förslag per lucka med: vilken BEFINTLIG yta som bär det, vad som samtidigt tas bort,
   och en skiss i text. Lämna till ägaren för go/no-go per punkt (jfr U1–U8-hanteringen).

## Ägarbeslut 2026-08-11 (go/no-go per punkt)

| Punkt | Beslut | Bärande yta (befintlig) | Tas bort samtidigt |
|---|---|---|---|
| Lucka 1 — kvitto när demo blir live | **Ja** | `saveError`-sloten i Byggblock-raden, `DossiersPopoverView.tsx:295-297` | Toasten `Miljövariabler sparade` (`useBuilderVmPreview.ts:213-216`) |
| Lucka 2 — vilken version statusen gäller | **Ja**, med klockslag | Popoverns huvudrad, `DossiersPopoverView.tsx:362-366` | Raden `Version: N kopplade · M fristående` — dubblerar fliken `Inkopplade (N)` och katalogfiltren |
| Lucka 3 — F3-utfall på användarspråk | **Ja, fulla varianten** med räknare | F3-statusraden; strängarna ägs av `PreviewPanelF3Trigger.tsx:238-241` | Kravytans tomma läge (`F3RequirementsSurface.tsx:135-147`); `ReleaseGate var redan godkänd` slås ihop med `ReleaseGate godkänd` |
| Ö2 — tooltipen pekar på en borttagen yta | **Ja**, i samma PR | `use-deploy-domain.ts:57` (+ `useBuilderDeployActions.ts:286`, `:344`) | Formuleringen "Projektets miljövariabler" — panelen togs bort 2026-07-22, nycklar bor i Byggblock |
| Ö6 — död sträng `Verify-lane OK` | **Nej**, till backloggen | — | `SM-031` i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) |

Endast framgångstitlarna i lucka 3 skrivs om. Felutfallen (`ReleaseGate behöver åtgärdas`) behåller
sin formulering — de länkar till diagnostiken, och där är grindens namn rätt ord.

## Fas B — implementation (efter ägarens OK per punkt)

**Status: klar 2026-08-11.** Alla fyra punkter (Lucka 1–3 + Ö2) byggda i `feat/builder-statussanning`.
Borttagningarna (halva poängen): toasten `Miljövariabler sparade` (`useBuilderVmPreview.ts`), raden
`Version: N kopplade · M fristående` (`DossiersPopoverView.tsx`) och kravytans eget tomma läge
(`F3RequirementsSurface.tsx` — synlighet flyttad till `shell-content.tsx`).

- Implementera exakt de godkända punkterna, inget mer.
- Statusord hämtas ur `describeDossierStatus`/`dossier-axes.ts` — inga nya strängvarianter.
- Varje borttagen/sammanslagen yta listas i PR-beskrivningen.
- Tester: komponenttest per ändrad yta + uppdaterade befintliga (`PreviewPanelDossiers.test`,
  `F3RequirementsSurface.test`, `PreviewPanelF3Trigger.test`).

### Två noter som fas B måste läsa först

1. **"Preview" hämtas ur glossaryn, inte ur fantasin.** Ägaren vill att inline-kvittot i lucka 1
   även säger att previewn startas om (informationen som försvinner med toasten). `preview` finns
   inte i `dossier-axes.ts`/`dossier-overview.ts`, men är ett kanoniskt ord i
   [`docs/architecture/glossary.md`](../../../architecture/glossary.md) — hämta det därifrån i
   stället för att hitta på en egen formulering. Skiss:
   `Ifylld — byggblocket är nu "Byggd — live". Previewn startas om med det nya värdet.`
2. **Räknarna vävs in via shell-lagret, inte via en ny hämtning.** Lucka 3 behöver
   `counts.builtLive`/`counts.builtDemo` från `GET /api/engine/chats/[chatId]/dossiers`.
   `PreviewPanelF3Trigger` läser inte den routen i dag och ska inte börja göra det —
   `builder-shell-content/` äger redan både `visibleF3Status` och Byggblock-panelen, så räknarna
   vävs in där. Ingen andra hämtning av samma data.

## Icke-scope

Nya statusbegrepp, nya färgsystem, toast-ramverk, omdesign av chatten, allt som kräver
ny DB-signal — de godkända punkterna klarar sig på version-presence/snapshot/readiness.
Per byggblock: "levererades först i v4" ligger utanför, se rättelsen i fas A.

## Verifiering

typecheck + riktade vitest; manuell rök i preview: bygg ett byggblock med nyckel →
se demo-status → spara nyckel → se live-kvitto utan sidladdning; F3-runda → begriplig utfallsrad.

## Definition of done

Fas A-beslutstexten är levererad och ägaren har svarat per punkt; godkända punkter är byggda
med tester; minst en redundant yta borttagen eller sammanslagen; noll nya begrepp;
bugbot-pass dokumenterat.
