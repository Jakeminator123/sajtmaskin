# Fas 3 — Preview, VM och Deploy (pedagogisk genomgång)

Syfte: förstå vad som händer efter att Fas 2 sparat en version —
från `done`-eventet till att användaren ser en levande sajt i iframen.

---

## Ordlista — vanliga ord i Fas 3

| Ord | Vad det betyder | Förväxlingsrisk |
|-----|-----------------|-----------------|
| **Preview-host** | Fly.io VM-tjänst som kör `npm install` + `npm run dev` på genererad kod | Förväxlas med "preview" generellt — preview-host är en specifik VM-tjänst |
| **Tier-2 preview** | Den riktiga live-previewn i en VM (Fidelity 2) | Förväxlas med tier-1 shim (legacy, bara statisk HTML) |
| **Tier-1 shim** | `/api/preview-render` — äldre, statisk HTML-preview utan Next.js-runtime | Legacy. Inte standardvägen. |
| **Fidelity 2** | Kvalitetsnivå: sajten kör i riktig Next.js dev-server, interaktiv | — |
| **Preview-session** | En aktiv VM-instans med session-ID, TTL ~1 timme, heartbeat | — |
| **`done`** | SSE-event: versionen är *sparad*. Betyder INTE att preview är klar. | Förväxlas med "allt klart" — preview startar efter `done` |
| **`preview-ready`** | SSE-event: preview-sessionen är uppe och URL:en är klar | — |
| **`previewPending`** | Boolean state: "preview håller på att starta" | Förväxlas med "laddning" — det är en signal från servern, inte ett UI-state |
| **Quality gate** | typecheck/lint/build i preview-hostens **verify-lane** (separat från live-preview) | Förväxlas med verifier-pass (Fas 2) — quality gate kör i VM, verifier kör i finalize |
| **Server-verify** | Bakgrunds-verifiering + ev. repair efter finalize. Blockerar inte `done`. | — |
| **Repair loop** | Automatisk reparation: autofix → LLM-fixer → quality gate → promote/fail | — |
| **Bootstrap** | Klient-side POST till `/preview-session` för att starta/återanvända VM | — |
| **Hibernate** | VM pausas vid `pagehide` eller dold flik, kan återupptas | — |
| **`filesJson`** | `engine_versions.files_json` — kanonisk lagring av genererade filer | — |
| **`buildCompleteProject()`** | Bygger ett komplett Next.js-projekt: baseline + genererade filer + UI-komponenter + deps | — |

---

## Vad händer steg för steg

### Steg 1 — `done`-event skickas från Fas 2

```
Fas 2 finalize klar → version sparad i DB
│
└── SSE: done {
      versionId: "abc123",
      previewPending: true,     ← VM-preview väntas
      previewUrlHint: "https://...fly.dev/abc",  ← temporär hint
      awaitingInput: false
    }
```

**`previewPending: true`** betyder: "servern kommer att starta en
preview-session efter detta event". Klienten visar "Laddar preview...".

### Steg 2 — Server startar preview (post-finalize)

```
runOwnEngineStreamPostFinalize()
│
├── Parsar filer från finalize-resultat (filesJson prioriteras)
├── Beräknar previewWillRun:
│   └── shouldTriggerPostFinalizePreview()
│       ├── Tier-2 konfigurerad? (SAJTMASKIN_PREVIEW_HOST_BASE_URL)
│       ├── Filer finns? (parsedFileCount > 0)
│       └── Inte previewBlocked?
│
├── SSE: done (med previewPending: previewWillRun)
│
├── Om previewWillRun:
│   ├── SSE: progress { step: "preview", status: "starting" }
│   │
│   └── startPreviewSession()
│       ├── DEDUP: inflightPreviewSessionByChatVersion (Map)
│       │   Samma chat+version kan inte starta 2 VMs parallellt
│       │
│       ├── RESUME FÖRSÖK:
│       │   ├── getActivePreviewSessionAsync() → Redis/minne
│       │   └── tryResumeTier2Runtime(entry) → host status
│       │       └── Om OK → startOutcome: "resumed"
│       │
│       ├── OM RESUME MISSLYCKADES → NY SESSION:
│       │   ├── buildCompleteProject(generatedFiles):
│       │   │   ├── Baseline scaffold-filer (package.json, tsconfig, next.config, etc.)
│       │   │   ├── Merge: modellens package.json + baseline (pinnade deps vinner)
│       │   │   │   BASELINE_PINNED_DEPS: react, react-dom, next, three, fiber, drei
│       │   │   ├── Injicera saknade shadcn UI-komponenter
│       │   │   ├── runDepCompleter() → fylla saknade dependencies
│       │   │   └── Placeholder .env.local om ingen genererades
│       │   │
│       │   ├── buildPreviewEnvLocalContents():
│       │   │   Fyra lager (senare vinner vid nyckelkrock):
│       │   │   1. Globala placeholders (config/ai_models/*-placeholders.env.txt)
│       │   │   2. Per-projekt preview-tokens (fejk-hemligheter från projektId)
│       │   │   3. Lagrade projektvariabler (från DB, ev. krypterade)
│       │   │   4. Modell-genererad .env.local (vinner över allt)
│       │   │
│       │   └── startPreviewHostSession() → HTTP till Fly VM
│       │       └── VM kör: npm install → npm run dev
│       │
│       └── touchPreviewSessionAsync() → Redis + lokalt
│
├── Vid success:
│   ├── engine_versions.preview_url uppdateras i DB
│   └── SSE: preview-ready { previewUrl, previewSessionId }
│
└── Vid failure:
    └── SSE: build-error { stage, message }
```

