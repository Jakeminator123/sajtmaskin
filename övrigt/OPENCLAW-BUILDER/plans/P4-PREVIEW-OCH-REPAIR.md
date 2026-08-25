# P4 — kandidatpreview och repair

## Mål

Ge agenten en begränsad observe→repair-loop utan att flytta officiell
previewpointer eller gå runt befintliga gates.

## Leveranser

- candidate-preview med separat identitet/workspace
- readiness och bounded events
- scrubbed runtime logs
- versionspinnad screenshot
- max två preview-/repairvarv
- reason-coded stopp/fallback
- submit till befintlig finalize efter lyckad kandidatfas

## Arbetssteg

1. Definiera candidate-preview-kontrakt bredvid, inte inuti, live session.
2. Materialisera exakt workspace revision.
3. Returnera readiness + evidence receipt.
4. Låt modellen ändra bara evidensrelevanta filer.
5. Stoppa efter budget och skicka bästa säkra kandidat eller fallback.
6. Kör huvudappens CAS och befintlig finalize.
7. Skapa alltid draftversion; promotion följer vanliga lifecycle-regler.

## Acceptans

- candidate preview kan inte ändra `preview_url` eller aktiv sessionpointer
- screenshot/loggar matchar exakt kandidat- och workspace revision
- maxloop kan inte kringgås med retry
- persisted kandidat passerar samma finalize/merge/preflight/gates som classic
- agenten kan aldrig själv sätta promoted eller deploya

## Stoppskäl

- live och candidate delar muterbart workspace
- logg/screenshot saknar revisionsproveniens
- agentcheck betraktas som officiell ReleaseGate
