---
id: 2026-06-19-inspector-rendering-arkitektur
status: in-progress
created: 2026-06-19
linear: null
parent: null
supersedes: null
---

# Inspector ("Inspektera preview") — rendering-arkitektur

Beslutsunderlag för element-markeringen med musen i preview-panelen. Två vägar:
**A)** lyfta den gamla inspector-workern till ett nytt render-konto (eng. *render account*, hosting-konto), och **B)** en smartare väg utan separat renderinstans. Kod är source of truth; allt nedan är verifierat mot repo 2026-06-19.

---

## Nuläge (verifierat)

| Fakta | Var |
|---|---|
| Knappen "Inspektera preview" syns (flagga defaultar **på**) | `inspector-feature.ts` (`NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR` osatt i prod) |
| Tre engines: `map` (default), `capture`, `ai` | `usePreviewPanelInspectCapture.ts` |
| `map` + `capture` kräver Playwright (eng. *headless browser*, browser utan fönster) | `/api/inspector-element-map`, `/api/inspector-capture` |
| I serverless (Vercel) → 503 om ingen worker | `IS_SERVERLESS = Boolean(process.env.VERCEL)` i båda routes |
| **`INSPECTOR_CAPTURE_WORKER_URL` saknas i prod** (alla env) | Vercel `sajtmaskin` env-lista |
| → `map`/`capture` funkar **inte** i prod idag | följd av ovan |
| `ai` funkar i prod (bara `OPENAI_API_KEY`, som finns) | `/api/inspector-ai-match` |
| Riktig preview serveras av preview-host på Fly | `SAJTMASKIN_PREVIEW_HOST_BASE_URL` satt → `vm-fly-jakem.fly.dev` |

---

## Den centrala insikten: musen behöver ingen *live* renderinstans

Din fråga: "musens koordinater måste väl samspela med någon instans som mappar dem mot DOMen?" — **Ja, men bara en gång, inte per musrörelse.**

```
map-engine idag:
  toggle on ──► POST /api/inspector-element-map ──► (Playwright laddar URL EN gång,
                                                      returnerar ALLA element + bounding box i %)
  mousemove ──► matchas 100% KLIENT-SIDA mot den cachade kartan  (ingen server-träff)
  click     ──► matchas mot klient-sidans JSX-register            (ingen server-träff)
```

`handleInspectMouseMove` itererar bara den redan hämtade `elementMap` i webbläsaren. Servern (Playwright/worker) behövs alltså **enbart som engångskälla för element-rutorna**. Det är hela hävstången för Option B: om previewn själv kan rapportera sina element-rutor försvinner behovet av en separat renderinstans helt.

---

## Option A — lyft den gamla inspector-workern till nytt render-konto

Konservativ väg: allt annat lika, bara få igång det som redan finns.

### Vad workern är

- Kod: `services/inspector-worker/server.mjs` (Node + Playwright).
- Docker: `services/inspector-worker/Dockerfile` (bas `mcr.microsoft.com/playwright:v1.58.2-jammy` → Chromium förinstallerad).
- Endpoints: `GET /health`, `POST /capture`, `POST /element-map`.
- Auth: header `x-inspector-token` jämförs mot `INSPECTOR_CAPTURE_WORKER_TOKEN` (sätts den inte → oautentiserad).
- Lyssnar på `process.env.PORT || 3310` (Render injicerar `PORT` → funkar direkt).

### Roadmap (steg)

1. **Nytt render-konto** → skapa **Web Service**, runtime **Docker**, root dir `services/inspector-worker` (Dockerfile auto-detekteras).
2. **Instanstyp:** minst ~1 GB RAM — Chromium OOM:ar (eng. *out of memory*, minnesslut) på 512 MB-instanser. Ingen disk behövs (stateless).
3. **Health check:** path `/health` (returnerar `{ ok: true, playwright: true }`).
4. Sätt **worker-env** (se matris). Deploya. Notera publik URL `https://<svc>.onrender.com`.
5. Verifiera: `curl https://<svc>.onrender.com/health` → 200.
6. Sätt **app-env** på Vercel (`sajtmaskin`), targets Production + Preview + Development.
7. Redeploya appen (eller låt nästa deploy plocka upp env). Öppna builder → preview → "Inspektera preview" → elementkartan ska ladda (ingen `inspectorUnavailable`).

