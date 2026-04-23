# STATUS 01 — manual rollout + smoke baseline

**Datum:** 2026-04-23
**Miljö:** lokal (`npm run dev`, `localhost:3000`)
**HEAD vid smoke:** _fyll i `git rev-parse HEAD` här_

> Mall — fyll i medan du kör. Orkestratorn använder fynden för att finjustera plan-02-prompten.

---

## 0. Setup-observationer

- **Init-flow friction:** prompt från `/` landar i chat-input på `/builder` men auto-submittar **inte**. Användaren måste klicka send manuellt. Avsiktligt eller bugg? → flaggas till plan 02-spåret.
- **ThinkingOverlay layout-bug:** `src/components/builder/ThinkingOverlay.tsx` är positionerad `absolute inset-x-0 bottom-16` av chat-panelens container i `BuilderShellContent.tsx:851-872`. Den ligger ovanpå de nedersta meddelandena i `MessageList` — alltså döljer den nyligen-streamad reasoning/agentlog visuellt medan AI:n genererar. `pointer-events-none` så klickar går igenom men text blockeras. → bör fixas i samband med plan 02-agentens UI-pass (alternativt en separat liten commit).
- _annat innan första prompt:_

---

## Run 1 — INIT

**Prompt:** `bygg en landningssida om kaffe`
**Project ID:** `-tMYTnv6iQlvuioXnEcwa`
**Chat ID:** `b81a54bc-ebd0-4434-b164-3311633b1c52`
**Version ID:** `c7bad76a-3572-48c8-8d51-1ad342280547`
**Tidpunkt:** 22:03 (init) → 22:11:54 (stream summary, 378s) → 22:13:28 (verify finished) → 22:17:08 (slutstatus done)

### Versionsmodal — statuskedja
- transfer / install / start: snabbt → `running`
- F2 evaluation: passerade (preview tillgänglig + iframe live)
- F3 quality-gate: **failade på typecheck** — `components/order-dialog.tsx(8,15): TS2305: Module '"@/components/ui/button"' has no exported member 'ButtonProps'`
- Repair-lanen triggades automatiskt → klassad internt som `followup_technical` med `Orsak: Registry-data bevarad oförändrad`
- Slutstatus: `klart att deploya` (grön efter repair)

### Slutstatus i UI
- modal visar: **gul → "Repairing" → grön ("klart att deploya")**
- iframe visar visuellt: **funkar** (preview live medan repair körde i bakgrunden)
- "preview funkar men modal säger error"?: **NEJ** — modal var ärlig (gul medan repairing, grön efter), F2 överskuggades inte av F3

### Beteende-fynd

1. **🔥 Stort fynd för plan 03:** Auto-repair triggas internt som ett synthetic `followup_technical`-pass MED full prompt (2327 tecken: hela "AUTO-FIX REQUEST — TARGETED REPAIR…"). I UI ser det ut som att en helt ny generering kickar igång oprovocerat. Användaren vet inte varför. → Plan 03:s fel-signalering bekräftas: skip-reason eller event-typen är fel. Det är **inte en skip** — det är en repair-pass som låtsas vara user-driven follow-up.
2. **Latency:** Init-stream `durationMs: 378222` (6,3 min). Quality-gate-anrop tog `91s`. → Plan 10-mat.
3. **Failed POST `/preview-session`** vid `useBuilderVmPreview.ts:278` — verkar transient (preview kom upp ändå) men värt att verifiera.
4. **CORB blockade Unsplash-bild** — LLM:n genererade en `<img src="https://images.unsplash.com/...">` som browsern blockar via CORS. Sajten visas utan bilden. → Plan 06 / dossier-territorium: bild-strategi behöver tydligare default.
5. **ButtonProps-felet är återkommande** i registry-historik (history.ndjson visar liknande typecheck-fel i tidigare runs på andra chats). → kandidat för plan 04 unknown-listan eller en ny mekanisk fixer (ButtonProps borttogs ur shadcn vid någon punkt).

### Klassificering
- Fidelity 2 nådd? **ja**
- Falskt rött fel? **NEJ** (modal var ärlig genom hela kedjan)
- Plan 02 i ljuset av detta: **lutar mot `short`** (modal-truth verkar redan funka i denna run; men vänta in run 2/3 innan slutbedömning)
- Plan 03 i ljuset av detta: **stark `full`** (auto-repair labeling-bug bekräftad)

---

## Run 2 — TEKNISK FOLLOW-UP

**Prompt:** `lägg till en kontaktform`
**Project:** _samma_
**Tidpunkt:** 

### Versionsmodal — statuskedja
- transfer: 
- install: 
- start: 
- iframe live: 
- F2 evaluation: 
- F3 (om visad): 

### Slutstatus i UI
- modal visar: 
- iframe visar visuellt: 
- finns det "preview funkar men modal säger error"?: 

### Specifikt för plan 03 (followup_technical)
- klassificeras detta som `followup_technical` i logg/UI?: **ja/nej/okänt**
- får det rätt severity (warning/info/error)? 
- är skip-reason begriplig om det skippades? 

### Klassificering
- Fidelity 2 nådd? 
- Falskt rött fel? 

---

## Run 3 — 3D-PIZZA FOLLOW-UP

**Prompt:** `skapa en 3D-figur på en pizza som svävar över förstasidan`
**Project:** _samma_
**Tidpunkt:** 

### Versionsmodal — statuskedja
- transfer: 
- install: 
- start: 
- iframe live: 
- F2 evaluation: 
- F3 (om visad): 

### Slutstatus i UI
- modal visar: 
- iframe visar visuellt: 
- finns det "preview funkar men modal säger error"?: 

### Specifikt för plan 07 (3D-capability)
- detekterades capability `3d_scene` (synligt i logg)?: 
- installerades `@react-three/fiber` eller motsvarande?: 
- monterades en canvas/WebGL i sidan?: 
- renderas något 3D visuellt i previewn?: 
- "THREE.WebGLRenderer: Context Lost" sågs redan i Run 1 — händer det igen här?: 

### Klassificering
- Fidelity 2 nådd? 
- Falskt rött fel? 

---

## Sammanfattning + plan-justeringar

### Vilka planer kan kortas till `short` baserat på smoke?
- **Plan 02:** _full / short / skip_ — motivering:
- **Plan 03:** _full / short / skip_ — motivering:
- **Plan 07:** _full / short / skip_ — motivering:
- **Plan 06:** _full / short / skip_ — motivering:

### Behövs deploy till live för att reproducera något?
- **Ja/Nej** — _vilket scenario isåfall_

### Top 3 användarsymptom som faktiskt finns kvar
1. 
2. 
3. 

### Klart =
- [ ] alla 3 runs körda
- [ ] modal-statuskedjorna noterade
- [ ] plan 02/03/07/06-bedömningarna fyllda
- [ ] orkestratorn meddelad: "klar med 01"
