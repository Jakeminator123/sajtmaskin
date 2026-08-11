# 04 — Backoffice: Systemkarta som nav, editering i samma flöde, färre flikar

**Mål:** ägaren ska från backoffice kunna SE alla dossiers och alla lägen (klass, F2-disposition,
demoläge, build/server-krav, env-kontrakt, verifiering) och EDITERA/skapa/radera/flytta —
utan att antalet flikar eller begrepp växer.
**Byggmodell:** medel-hög (`claude-sonnet-5-thinking-high`). **Beroenden:** plan 01 mergad
(Systemkartan finns då); plan 02 om mergad förenklar (annars behåll befintliga labels-anrop).

## Princip

Checkpointens Systemkarta är en bra LÄSyta. Denna plan gör den till NAV: från varje rad ska man
kunna gå direkt till handling. Konsolidering före addition — slutresultatet får ha **högst lika
många flikar som i dag** (Översikt, Lista, Systemkarta, Redigera, Skapa, Kontroller = 6 efter
checkpointen; målet är ≤5).

## Steg

1. **Konsolidera Översikt → Systemkarta.** Översiktens fyra mättal är en delmängd av
   Systemkartans fem. Flytta ev. unika element in i Systemkartan och radera Översikt-fliken.
   (Lista behålls: den är arbetsyta för bulk-läsning; Systemkartan är samband + filter.)
2. **Rad → detalj → handling.** Klick på en dossier-rad (eller expander per rad) visar:
   manifestets fält (etiketter ur samma källa som buildern), filerna med roller,
   env-kontraktet per nyckel, demoläget, verifieringsstatus — och knappar
   "Redigera", "Byt capability" (= flytta familj; gruppen följer med automatiskt), "Radera"
   som hoppar till befintliga, redan schemavaliderade flöden med dossiern förvald.
   Bygg INTE nya skrivvägar — återanvänd `_apply_manifest_field_edits`,
   `_apply_capability_override`, `_delete_dossier_dir` (fail-closed-kedjan orörd).
3. **Koppla in flash + rerun.** `_render_dossier_flash`/`_rerun_after_dossier_mutation`
   (finns i io.py sedan checkpointen) anropas efter varje lyckad create/edit/delete/promotion
   så alla flikar ser mutationen i samma interaktion.
4. **Lägen som lärs ut där de syns.** Kolumnrubrikerna F2/Demoläge/Build-server-krav får
   behålla checkpointens "Så läses axlarna"-expander; texten ska vara samma vokabulär som
   builderns tooltips (`dossier-axes.ts`-orden via projektionen).
5. **Grafen:** behåll DOT-grafen men gör den filterföljande (redan) och verifiera att den
   är läsbar vid 18+ dossiers; om den blir gröt — gruppera per kategori-subgraf.

## Icke-scope

Inga nya begrepp, ingen ny skrivlogik, ingen dra-och-släpp (Streamlit bär det inte utan
tredjepartslib — avvisa hellre än att dra in ny dependency).

## Raderingar (listas i PR:en)

- Översikt-fliken (innehåll uppgår i Systemkartan)
- ev. dubblerade mättal/captions i Lista

## Verifiering

`python -m pytest backoffice/`; `npm run backoffice:test`; manuell rök i Streamlit:
se dossier → redigera fält → spara → flash + uppdaterad karta i samma interaktion;
radera-flödet kräver fortfarande id-bekräftelse; capability-byte flyttar raden till rätt grupp.

## Definition of done

Systemkartan är navet; alla lägen syns per dossier; editering/skapa/radera/flytta nås därifrån
via befintliga validerade flöden; flikantal ≤ dagens; raderingslista i PR:en; bugbot-pass dokumenterat.