### Env-matris

**På workern (nya render-kontot):**

| Env | Värde | Krav |
|---|---|---|
| `PORT` | (Render sätter automatiskt) | auto |
| `INSPECTOR_CAPTURE_WORKER_TOKEN` | `<hemlig sträng>` | bör (annars öppen) |
| `INSPECTOR_CAPTURE_NAVIGATION_TIMEOUT_MS` | `25000` | valfri (default) |
| `INSPECTOR_CAPTURE_NETWORK_IDLE_TIMEOUT_MS` | `8000` | valfri (default) |
| `INSPECTOR_CAPTURE_MAX_BODY_BYTES` | `64000` | valfri (default) |

**På appen (Vercel `sajtmaskin`, alla tre targets):**

| Env | Värde | Krav |
|---|---|---|
| `INSPECTOR_CAPTURE_WORKER_URL` | `https://<svc>.onrender.com` | **ja** — utan denna 503 i serverless |
| `INSPECTOR_CAPTURE_WORKER_TOKEN` | samma hemlighet som workern | ja (om workern kräver token) |
| `INSPECTOR_FORCE_WORKER_ONLY` | `1` | rekommenderad — gör 503 ärligt ("worker nere") istället för att låtsas om lokal fallback |
| `INSPECTOR_CAPTURE_WORKER_TIMEOUT_MS` | `7000` | valfri — höj vid cold-start |

> Anropet app → worker är server-till-server (från Vercel route handlers), så **ingen CORS** (eng. *cross-origin resource sharing*, regler för anrop mellan domäner) behövs. Skydda i stället med token.

### Givna säkra förbättringar (om du ändå är inne)

- **CSP `frame-src`** saknar `*.fly.dev` (report-only-varning idag, se `preview-host/README.md`). Lägg till så Fly-previewn inte loggar CSP-brus. Påverkar inte workern (server-side), bara iframe-visningen.
- Sätt **token** på workern (utan blir `/capture` + `/element-map` en öppen SSRF-yta; `isDisallowedHost` blockerar redan privata IP:n men token är gratis härdning).

### Caveats

| Risk | Effekt |
|---|---|
| Render free-tier somnar efter idle | Cold-start 30–60 s → elementkartans retry-loop (2/3/5 s) hinner ge upp → "otillgänglig" första gången. Välj always-on eller keep-alive-ping. |
| Chromium RAM | <1 GB → OOM vid `chromium.launch`. |
| Andra-render | Workern laddar previewn en **andra** gång headless (preview-host renderar redan) → dubbelarbete, se Option B. |

---

## Option B — smartare: instrumenterad preview + `postMessage`-brygga (skiss)

Eftersom preview-hosten **redan renderar** sajten, låt previewn själv svara på "vad ligger under muspekaren?". Då behövs **ingen separat renderinstans alls** (inget nytt render-konto, ingen Playwright).

### Arkitektur

```
Builder (sajtmaskin.vercel.app)          Preview (vm-fly-jakem.fly.dev/<chatId>)
  │  iframe                                 │  injicerat inspector-script (~2 kB)
  │                                         │
  │ ── postMessage{set-mode:on} ──────────► │  aktiverar hover/klick-lyssnare
  │                                         │  mousemove → document.elementFromPoint(x,y)   (SAME-ORIGIN mot sig själv → funkar!)
  │ ◄──── postMessage{hover, element,rect} ─┤  ritar egen highlight i previewn
  │  (parent ritar ev. label / token)       │
  │ ◄──── postMessage{pick, element} ───────┤  vid klick
  ▼                                         
dispatchInspectCaptureEvent(...)  ──►  chat-token   (DENNA del återanvänds oförändrad)
```

