# STATUS 01 — manual rollout + smoke baseline

**Datum:** 2026-04-23
**Miljö:** lokal (`npm run dev`, `localhost:3000`)
**HEAD vid smoke:** _fyll i `git rev-parse HEAD` här_

> Mall — fyll i medan du kör. Orkestratorn använder fynden för att finjustera plan-02-prompten.

---

## 0. Setup-observationer

- **Init-flow friction:** prompt från `/` landar i chat-input på `/builder` men auto-submittar **inte**. Användaren måste klicka send manuellt. Avsiktligt eller bugg? → flaggas till plan 02-spåret.
- **ThinkingOverlay layout-bug:** `src/components/builder/ThinkingOverlay.tsx` är positionerad `absolute inset-x-0 bottom-16` av chat-panelens container i `BuilderShellContent.tsx:851-872`. Den ligger ovanpå de nedersta meddelandena i `MessageList` — alltså döljer den nyligen-streamad reasoning/agentlog visuellt medan AI:n genererar. `pointer-events-none` så klickar går igenom men text blockeras. → bör fixas i samband med plan 02-agentens UI-pass (alternativt en separat liten commit).
- **Element-register edit utan effekt:** Användaren tryckte på `elementregister`-knappen, editerade `heron`-elementet och ändrade "morgon" → "dag". Tillbaka i preview hände **ingenting** — varken committ-bekräftelse eller refresh av iframe. Antingen committas inte ändringen, eller också saknas HMR-koppling från element-register till preview-iframen. → utanför plan 12:s scope, men bör flaggas som follow-up-bug efter wave 3.
- **`versionId: null` i frontend requests:** Nätverkspanel visade en `versionId: null`-rad bland en svärm av `preview-status?versionId=ed0025b9-...` requests. Race condition mellan versionsbyte ELLER state-loss vid HMR. Frontend bör inte skicka `?versionId=null` — antingen vänta in värdet eller skippa requesten. → plan 02-territorium (svag signalering om "jag vet inte vilken version"). Inte värt eskalering till `full`.

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

## Run 2 — INSPECTOR-DRIVEN 3D FOLLOW-UP (ersatte planerad kontaktform)

**Prompt:** `Skapa en 3d-kaffekopp som hoovrar och flyger ovanför` + inspector focus point på `<main>` header
**Verklig längd efter inspector-injection:** 908 tecken
**Version ID:** `6d942b89-6730-4f4a-82ab-cbb447877678`
**Base version preserved:** `c7bad76a-...` ✅ (delta-operation, inte re-init)
**Tidpunkt:** 22:20:59 → 22:24:49 (228s totalt)
**Klassning i logg:** `promptType: followup_technical`, `followUpIntent: neutral`

### Versionsmodal — statuskedja
- transfer / install / start: snabbt → `running`
- F2: passerade
- F3 quality-gate: skippad (`design_preview_skip_verify` — avsiktligt enligt cleanup-vågens F2-lane-slim)
- 21 mekaniska autofixes + 1 LLM-fixer-pass (löste `Unexpected }` i `coffee-cup-3d.tsx`)
- **Slutstatus: `Promoted`** (grön)

### Slutstatus i UI
- modal visar: **grön/promoted** — ärlig genom hela kedjan
- iframe visar visuellt: **funkar** — sajten renderar
- "preview funkar men modal säger error"?: **NEJ** — modal var ärlig

### 🔥 STORT FYND för plan 07 (3D capability)

LLM:n levererade ett **skenbart 3D-svar utan riktig 3D**:
- `components/coffee-cup-3d.tsx` skapades (namn-3D)
- Importerade från `./coffee-cup-scene` — **filen skapades aldrig**
- `cross-file-import-checker` upptäckte missing import och **auto-stubbade den** → bygget gick igenom
- **Inget** `three` eller `@react-three/fiber` i package.json
- **Inget** `capability_refresh: 3d_scene` i timeline
- **Ingen** dossier-injection för r3f/three
- `followUpIntent: neutral` (inte `capability-add`)

→ Plan 07 är **starkt `full`**. Det är exakt det anti-pattern plan 07 ska lösa ("3D ska inte vara specialmagi"). Systemet pretenderar att leverera 3D men gör det inte.

### Fynd för plan 06 (Deep Brief / delta-contract)

- `baseVersionId` bevarades korrekt → delta-semantiken finns redan i basen ✅
- MEN `followUpIntent` klassades `neutral` istället för `capability-add` trots tydlig capability-signal ("3d") → follow-up-classifier behöver capability-aware-detection
- → plan 06 är `short-medium`: kontraktet finns, men capability-signaling-bryggan till plan 07 saknas

### Fynd för plan 04/05 (fixer-surface)