### Steg 3 — Klienten tar emot `preview-ready`

```
stream-handlers.ts:
├── preview-ready event →
│   ├── setPreviewPending(false)
│   ├── setCurrentPreviewUrl(previewUrl)
│   ├── Rensa previewBuildError
│   └── Spara previewSessionId
│
└── PreviewPanel renderar iframe med previewUrl
```

### Steg 4 — Session lifecycle (drift)

```
┌─────────────────────────────────────────────────────┐
│ Preview-session (aktiv i ~1 timme)                  │
│                                                     │
│ Heartbeat: POST /preview-heartbeat var ~25s         │
│            Uppdaterar lastUsedAt i Redis/minne       │
│                                                     │
│ Hibernate: vid pagehide / dold flik                 │
│            → POST /preview-hibernate                │
│            VM parkeras men session-nyckel lever      │
│                                                     │
│ Recover: vid timeout/suspect                        │
│          → GET /preview-status                      │
│          → Om inte "running": POST /preview-session │
│            med forceRestart                         │
│                                                     │
│ Destroy: "Rensa preview"-knapp                      │
│          → POST /preview-destroy                    │
│          Stänger VM + rensar session + nollar URL    │
│                                                     │
│ TTL: ~1 timme (hard cap i Redis + host)             │
└─────────────────────────────────────────────────────┘
```

### Steg 5 — Quality gate + server-verify (asynkt)

```
resolvePostFinalizeServerVerifyDecision()
├── run: false om:
│   ├── verificationPolicy === "fast" (+ repairPassIndex === 0)
│   ├── Version inte eligible (redan inflight, saknas i DB)
│   ├── previewBlocked / verificationBlocked
│   └── "low_risk_standard_flow" — inga high-signal-indikatorer
│       (app, heavy context, redesign, quality warnings)
│
└── run: true om:
    ├── App build, heavy context, redesign, quality warnings
    └── Fidelity3, premium, release-candidate

Verify-kedjan:
├── triggerServerVerification() (fire-and-forget)
│   ├── Dedup per versionId (inflight Set)
│   ├── Kollar att version fortfarande är senaste
│   │
│   ├── Kör quality gate i VM:ens verify-lane:
│   │   ├── SERVER_VERIFY_QUALITY_GATE_CHECKS: typecheck + lint
│   │   └── Separat workspace, inte live-previewns dev-server
│   │
│   ├── Om PASS → promoteVersion()
│   │
│   └── Om FAIL → repair-loop:
│       ├── markVersionRepairing()
│       ├── runAutoFix (mekanisk)
│       ├── Om syntax OK → promote
│       ├── Annars: LLM-fixer (max SERVER_REPAIR_MAX_PASSES)
│       │   ├── Timeout: 60s per LLM-anrop
│       │   ├── bestContent-rollback vid regression
│       │   └── Ge upp vid: noop, no_improvement, timeout
│       ├── Om reparerad → updateFilesAndPromote()
│       │   └── Tidigare version markeras "superseded"
│       └── Om misslyckad → failVersionVerification()
```

### Steg 6 — Klient-side bootstrap (om SSE-preview missades)

```
useBuilderVmPreview.ts:
├── Guards (hoppa över om):
│   ├── Ingen auth / chatId / activeVersionId
│   ├── Aktiv streaming pågår
│   ├── Legacy v0-mappad chat
│   ├── Redan bootstrappad (key i doneKeysRef)
│   ├── preview-URL redan är live tier-2
│   └── Version har redan preview i summary
│
├── POST /api/engine/chats/[chatId]/preview-session
│   ├── Body: { versionId, forceRestart? }
│   ├── 503 → tier-2 ej konfigurerad (retryable)
│   ├── 400 → preview blockerad
│   ├── 200 → { previewUrl, previewSessionId, startOutcome }
│   │         startOutcome: "reused_url" | "resumed" | "recreated"
│   └── Retry: max 4 transienta försök med Retry-After
│
└── Force restart:
    └── Triggas av PROJECT_ENV_VARS_UPDATED_EVENT
        Rensar done-keys, ökar retry-nonce
```