Nyckeln: previewn är **same-origin mot sig själv**, så `elementFromPoint` ger pixel-exakt träff utan Playwright, utan 300-element-tak, i realtid. Bryggan mellan olika domäner görs med `postMessage` (eng. *cross-origin messaging*, säkra meddelanden mellan domäner), som funkar trots att iframen är cross-origin.

### Injektionspunkter

| Preview-typ | Var injicera scriptet |
|---|---|
| Tier-2 (Fly, primär) | I proxy-lagret i `preview-host/src/runtime.js` — lägg till `<script>` i `text/html`-svar (samma ställe som redan patchar `next.config`). Framework-agnostiskt. |
| Own-engine shim (`/api/preview-render`, default av) | I `<head>` i `build-preview-document.ts` (vår egen HTML-mall → trivialt). |
| Extern URL (tredje part) | Går **inte** att injicera → faller tillbaka på `ai`-engine (redan serverless-säker). |

### `postMessage`-kontrakt (förslag)

```js
// parent → preview
{ type: "sajtmaskin:inspect:set-mode", enabled: true }

// preview → parent
{ type: "sajtmaskin:inspect:hover", element: { tag, id, className, text, selector, rect }, viewport: { w, h } }
{ type: "sajtmaskin:inspect:pick",  element: { tag, id, className, text, selector, rect } }
```

**Origin-säkerhet:** parent postar med explicit `targetOrigin` (preview-origin); previewn verifierar `event.origin` mot app-origin + betrodd suffix. Återanvänd befintlig `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=fly.dev` som allowlist.

### Builder-ändringar

- Ta bort den täckande klick-overlayn i inspect-läge (`absolute inset-0 z-20`) så muspekaren når iframen.
- Lägg `window.addEventListener("message", …)` som tar emot hover/pick.
- `pick` → återanvänd `dispatchInspectCaptureEvent` → chat-token (allt nedströms oförändrat).
- Engine-val blir: `instrumented` (default när previewn är own/tier-2) | `ai` (fallback för externa URL:er).

### Vad som försvinner / behålls

| Tas bort | Behålls |
|---|---|
| `services/inspector-worker/` + `infra/inspector-worker/` | `/api/inspector-ai-match` (extern fallback) |
| `/api/inspector-element-map`, `/api/inspector-capture` | `dispatchInspectCaptureEvent` → chat-token |
| `playwright`-beroendet i appen | JSX-element-register-matchningen (frivillig) |
| Behovet av nytt render-konto + dess env | — |

### Env för B

I princip **inga nya** krävs. Frivilligt en rollout-flagga `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE=1`. Återanvänder `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` för origin-allowlist.

### Caveats

- Kräver en kodändring i preview-hosten (injektion) + builder-bryggan — mer engångsarbete än Option A, men noll löpande infra.
- CSP `frame-src` bör ändå få `*.fly.dev` (samma fix som i A).
- Externa (icke-egna) preview-URL:er kan inte instrumenteras → `ai`-fallback gäller där.

---

## A vs B

| Dimension | A: render-worker | B: instrumenterad preview |
|---|---|---|
| Ny renderinstans / konto | **Ja** (det du ville byta konto för) | **Nej** |
| Löpande kostnad | Render-instans dygnet runt (+ ev. Fly) | 0 (kör i befintlig preview) |
| Latency hover | Engångs Playwright-laddning (cold-start-risk) | Realtid, ingen serverträff |
| Funkar i prod | Ja, om worker uppe | Ja, för egna/tier-2-previews |
| Precision | DOM via re-render, 300-element-tak | Pixel-exakt, inget tak |
| Underhåll | Egen tjänst + Playwright-uppgradering | Ett litet injicerat script |
| Externa URL:er | Ja | Nej → `ai`-fallback |
| Engångsarbete | Litet (deploy + env) | Måttligt (kod i 2 lager) |

---

## Rekommendation

**B är den smartare och billigare vägen och tar bort konto-bytesfrågan helt.** Den täcker 95%-fallet (egna/tier-2-previews) i realtid utan infra; externa URL:er faller tillbaka på den redan fungerande `ai`-engine. Option A är vettig bara om du **snabbt** vill ha nuvarande design live denna vecka, eller måste inspektera godtyckliga externa sajter med pixel-precision.