- `cross-file-import-checker` syntes inte i agentens fixer-matrix → **bekräftar STATUS-04-AUDIT.md**: matrisen är ofullständig
- Auto-stubbing är en `keep`-fixer men maskerar generation-quality-fel: borde signaleras tydligare i UI så användaren förstår "3D-filen finns men är tom"

### Klassificering
- Fidelity 2 nådd? **ja** (sajten renderar)
- Riktig 3D nådd? **nej** (skennr-3D)
- Falskt rött fel? **nej** (modal var ärlig)
- Plan 07 i ljuset av detta: **starkt `full`, hög prioritet**
- Plan 06 i ljuset av detta: **`short-medium`** (delta finns, capability-signaling fattas)
- Plan 02 i ljuset av detta: **fortsatt `short`** (modal-truth funkar)

---

## Run 3 — KONTAKTFORM (followup_general)

**Prompt:** `lägg till en kontaktform`
**Verklig längd:** 143 tecken (med system-context wrapping)
**Version ID:** `ed0025b9-cc9e-425e-9988-4b530994574f`
**Tidpunkt:** 22:34:18 → 22:36:29 (128s totalt)
**Klassning i logg:** `promptType: followup_general` ✅ (korrekt — inte `followup_technical`)

### Versionsmodal — statuskedja
- transfer / install / start: snabbt → `running`
- F2: passerade
- F3: skippad (`design_preview_skip_verify`, samma som run 2)
- Mekaniska fixers: 0
- LLM-fixer-pass: 0
- **Slutstatus: `Promoted`** (grön)

### Slutstatus i UI
- modal visar: **grön/promoted** — clean run, inga fix-pass behövdes
- iframe visar visuellt: **funkar** — kontaktform finns på sidan
- "preview funkar men modal säger error"?: **NEJ**

### 🔥 STORT FYND för plan 03 — nedjusterar planen

Klassificeringen funkar: `followup_general` för en feature-add, `followup_technical` för auto-repair och inspector-driven 3D. Det betyder att plan 03:s ursprungliga hypotes ("dåligt klassad / fel severity") måste **vässas**:

- **`followup_technical` är inte fel klass** för auto-repair eller capability-add
- **Den verkliga buggen** är att auto-repair-passet maskeras som user-driven follow-up med klen reason-text ("Registry-data bevarad oförändrad" — säger inget om att det är auto-repair)
- → plan 03 bantas från `full` till **`short`**: kirurgisk reason-string + UI-skylt "auto-repair" istället för "follow-up"

### Klassificering
- Fidelity 2 nådd? **ja**
- Falskt rött fel? **nej**
- Plan 03 i ljuset av detta: **`short`** (kirurgisk fix, inte stor verifier-överhalning)

---

## Sammanfattning + plan-justeringar

### Plan-tabell efter smoke

| Plan | Före smoke | Efter smoke | Motivering |
|---|---|---|---|
| 02 modal-truth | full-pending | **`short`** | Modal var ärlig genom alla 3 runs. Ingen falsk röd. ThinkingOverlay-fix + tester räcker. |
| 03 followup_technical | full-pending | **`short`** | Klassificering funkar (`followup_general` för kontaktform, `followup_technical` för repair/3D). Bara auto-repair-labeling behöver kirurgisk fix. |
| 06 Deep Brief / delta | short-likely | **`short-medium`** | `baseVersionId` bevaras korrekt, delta funkar. Saknas: capability-aware classifier (3D-promptar → `capability-add` istället för `neutral`). |
| 07 3D capability | full | **`full` + hög prio** | LLM:n levererade skennr-3D utan three/r3f. `cross-file-import-checker` stubbade missing scene-fil. Inget capability-detection, ingen dossier, ingen package-update. |
| 04, 05, 08–12 | oförändrade | oförändrade | Smoke gav ingen ny info som ändrar dem. |

### Behövs deploy till live?
**Nej.** Allt reproducerades lokalt på `npm run dev`. Plan 01 går klart utan `vercel deploy`.

### Top användarsymptom som faktiskt finns kvar

1. **3D fungerar inte på riktigt** — sajten "promotas" trots att 3D-komponenten är ett tomt skal. Användaren tror den fick 3D, det är ren placebo. (plan 07)
2. **CORB blockar Unsplash-bilder** — bilder visas inte, alt-text ligger som placeholder. (plan 06)
3. **Auto-repair maskerar sig som user-driven follow-up** — användaren ser plötsligt en "ny generering" utan att förstå varför. (plan 03)
4. **Inspector orsakar scroll-to-top** — kan inte markera element längre ner på sidan.
5. **Element-register edits committas inte** — ändring i element-register hade ingen effekt i preview.
6. **Latency:** init-stream 378s, quality-gate 91s — kandidater för plan 10.

### Klart ✅
- [x] alla 3 runs körda
- [x] modal-statuskedjorna noterade (alla ärliga)
- [x] plan 02/03/06/07-bedömningarna fyllda
- [x] orkestratorn meddelad: ja, plan 01 är klart