---

## Två separata lanes på preview-host

```
┌──────────────────────────────────────────────┐
│ PREVIEW-HOST (Fly VM)                        │
│                                              │
│ Lane 1: LIVE PREVIEW (iframe)                │
│ ├── npm install → npm run dev                │
│ ├── Next.js dev-server                       │
│ └── Användaren ser och interagerar           │
│                                              │
│ Lane 2: VERIFY (quality-gate, isolerad)      │
│ ├── Separat workspace                        │
│ ├── npx tsc --noEmit (typecheck)             │
│ ├── npx eslint . --max-warnings=0 (lint)     │
│ ├── npx next build (vid promotion/deploy)    │
│ └── Resultat → server-verify → repair/promote│
│                                              │
│ VIKTIGT: En version kan vara live i preview  │
│ men ändå faila verify.                       │
└──────────────────────────────────────────────┘
```

---

## Quality gate profiler

| Profil | Checks | När |
|--------|--------|-----|
| `TIER2_QUALITY_GATE_CHECKS` | typecheck | Normal live-preview gate |
| `SERVER_VERIFY_QUALITY_GATE_CHECKS` | typecheck + lint | Bakgrunds-verify |
| `PROMOTION_QUALITY_GATE_CHECKS` | typecheck + build | Deploy-promotion |
| `INTERACTIVE_QUALITY_GATE_CHECKS` | typecheck + build + lint | Explicit interaktiv |

---

## previewPending — tre källor (känt problem)

```
1. SSE done → setPreviewPending(Boolean(doneData.previewPending))
   Sätts till true om server väntar på VM-start

2. SSE preview-ready → setPreviewPending(false)
   Nollställer när preview är redo

3. .then() i useCreateChat.ts → setPreviewPending(data.previewPending)
   Kan SKRIVA TILLBAKA true efter att preview-ready redan clearat

4. useBuilderVmPreview early-return guard → setPreviewPending(false)
   Fix: clearar pending om URL redan är live tier-2

RISKEN: Källa 3 kan override källa 2 om ordningen
inte respekteras. Guard i källa 4 mildrar men grundorsaken
(källa 3 skriver blint) lever kvar.
```

---

## Deploy (separat från preview)

```
POST /api/v0/deployments
├── precheckOnly: true → bara diagnostik, ingen deploy
├── applyPreDeployFixes() om inte skipAutoFix
├── 409 DEPLOY_MISSING_ENV om obligatoriska nycklar saknas
├── Vercel API createVercelDeployment()
└── Webhook: src/app/api/webhooks/vercel/route.ts
```

Deploy är ett helt separat steg från preview-sessionen.
Användaren måste aktivt välja att deploya.

---

## Legacy och döda stigar

| Vad | Status | Var |
|-----|--------|-----|
| Tier-1 shim (`/api/preview-render`) | Legacy fallback/diagnostik, inte standardväg | `compatibility-shim.ts` |
| `sandboxId` / `sandboxUrl` | Legacy namn, lever kvar i session-store och delar av kontraktet | `session-store.ts`, `preview-contract.ts` |
| `LEGACY_REDIS_SESSION_PREFIX` (`sandbox-preview:session:`) | Bakåtkompatibel Redis-nyckel-läsning | `session-store.ts` |
| `PreviewSessionFailureCode` (type `never`) | Aldrig använd som klassificerare | `preview-session.ts` |
| `prodBuildVerified` / `prodBuildLogSnippet` | Finns på typen men sätts inte i preview-session | `preview-session.ts` |
| `demoUrl` (DB-kolumn: `demo_url`) | Legacy-fält, kanoniskt namn är `previewUrl` / `preview_url` | Diverse |

---

## Vanliga felscenarion i Fas 3

| Scenario | Vad som händer | Var |
|----------|----------------|-----|
| `SAJTMASKIN_PREVIEW_HOST_BASE_URL` saknas | 503 `preview_session_disabled` | preview-session route |
| VM npm install misslyckas (peer deps) | `build-error` i SSE, preview startar inte | preview-host |
| "Laddar preview..." fastnar | `previewPending` state inte clearad (källa 3 vs 2 race) | stream-handlers + useCreateChat |
| Version failer verify men live i iframe | Normalt — verify-lane är separat från dev-preview | server-verify |
| Preview-URL nollställs trots att VM lever | `preview-destroy` anropat, eller version fick `failVersionVerification` | preview-session route |
| Retry-loop vid 503/504 | Klient väntar `Retry-After` (5s), max 4 försök | useBuilderVmPreview |