**Minsta steg om B väljs:** injicera inspector-scriptet i `preview-host/src/runtime.js`-proxyn → lägg `message`-lyssnare + ta bort täckande overlay i `PreviewPanel` → mappa `pick` till `dispatchInspectCaptureEvent` → bakom `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE` tills verifierad → ta bort worker + Playwright-routes.

**Minsta steg om A väljs:** deploya `services/inspector-worker` på nytt render-konto (≥1 GB RAM, `/health`) → sätt worker-env + app-env enligt matriserna → verifiera `/health` + elementkarta i builder.

---

## Implementerat (Option B, branch `feat/inspect-bridge`)

Levererat **additivt** och **default av** — `map`/`capture`/`ai` orörda, inga filer raderade (worker + Playwright-routes lever kvar tills bryggan verifierats live). Reversibelt: flaggor av = exakt dagens beteende.

### Nya/ändrade filer

| Fil | Roll |
|---|---|
| `src/lib/builder/inspect-bridge-feature.ts` | flagga `isInspectBridgeEnabled()` + postMessage-konstanter + route/param-namn |
| `src/lib/builder/inspect-bridge-script.ts` | injicerat script (IIFE: `elementFromPoint`, self-highlight, postMessage) — single source of truth |
| `src/app/api/inspect-bridge/route.ts` | serverar scriptet (404 när flaggan av) |
| `hooks/usePreviewInspectBridge.ts` | parent-sida: set-mode-post, origin-validerad `message`-lyssnare, `pick` → chat-token + kodträff + filträd-tie-in |
| `PreviewPanel.tsx` | `bridge`-engine, opt-in `?inspect=1` på previewSrc, döljer täckande overlay i bridge-läge |
| `usePreviewPanelInspectMapPlacement.ts` | hoppar Playwright-element-map när engine=`bridge` |
| `build-preview-document.ts` | shim-injektion (same-origin, flagg-gated) |
| `preview-host/src/runtime.js` | opt-in proxy-injektion: buffrar HTML-svar **bara** vid `?inspect=1` + satt `SAJTMASKIN_APP_ORIGIN`, annars ren passthrough |

### Env (båda default av → inert)

| Env | Var | Värde | Effekt |
|---|---|---|---|
| `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE` | Vercel-appen | `1` | bridge-engine + injektion-opt-in + serverar scriptet |
| `SAJTMASKIN_APP_ORIGIN` | preview-host (Fly) | `https://<app-origin>` | källa för injicerat script + tillåten parent-origin. **Från env, aldrig query** (inget injektionshål). Osatt → preview-hosten injicerar inget. |

### Avvikelser från skissen (medvetet)

- **Inga raderingar** av worker/`/api/inspector-*` ännu — eget städpass efter live-verifiering (reversibelt nu).
- Origin-validering mot previewUrl:ens **exakta origin** (strikt) i stället för suffix-allowlist.
- Proxy-injektionen hoppar **komprimerade** svar (passthrough) — säkrare än gzip-patch.
- Filträd-tie-in: `pick` återanvänder befintliga registry-select-vägen (samma som "visa kodträff") → byter till Kodvy + scrollar till rad.

### Manuell verifiering (agent kan ej köra — builder-coexistence)

1. App-env `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE=1` + preview-host-env `SAJTMASKIN_APP_ORIGIN=<app-origin>` + redeploy preview-host.
2. Builder → tier-2-preview → "Inspektera preview".
3. Hovra: grön ruta ritas **inne** i previewn, pixel-exakt.
4. Klicka: punkt i chatten (toast) + Kodvy hoppar till matchad fil + rad.
5. Flagga av / env osatt: som idag (map/ai), ingen `?inspect=1`, ingen injektion.

### Återstår (eget pass)
- CSP `frame-src`/`script-src` för `*.fly.dev`/app-origin om previewens CSP blockerar scriptet.
- Borttag av worker + Playwright-routes när bryggan ersatt dem i prod.
- Verifiering + ev. commit/push/PR (ej gjort — inväntar ok).
