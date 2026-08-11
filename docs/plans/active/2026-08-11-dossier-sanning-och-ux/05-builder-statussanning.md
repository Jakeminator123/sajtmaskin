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
   - **"När byggdes det?" saknas:** dossier-raden säger status men inte vilken version som
     levererade den (datat finns: version-presence + `fileEvidenceDossierIds`).
   - **F3-utfall kräver tolkning:** "ReleaseGate godkänd" är gate-språk; raden borde säga
     vad användaren FÅR ("integrationerna är inbyggda — X kör live, Y kör demo tills nyckel finns").
3. Skriv förslag per lucka med: vilken BEFINTLIG yta som bär det, vad som samtidigt tas bort,
   och en skiss i text. Lämna till ägaren för go/no-go per punkt (jfr U1–U8-hanteringen).

## Fas B — implementation (efter ägarens OK per punkt)

- Implementera exakt de godkända punkterna, inget mer.
- Statusord hämtas ur `describeDossierStatus`/`dossier-axes.ts` — inga nya strängvarianter.
- Varje borttagen/sammanslagen yta listas i PR-beskrivningen.
- Tester: komponenttest per ändrad yta + uppdaterade befintliga (`PreviewPanelDossiers.test`,
  `F3RequirementsSurface.test`, `BuilderHeader.test`).

## Icke-scope

Nya statusbegrepp, nya färgsystem, toast-ramverk, omdesign av chatten, allt som kräver
ny DB-signal (datat som behövs finns redan i version-presence/snapshot/readiness).

## Verifiering

typecheck + riktade vitest; manuell rök i preview: bygg ett byggblock med nyckel →
se demo-status → spara nyckel → se live-kvitto utan sidladdning; F3-runda → begriplig utfallsrad.

## Definition of done

Fas A-beslutstexten är levererad och ägaren har svarat per punkt; godkända punkter är byggda
med tester; minst en redundant yta borttagen eller sammanslagen; noll nya begrepp;
bugbot-pass dokumenterat.
