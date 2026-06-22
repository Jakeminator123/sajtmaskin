# Grandmaster Bug Backlog — verifierad fix-lista

> Backlog-artefakt, ej planfil.

**Bas-HEAD:** `master @ 7ff47c451` · **Datum:** 2026-06-21

**Hur det producerades:** 20 read-only scouts (parallellt, `composer-2.5`) med distinkta teman och linser → 67 råa fynd → dedupe till 38 distinkta issue-grupper → triage av tung modell (topp 15 rankade) → verifiering av tung modell mot kod (topp 10 med `confirmed`/`likely`/`stale`-verdict) → oberoende granskning av extern "PR-väktare" (R1–R10 mot master) → denna konsoliderade backlog.

Alla scoutfiler (`findings/`), aktivitetsspecs (`activities/`), `triage.md` och `verdicts.md` är raderade — denna fil är enda kvarvarande artefakt och absorberar allt handlingsnödvändigt innehåll.

---

## 0. STATUS — verifierad mot master `c2ccd7efd` (triage-svärm 2026-06-22)

Parallell bugg-agent **avslutad** (gren `cursor/modell-och-autofixlogik-3376`, inga öppna PR:er) → orchestrator äger nu listan. 7 read-only composer-agenter verifierade varje B-item mot kod:

| ID | Verifierat läge | % reell bugg |
|---|---|---|
| B01, B03, B04, B06, B09, B10, B11, B14, B15, B-GA | **LÖST** — fix bekräftad i cited filer (#181/183/184/185/186/187) | ≤15% |
| **B05** | **POLICY men LATENT PROD-RISK** — refusal matchar hela registret utan `selectedDossierIds`-filter, och flaggan är ON i Vercel → false-RED-risk. Rekommenderad fix: filtrera på valda dossiers (`cross-file-import-checker.ts:670-688`). | 90% |
| B07 | POLICY (Jake: media öppet; säkerhet eget pass) | 95% |
| B08 | POLICY (Jake: fail-open; felet loggas via `console.warn`) | 95% |
| B12, B13 | EDGE / NEEDS_REPRO — kvarvarande follow-up-gap (F3 stale-base bypass; clear-redesign contract-retry) | 72–78% |
| B01-klient | NEEDS_REPRO — kräver live preview-host (separat repo) | — |

**Slutsats:** sessionens 10 fixar håller. Öppet kvar = **B05** (latent prod, rekommenderas fix) + **B12/B13** (edge, kräver repro) + dina 3 policybeslut (B05-policy/B07/B08).

---

## 1. Snabb verdict-tabell

| ID | Titel | Verdict | Prob | Impact | Effort | Yta | Cross-confirmed | blocked_by |
|---|---|---|---|---|---|---|---|---|
| **B01** | Vit iframe: `fetchPreviewHostStatus` versionId-blind | confirmed | 5 | 5 | M | preview-host-client, preview-status | PRIO-H1+H2 + Scout13-F1 + extern R1 | — |
| **B03** | `resolveSelectedDossiersFromSnapshot` läser `brief` istf `briefSummary` | confirmed | 5 | 4 | S | dossiers/snapshot-selection | Scout09-F1 + Scout03 + extern R3 | — |
| **B04** | FollowUpContract capability-golv union:ar ej `snapshot.requestedCapabilities` | confirmed | 4 | 4 | S | orchestration-snapshot | Scout09-F2 + Scout03-F1 + extern R4 | — |
| **B05** | Dossier-refusal A7-2 matchar hela registret, inte valda dossiers (PROD-AKTIV) | confirmed | 5 | 5 | M | cross-file-import-checker | Scout08-F1 + extern R5 | rekommenderas B03 först |
| **B06** | `collectExplicitRouteRemovals` path-extrakt utan sidkontext | likely | 3 | 4 | S | route-plan/planning-helpers | Scout06-F1 + extern R6 | — |
| **B07** | Oautentiserad cross-tenant media GET | confirmed | 4 | 5 | S | uploads/media route | Scout14-F1 + extern R7 | — |
| **B08** | quality-gate `assertPromoteAllowed` fail-open vid exception | confirmed | 3 | 5 | XS | quality-gate/route | Scout07B + extern R8 | — |
| **B09** | VersionHistory visar emerald "Verifierad" trots bus-degradering | confirmed | 4 | 3 | S | VersionHistory.tsx | Scout02A + extern R9 | — |
| **B10** | `db:migrate` kör migrationer alfabetiskt utan beroendeprioritering | confirmed | 4 | 4 | S | scripts/db/run-migrations | Scout12-F1 + extern R10 | — |
| **B11** | Export-ZIP läggs som `access:"public"` Blob utan `.env.local`-sanering | scout | 3 | 4 | S | export/route, project-scaffold | Scout14-F3 | — |
| **B12** | F3 auto-kick `onF3Ready` kringgår stale-base-409-gaten | scout | 3 | 4 | S | PreviewPanelF3Trigger, useSendMessage | Scout (triage Rank 12) | — |
| **B13** | clear-redesign delta-brief tappas vid contract-gate-retry (tur 2) | scout | 3 | 4 | S | chat-message-stream-post, follow-up-orchestration-input | Scout06 + triage Rank 13 | — |
| **B14** | CI: `test:followup-contract` hoppas över om `test:ci` failar | scout | 3 | 3 | XS | .github/workflows/ci.yml | Scout11-F2 + triage Rank 14 | — |
| **B15** | `finalizeOrchestrationPrompts` använder stale `generationMode`-derivering | scout | 2 | 4 | XS | orchestrate.ts rad 1386 | Scout04B + triage Rank 15 | — |
| **B-GA** | Google OAuth-fel loggar rått HTTP-svar (token-risk i serverloggar) | scout | 3 | 3 | XS | src/lib/auth/auth.ts | Scout14-F2 | — |

> **Verdict-nyckel:** `confirmed` = scout + verifieringsagent + (extern granskning) bekräftar i kod · `likely` = logikgap verifierat, blast-radie svår att mäta · `scout` = scout-fynd, ej externgranskad, trovärdig men obekräftad av verifierare.

---

## 2. Per-bugg-detalj

---

### B01 — Vit/blank iframe: `fetchPreviewHostStatus` versionId-blind (P0)

**Kind:** false-green / core-UX

**Verdict:**
- Scout: PRIO-djupdiagnos (H1+H2) + Scout 13-F1 oberoende — trippel-bekräftad. Tre separata race-grenar kartlagda (Race A = gammal version syns, Race B = blank/vit iframe, Race C = "Startar preview"-sida som fastnar).
- Verifieringsagent: **confirmed** — `preview-host-client.ts:134` kontrollerar bara `body.running !== true`, aldrig `body.versionId`. Server-sidan (`server.js:404-408`) returnerar redan `versionId` i status-svaret. Inget test täcker version-id-match vid polling.
- Extern granskning (PR-väktare): **CONFIRMED**; caveat — preview-host exakta svarsfältnamn är ej live-verifierade (separat repo); client accepterar `body.running===true` utan `versionId`-match.

**Kodankare:**
- `src/lib/gen/preview/preview-host-client.ts:116-142` — `fetchPreviewHostStatus`, kontrollerar bara `body.running !== true`
- `src/app/api/engine/chats/[chatId]/preview-status/route.ts:148-169` — `tryResumeTier2Runtime` anropar `fetchPreviewHostStatus` versionId-blint
- `src/lib/hooks/preview/useBuilderVmPreview.ts:204-246, 389-390` — polling-loop, ett enda `bumpPreviewRefreshToken`-anrop utan versionId-verifiering
- `preview-host/src/server.js:404-408` — returnerar `versionId` i status-svar (angränsande, annat repo)

**Symptom / varför det är en bugg:**
`/preview-session` svarar `{startOutcome:"resumed", previewUrl:SAME_URL}` synkront medan preview-host asynkront dödar gammalt Next.js-process och startar nytt (5–120 s). `useBuilderVmPreview` bumpar `refreshToken` → iframe laddar `SAME_URL?t=newToken` → proxy vidarebefordrar. Om gammalt process hinner dö mitt i proxy (`ECONNREFUSED`, `res.headersSent=true`) → ofullständigt HTTP-svar → `iframe.onLoad` med tomt innehåll → `setIframeLoading(false)` → **blank/vit iframe**. Alternativt serveras gamla versionens HTML (Race A) utan signal om att ny version är redo. `preview-status`-routen rapporterar `running` medan host kör gamla filer → UI fastnar utan auto-reload.

**Motargument / caveat:**
`preview-host/src/server.js` ligger i ett separat repo och exakt fältnamn (`body.versionId` eller annat) måste verifieras mot live preview-host-svar innan fix deployeras. PRIO-diagnosen hävdar att fältet returneras redan, men statisk kodläsning kan ej bekräfta.

**Minsta säkra åtgärd:**
1. `fetchPreviewHostStatus(hostUrl, opts, expectedVersionId?)` — returnerar `null` ("starting") tills `body.versionId === expectedVersionId` (eller `expectedVersionId` är null = gammalt beteende intakt).
2. `preview-status`-routen skickar `expectedVersionId` från query-param `versionId`.
3. `useBuilderVmPreview` pollar `preview-status?versionId=<newVid>` efter bootstrap-svar tills `running + versionId-match`, triggar `bumpPreviewRefreshToken` igen.

**Owner-filer:** `src/lib/gen/preview/preview-host-client.ts` · `src/app/api/engine/chats/[chatId]/preview-status/route.ts` · `src/lib/hooks/preview/useBuilderVmPreview.ts`

**Föreslagen branch:** `fix/preview-version-mismatch-polling`

**PR-storlek:** M (3 filer, ~40–80 rader + test)

**Verifiering:**
- Enhetstest `preview-host-client.test.ts`: `fetchPreviewHostStatus({ body: { running:true, versionId:"v1" } }, "v2")` → `null`; `("v1")` → `{ previewSessionId, primaryUrl }`.
- Smoke: follow-up → `preview-status?versionId=<newVid>` pollas tills `running + match` → iframe-refresh → ny version synlig utan manuell reload inom 30 s.
- `npm run typecheck` 0 fel · `npm run lint` 0 fel.

**Grandmaster-kontrakt:** Kern-UX-loopen prompt→preview→follow-up→ny preview. Blockerar verifierad livscykel.

---

### B03 — `resolveSelectedDossiersFromSnapshot` läser `brief` istf `briefSummary`

**Kind:** false-green / F3-gate

**Verdict:**
- Scout: Scout 09-F1 + Scout 03 (oberoende, dubbel-bekräftad). Kodankare bekräftade mot `snapshot-selection.ts:24-38` och `detect-integrations.test.ts:114-124`.
- Verifieringsagent: **confirmed** — `snapshot-selection.ts:28-32` läser `snapshot.brief.requestedCapabilities`; persisted snapshot har `briefSummary` + top-level `requestedCapabilities` + `selectedDossierIds` — aldrig `brief`. Returnerar alltid `[]` för verkliga prod-snapshots. Spegelns `resolveSelectedDossiersFromStreamMeta` läser rätt fält.
- Extern granskning (PR-väktare): **CONFIRMED** — reads `snapshot.brief.requestedCapabilities`; real snapshots use `briefSummary` / top-level → returns `[]`.

**Kodankare:**
- `src/lib/gen/dossiers/snapshot-selection.ts:24-38` — `resolveSelectedDossiersFromSnapshot`, läser `snapshot.brief.requestedCapabilities` (saknas)
- `src/app/api/engine/chats/[chatId]/readiness/route.ts:300` — konsument
- `src/app/api/engine/chats/[chatId]/finalize-design/route.ts:166` — konsument
- `src/lib/gen/dossiers/detect-integrations.test.ts:114-124` — dokumenterar symptom (tom `selectedDossiers` → Stripe-nycklar warn-only istf build-enforcement)

**Symptom / varför det är en bugg:**
F3 readiness och finalize-design anropar `resolveSelectedDossiersFromSnapshot` för att avgöra vilka dossiers som valts. Eftersom `snapshot.brief` aldrig sätts i persisted snapshots returnerar helpern alltid `[]` → Stripe/Clerk/betalningsnycklar nedgraderas till `warn-only` i stället för `build`-enforcement → F3-env-gate är tyst trasig. Spegelns implementation `resolveSelectedDossiersFromStreamMeta` (som används i finalize-pipelinen) prioriterar korrekt: `selectedDossierIds` → `requestedCapabilities` → `briefSummary.requestedCapabilities`.

**Motargument / caveat:**
Om en legacy-rad faktiskt skriver `snapshot.brief` (ej sett i master-kedjan) fungerar helpern för den raden. Tom lista är "konservativt warn-only" per plan-12-kommentar — men det strider mot avsikten när snapshot har dossier-metadata.

**Minsta säkra åtgärd:**
Skriv om `resolveSelectedDossiersFromSnapshot` i prioritetsordning (spegla `resolveSelectedDossiersFromStreamMeta`): `snapshot.selectedDossierIds` → `snapshot.requestedCapabilities` → `snapshot.briefSummary.requestedCapabilities` → `snapshot.brief.requestedCapabilities` (sista fallback).

**Owner-filer:** `src/lib/gen/dossiers/snapshot-selection.ts` (42 rader, hela filen)

**Föreslagen branch:** `fix/snapshot-selection-brief-field`

**PR-storlek:** S (1 produktionsfil + test, <30 rader)

**Verifiering:**
- Enhetstest i `snapshot-selection.test.ts`: `{ briefSummary: { requestedCapabilities: ["payments"] } }` → icke-tom lista; `{ selectedDossierIds: ["stripe-checkout"] }` → icke-tom lista; `{ requestedCapabilities: ["payments"] }` (top-level) → icke-tom lista; tom snapshot → `[]`.
- `detect-integrations.test.ts:114-124` fortfarande grön.
- `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** F3-readiness-gate. Område 5 (F3 integrationer). Rekommenderas köras före B05 (dossier-refusal) för att säkerställa att `selectedDossierIds` är korrekt ifylld.

---

### B04 — FollowUpContract capability-golv union:ar ej `snapshot.requestedCapabilities`

**Kind:** bug / contract-violation

**Verdict:**
- Scout: Scout 09-F2 + Scout 03-F1 (oberoende, dubbel-bekräftad).
- Verifieringsagent: **confirmed** — `buildFollowUpContract` (orchestration-snapshot.ts:412-432) bygger `capabilities` enbart från `snapshotBrief.requestedCapabilities`. Top-level `snapshot.requestedCapabilities` (som bär inferred-bridge-capabilities från init-generationen, t.ex. `visual-3d`/`interactive-game`) ignoreras. `followup-capabilities.stability.test.ts` täcker inte gapet `snapshot.requestedCapabilities ≠ briefSummary`.
- Extern granskning (PR-väktare): **CONFIRMED** — `buildFollowUpContract` reads only `snapshotBrief.requestedCapabilities`, not top-level `snapshot.requestedCapabilities`.

**Kodankare:**
- `src/lib/gen/orchestration-snapshot.ts:409-436` — `buildFollowUpContract`, bygger `capabilities` bara från `snapshotBrief.requestedCapabilities`
- `src/lib/gen/orchestrate.ts:1305-1324` — `enforceFollowUpCapabilityFloor`, applicerar golvet men golv-källan är ofullständig
- `src/lib/gen/followup-capabilities.stability.test.ts` — stabilitetstest (utöka med union-scenario)

**Symptom / varför det är en bugg:**
Vid finalize sparas merged dossier-capabilities i `snapshot.requestedCapabilities` (brief ∪ inferred-bridge ∪ follow-up-detektion). `briefSummary.requestedCapabilities` härleds bara från Deep Brief (`extractBriefSummary(metaBrief)`), inte från inferred-bridge (`resolveDossierCapabilitiesFromInferredCapabilities`). Om init tände `visual-3d` via bridge (men brief saknar det) → golvet är tomt för den capability → neutral follow-up tappar dossier-injektion trots Grandmaster 5-5 "capabilities can-only-grow"-kontrakt.

**Motargument / caveat:**
Om Deep Brief konsekvent speglar alla dossier-capabilities minskar gapet; golvet är tänkt som "brief-linje". Follow-up-detektion kan återlägga capabilities från meddelandetext. Clear-redesign är ej undantagen per 5-5-spec.

**Minsta säkra åtgärd:**
```ts
// I buildFollowUpContract:
const briefCaps = snapshotBrief?.requestedCapabilities ?? [];
const snapshotTopCaps = readSnapshotArray<string>(snapshot, "requestedCapabilities");
const inheritedCapabilities = [
  ...new Set([...briefCaps, ...snapshotTopCaps].map(c => c.toLowerCase())),
];
```
Returnera `capabilities: [...inheritedCapabilities]` (defensiv kopia).

**Owner-filer:** `src/lib/gen/orchestration-snapshot.ts` · `src/lib/gen/followup-capabilities.stability.test.ts`

**Föreslagen branch:** `fix/followup-contract-caps-floor`

**PR-storlek:** S (1 produktionsfil + test, <20 rader)

**Verifiering:**
- Stabilitetstest: snapshot `{ briefSummary: { requestedCapabilities: ["ai-chat"] }, requestedCapabilities: ["ai-chat","visual-3d"] }` → `capabilities` ska innehålla `["ai-chat","visual-3d"]`.
- Neutral follow-up utan 3D-ord på samma snapshot → `enforceFollowUpCapabilityFloor` håller `visual-3d`.
- `npm run test:followup-contract` grön · `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** 5-5 "can-only-grow" capabilities-kontrakt. Område 5 (follow-up-kontrakt).

---

### B05 — Dossier-refusal A7-2 matchar hela registret, inte valda dossiers (PROD-AKTIV)

**Kind:** false-red / pipeline / URGENT

**Verdict:**
- Scout: Scout 08-F1 (dedikerat A7-2-spår).
- Verifieringsagent: **confirmed**, prob justerat 4→5 (prod-aktiv) — `cross-file-import-checker.ts:658` kallar `getDossierExposesByImportPath(source)` som söker hela `getAllDossiers()` utan filter på `selectedDossierIds`. `SAJTMASKIN_REFUSE_DOSSIER_STUBS=true` är nu aktivt i alla tre Vercel-miljöer (loggbok 2026-06-21).
- Extern granskning (PR-väktare): **CONFIRMED** code risk — `getDossierExposesByImportPath` iterates all `getAllDossiers()` without `selectedDossierIds`; "prod-active" claim rests on log/env, not code (= rimlig caveat för statisk läsning, men konstaterat att flaggan är satt).

**Kodankare:**
- `src/lib/gen/autofix/rules/cross-file-import-checker.ts:657-689` — refusal-grenen, `getDossierExposesByImportPath` utan `selectedDossierIds`-filter
- `src/lib/gen/dossiers/registry.ts:216-229` — `getDossierExposesByImportPath`, returnerar matchande expose ur hela registret
- `src/lib/gen/stream/finalize-version/runner.ts` — anropar `checkCrossFileImports`, verifiera var `selectedDossiers` finns
- `src/lib/providers/own-engine/generation-stream-post-finalize.ts:233-256` — mappar `crossFileStubs` utan `refused`-check

**Symptom / varför det är en bugg:**
LLM:s egna komponenter på sökvägar som råkar matcha ett registrerat dossier-expose (t.ex. `@/components/faq-accordion`) vägras stub utan att dossiern valts → `code_structure_failure` → preview-block i prod. Flaggan är ON i prod men koden filtrerar ej på `selectedDossierIds` → alla LLM-genererade importer mot dossier-registrerade exponerade sökvägar blir false-red, oavsett om dossiern valts.

**Motargument / caveat:**
Scout 08-F1 noterar att previews blockeras korrekt för valda dossiers; frekvensen av false-red (LLM refererar dossier-exponerad sökväg utan att dossiern valts) är produktions-runtime-beroende. Expose-sökvägar är kanoniska (`@/components/dossier-X`) — en normal scaffold-komponent på samma sökväg är osannolikt, men möjligt vid namnkrock.

**Minsta säkra åtgärd:**
1. Tråda `selectedDossierIds: string[]` in i `checkCrossFileImports` och vidare till refusal-grenen.
2. Ändra villkoret: `if (dossierMatch && FEATURES.refuseDossierStubs && selectedDossierIds.includes(dossierMatch.dossierId))` → utanför `selectedDossierIds`: fall tillbaka till tyst stub (OFF-grenen).
3. (Bonus, isolerbart) `generation-stream-post-finalize.ts`: grena på `stub.refused === true` → distinkt diagnostisk kategori.

**Rollback (omedelbar utan deploy):** Sätt `SAJTMASKIN_REFUSE_DOSSIER_STUBS=false` i Vercel → git revert PR efteråt.

**Owner-filer:** `src/lib/gen/autofix/rules/cross-file-import-checker.ts` · `cross-file-import-checker.test.ts`

**Föreslagen branch:** `fix/dossier-refusal-selected-filter`

**PR-storlek:** M (2–3 filer, ~40–60 rader inklusive test; `selectedDossierIds` måste trådas från finalize-runner ner till checker)

**Verifiering:**
- Enhetstest: `selectedDossiers: []` + LLM-import `@/components/faq-accordion` (registrerad expose) + flag ON → INGEN refusal.
- Enhetstest: `selectedDossiers: [{ id:"faq-accordion" }]` + import + flag ON → refusal.
- `refuse-dossier-stubs.stability.test.ts` alla befintliga case gröna.
- `npm run typecheck` 0 fel.
- Öppna som DRAFT tills Jakes review + smoke (flag ON, generation med och utan dossier-urval).

**Grandmaster-kontrakt:** A7-2 (autofix vägrar dossier-stub). Rekommenderas köras efter B03 (säkerställer att `selectedDossierIds` är korrekt ifylld).

---

### B06 — `collectExplicitRouteRemovals` path-extraktion utan sidkontext

**Kind:** bug / contract-violation

**Verdict:**
- Scout: Scout 06-F1 (dedikerat spår).
- Verifieringsagent: **likely** — logikgapet verifierat i kod (`planning-helpers.ts:76-83`): `ROUTE_REMOVAL_VERB_RE` kollas, sedan extraheras alla `/path`-mönster utan att `ROUTE_REMOVAL_CONTEXT_RE` krävs för den grenen. Blast-radien i prod är svår att uppskatta utan kördata. Befintliga tests täcker ej "verb + /path utan route/page-kontext"-scenariot.
- Extern granskning (PR-väktare): **LIKELY** — path branch runs before context requirement; logic gap confirmed, blast radius uncertain.

**Kodankare:**
- `src/lib/gen/route-plan/planning-helpers.ts:76-86` — `collectExplicitRouteRemovals`, första loopen extraherar `/path` med enbart verb-check
- `src/lib/gen/route-plan/planning-helpers.ts:86-98` — keyword-loopen kräver redan `ROUTE_REMOVAL_CONTEXT_RE` (rätt beteende)
- `src/lib/gen/orchestrate.ts:1161-1174` — konsument av explicit-removals-listan
- `src/lib/gen/followup-freeze.stability.test.ts` — route-freeze-tester (utöka)

**Symptom / varför det är en bugg:**
Prompt "ta bort den gamla gradienten på /om-sidan" → `ROUTE_REMOVAL_VERB_RE` matchar → `/om-sidan` eller `/om` extraheras → normalizeRoutePath → `/om` matchas mot befintliga routes → `/om` markeras för borttagning utan att routekontexten ("sida/route/page") krävts för path-loopen. 5-3b route-floor-kontrakt: clamp lämnar borttagen route kvar men explicit-removals kan fortfarande trigga permanent borttagning via `orchestrate.ts`.

**Motargument / caveat:**
Blast-radien beror på hur ofta användare skriver `/path`-strängar i follow-up utan route/page-kontextord. Keyword-loopen (rad 86-98) kräver redan `ROUTE_REMOVAL_CONTEXT_RE` → inkonsekvens, inte design. Verifiera att legitima borttagningsscenarier (t.ex. "remove /kontakt") fortfarande fungerar via keyword-loopen om de missar path-loopen.

**Minsta säkra åtgärd (Alt A):** En rad — flytta upp `ROUTE_REMOVAL_CONTEXT_RE`-check till att gälla även path-grenen:
```ts
if (!ROUTE_REMOVAL_VERB_RE.test(prompt)) return removals;
if (!ROUTE_REMOVAL_CONTEXT_RE.test(prompt)) return removals; // ny rad
```

**Owner-filer:** `src/lib/gen/route-plan/planning-helpers.ts` · `src/lib/gen/followup-freeze.stability.test.ts`

**Föreslagen branch:** `fix/route-removal-context-guard`

**PR-storlek:** S (1 produktionsfil + 1 rad + test)

**Verifiering:**
- Unittest: `"ta bort den gamla gradienten på /om-sidan"` → `/om` ska **ej** vara i explicit removals.
- Unittest: `"ta bort /om-sidan"` (verb + "sidan" = kontextord) → ska ge removal.
- Befintliga route-freeze-tests gröna · `npm run test:followup-contract` grön.

**Grandmaster-kontrakt:** 5-3b route-floor-kontrakt. Neutral follow-up ska aldrig radera routes utan explicit routekontext.

---

### B07 — Oautentiserad cross-tenant media GET

**Kind:** security / grundhygien

**Verdict:**
- Scout: Scout 14-F1 (dedikerat säkerhetsspår).
- Verifieringsagent: **confirmed** — `src/app/api/uploads/media/[...path]/route.ts:51-124` har noll session-check och noll `userId`-match mot inloggad användare. `Access-Control-Allow-Origin: *`. Lokal fallback-väg aktiv utan Blob-token. Cross-tenant-läckage är alltid i scope per projektregler.
- Extern granskning (PR-väktare): **CONFIRMED** — no session/userId check + `Access-Control-Allow-Origin:*`; public-asset interpretation = product decision, else security bug.

**Kodankare:**
- `src/app/api/uploads/media/[...path]/route.ts:51-124` — GET-handler, noll auth
- `src/app/api/uploads/media/[...path]/route.test.ts` — utöka med auth-tester
- `src/lib/vercel/blob-service.ts:179-180` — `LocalFsProvider.buildPublicUrl` pekar mot denna route

**Symptom / varför det är en bugg:**
`GET /api/uploads/media/[userId]/[filename]` kräver ingen inloggning och verifierar inte att anroparen äger `userId`. URL:en exponeras i API-svar, `<img src>`, preview och nätverkstrafik. Vem som helst med URL:en läser en annan användares bilder/video/PDF utan tenant-check. Lokal fallback-väg (utan `BLOB_READ_WRITE_TOKEN`) är aktiv i dev och self-host-scenarier.

**Motargument / caveat:**
Med Vercel Blob (prod-default) ligger filer på Blob-CDN — denna route är dev/self-host fallback. Filnamn (`userId`-nanoid + timestamp + slump) är svåra att gissa utan läckt URL. Men URL:en läcker via vanlig användning → cross-tenant-risken är reell.

**Minsta säkra åtgärd:**
1. Hämta session via `getServerSession` / `auth()`.
2. Extrahera `userId` ur path-segmenten (rad 60).
3. Om ingen session → 401. Om `session.user.id !== userId` → 403.

**Owner-filer:** `src/app/api/uploads/media/[...path]/route.ts` · `route.test.ts`

**Föreslagen branch:** `fix/media-auth-cross-tenant`

**PR-storlek:** S (~20–30 rader ny auth-logik + test)

**Verifiering:**
- Unittest: GET utan session → 401; GET med session, userId-mismatch → 403; GET med session, rätt userId → 200.
- Manuellt: ladda upp bild som user A, hämta URL i inkognito → 403 efter fix.
- `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** Grundhygien — cross-tenant-läckage stoppas alltid per projektregler.

---

### B08 — quality-gate `assertPromoteAllowed` fail-open vid exception

**Kind:** false-green / security

**Verdict:**
- Scout: Scout 07B (false-green-härdning, lins B).
- Verifieringsagent: **confirmed** — `quality-gate/route.ts:266-268` `.catch()` returnerar `{ allowed: true as const }`. #149 fixade guard-nekar-grenen (`allowed:false` → `promotionBlocked:true`) men exception-catch-grenen returnerar fortfarande `allowed:true` → version promoteras trots `verifier_failed`. Inget test täcker mock-throw från `assertPromoteAllowed`.
- Extern granskning (PR-väktare): **CONFIRMED** — `assertPromoteAllowed().catch()` returns `{allowed:true}` = explicit fail-open.

**Kodankare:**
- `src/app/api/engine/chats/[chatId]/quality-gate/route.ts:266-268` — `.catch()` returnerar `{ allowed: true as const }`
- `src/lib/gen/promote-guard.ts:42-61` — `assertPromoteAllowed` (orörd)
- `src/app/api/engine/chats/[chatId]/quality-gate/route.test.ts` — utöka med mock-throw

**Symptom / varför det är en bugg:**
Undantag i `assertPromoteAllowed` (t.ex. DB-timeout) → catch returnerar `{ allowed: true }` → `guard.allowed === true` → promote-flödet körs → version promoted trots `verifier_failed`. Bättre: exception = "kan inte avgöra om promote är säkert" → blockera promote, låt användaren retry.

**Motargument / caveat:**
Scout 07A-F3 noterar att `assertPromoteAllowed` är avsiktligt fail-open för legacy-rader utan telemetry (dokumenterat). Den grenen är separat designbeslut — denna fix gäller enbart exception-catch, inte legacy-telemetri-fallback.

**Minsta säkra åtgärd:**
```ts
// Före (fail-open):
const guard = await assertPromoteAllowed(internalVersionId).catch((err) => {
  console.warn("[quality-gate] Promote guard check failed (fail-open):", err);
  return { allowed: true as const };
});

// Efter (fail-closed):
const guard = await assertPromoteAllowed(internalVersionId).catch((err) => {
  console.warn("[quality-gate] Promote guard check threw; blocking promotion:", err);
  return { allowed: false as const, reason: "guard_exception" };
});
```
Effekt: exception → `!guard.allowed` → `promotionBlocked = true` + `failVersionVerification(...)` (samma gren som rad 270-280, redan testad).

**Owner-filer:** `src/app/api/engine/chats/[chatId]/quality-gate/route.ts` · `route.test.ts`

**Föreslagen branch:** `fix/quality-gate-catch-fail-closed`

**PR-storlek:** XS (1 rad produktionskod + 1 testcase, <15 rader)

**Verifiering:**
- `quality-gate/route.test.ts`: `assertPromoteAllowed` mockas att kasta → `promotionBlocked: true` / `passed: false`; `promoteVersion` anropas INTE.
- Befintliga tester (guard-nekar, guard-tillåter, gate-fail) gröna.
- `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** False-green-härdning (Område 7). `verifier_failed` ska aldrig leda till promote.

---

### B09 — VersionHistory visar emerald "Verifierad" trots bus-degradering

**Kind:** false-green / UI

**Verdict:**
- Scout: Scout 02A (status-läsvägar, lins A).
- Verifieringsagent: **confirmed** — `VersionHistory.tsx:671-677`: `verificationBadge` sätts till emerald "Verifierad" baserat enbart på `verificationSurfaceStatus === "verified"`, utan koll på `lifecycleDisplay.degraded`. `resolveEngineVersionVerificationSurfaceStatus` (`engine-version-lifecycle.ts:134-147`) läser bara DB-fält — inga bus-`degradations[]`. Medvetet utanför scope i #179 (loggbok 2026-06-21).
- Extern granskning (PR-väktare): **CONFIRMED** UI risk.

**Kodankare:**
- `src/components/builder/VersionHistory.tsx:671-677` — `verificationBadge`, emerald utan degraded-check
- `src/components/builder/VersionHistory.tsx:632-636` — `lifecycleDisplay`-beräkning
- `src/lib/builder/engine-version-lifecycle.ts:134-147` — `resolveEngineVersionVerificationSurfaceStatus`, läser bara DB-fält
- `src/lib/builder/version-history-status-labels.test.ts` — utöka

**Symptom / varför det är en bugg:**
En version med `product_postcheck_skipped`/`verifier_skipped_by_policy` i `bus.degradations[]` visas som emerald "Verifierad" (grön bock) i versionshistoriken. Grandmaster Område 7 förbjöd split false-green på livscykel-ytan: DB-badge (emerald) och bus-amber (degraderad) ska inte visas simultant. Utan B01/B03-fix kan degraderingar saknas i bus, men när de väl finns ska UI:t visa dem.

**Motargument / caveat:**
`lifecycleDisplay` är tillgänglig vid badge-beräkningens punkt — bekräfta att den är åtkomlig via prop-kedjan. Alternativt: passera `lifecycleDisplay` till `resolveEngineVersionVerificationSurfaceStatus` för mer testbar approach.

**Minsta säkra åtgärd:**
```tsx
const verificationBadge =
  lifecycleDisplay.degraded
    ? null   // eller neutral "Degraderad"-badge
    : verificationSurfaceStatus === "verified"
      ? { label: "Verifierad", /* ...emerald */ }
      : /* ...*/
```

**Owner-filer:** `src/components/builder/VersionHistory.tsx` · `src/lib/builder/version-history-status-labels.test.ts`

**Föreslagen branch:** `fix/version-badge-degraded-gate`

**PR-storlek:** S (1 UI-fil + 1 testfil, ~15–25 rader)

**Verifiering:**
- Unittest: `{ busStatus: { phase:"done", degraded:true, degradations:[...] }, releaseState:"promoted", verificationState:"passed" }` → `verificationBadge` ska **inte** vara emerald "Verifierad".
- Unittest: `degraded:false` + `verificationState:"passed"` → emerald visas.
- `npm run typecheck` 0 fel.
- Rekommenderas köras efter B08 (quality-gate-fix säkerställer att `verifier_failed` faktiskt hamnar i bus-state).

**Grandmaster-kontrakt:** Område 6+7 — livscykelbadge ska spegla bus-state, aldrig visa split false-green.

---

### B10 — `db:migrate` kör migrationer alfabetiskt utan beroendeprioritering

**Kind:** bug / infra

**Verdict:**
- Scout: Scout 12-F1 (schema-drift/migrations).
- Verifieringsagent: **confirmed** — `run-migrations.ts:62-64` använder `.sort()` (alfabetisk). `db-init.mjs:641-650` har explicit `dependencyOrder`. I alfabetisk ordning kör `add-cascade-to-engine-fks.sql` (ALTER på `version_comments`/`version_approvals`) **före** `add-collaboration-tables.sql` (CREATE), och `add-generation-telemetry-scaffold-selection.sql` **före** `add-generation-telemetry.sql` → tom/partial DB → `db:migrate` aborterar. `db:schema-drift` är statisk och fångar inte detta.
- Extern granskning (PR-väktare): **CONFIRMED** mechanism — `run-migrations.ts` `.sort()`.

**Kodankare:**
- `scripts/db/run-migrations.ts:62-64` — `.sort()` (alfabetisk)
- `scripts/db/db-init.mjs:641-650` — `dependencyOrder`-arrayen (korrekt implementation)
- `scripts/db/add-cascade-to-engine-fks.sql:27-38` — ALTER på tabeller som skapas av `add-collaboration-tables.sql`
- `scripts/db/migration-order.mjs` — ny gemensam modul (skapas av fix)

**Symptom / varför det är en bugg:**
`db:migrate` är primär väg i CI-/cloud-agent-kontext (t.ex. Cursor Cloud Agent-plattformen). På tom eller partial Postgres aborterar scriptet vid ALTER på tabell som ännu ej skapats. `db:init` är primär prod-väg och fungerar korrekt; `db:migrate` används för incremental-uppdatering och cloud-agent-bootstrapping. `db:schema-drift` är statisk och fångar inte ordningsproblemet.

**Motargument / caveat:**
Primär prod-väg är `db:init` — korrekt. `db:migrate` används framförallt i CI/cloud-agent. Risken är framförallt vid bootstrapping av ny miljö.

**Minsta säkra åtgärd:**
1. Extrahera `dependencyOrder`-arrayen från `db-init.mjs` till `scripts/db/migration-order.mjs`.
2. Importera och applicera i `run-migrations.ts`: filer i `dependencyOrder` överst, resten sorteras alfabetiskt efter.
3. Unittest: `add-generation-telemetry-scaffold-selection.sql` alltid efter `add-generation-telemetry.sql`; `add-cascade-to-engine-fks.sql` alltid efter `add-collaboration-tables.sql`.

**Owner-filer:** `scripts/db/run-migrations.ts` · `scripts/db/db-init.mjs` · `scripts/db/migration-order.mjs` (ny)

**Föreslagen branch:** `fix/migrate-dependency-order`

**PR-storlek:** S (2 produktionsfiler + ny hjälpmodul + test, ~40–60 rader)

**Verifiering:**
- Unittest för migreringsordningsfunktionen (ren sort-logik, ingen DB).
- `npm run db:schema-drift` fortfarande grön.
- `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** CI/CD-stabilitet. DB-migrering ska vara deterministisk och körbar på tom DB.

---

### B11 — Export-ZIP läggs som `access:"public"` Blob utan `.env.local`-sanering

**Kind:** security

**Verdict:** Scout 14-F3 (ej externgranskad som R11).

**Kodankare:**
- `src/app/api/engine/chats/[chatId]/versions/[versionId]/export/route.ts:62-74` — `put(..., { access: "public" })`, permanent CDN-URL
- `src/lib/gen/export/project-scaffold.test.ts:154-163` — test bekräftar medvetet "behåll befintlig `.env.local`"

**Symptom / varför det är en bugg:**
Export genererar en permanent, oautentiserad CDN-URL (publik Blob). Testet dokumenterar explicit att `buildExportableProject` behåller modellens `.env.local` oförändrad om den finns i version-filer. Om versionen innehåller riktiga nycklar (klistrade av användare, hallucinererade av LLM, eller merge från preview) hamnar de i en publik zip utan tidsgräns.

**Motargument / caveat:**
URL:en returneras bara till ägaren. Pathname innehåller chat/version-id + timestamp (svår att gissa). Vanlig export har placeholder-nycklar, inte prod-hemligheter. Men om `.env.local` existerar med riktiga nycklar är läckaget reellt.

**Minsta säkra åtgärd:**
Endera: (a) `access: "private"` + kortlivad signed URL, eller (b) strip/ersätt `.env.local` med placeholders i `buildExportableProject`-pipelinen.

**Owner-filer:** `src/app/api/engine/chats/[chatId]/versions/[versionId]/export/route.ts`

**Föreslagen branch:** `fix/export-zip-private-blob` (eller slå ihop med B07 i ett säkerhets-PR)

**PR-storlek:** S (1–2 filer)

**Verifiering:**
- Exportera version med `.env.local: STRIPE_SECRET_KEY=sk_test_…`; hämta blob-URL utan auth → zip ska inte innehålla nyckeln (alt. URL ger 401 utan giltig signatur).
- `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** Grundhygien — inga secrets i publik lagring.

---

### B12 — F3 auto-kick `onF3Ready` kringgår stale-base-409-gaten

**Kind:** bug / contract bypass

**Verdict:** Scout (triage Rank 12, ej externgranskad).

**Kodankare:**
- `src/components/builder/PreviewPanelF3Trigger.tsx:138-199` — `onF3Ready`, anropar send med `engineBaseVersionIdOverride`
- `src/lib/hooks/chat/useSendMessage.ts:261-281` — accepterar override, hoppar delvis över staleness-check
- `src/app/api/engine/chats/[chatId]/chat-message-stream-post.ts:361-388` — stale-base-409-gate

**Symptom / varför det är en bugg:**
F3 auto-kick skickar meddelande med `engineBaseVersionIdOverride` utan att serverside-gaten validerar `parentVersionId` mot preferred F2-version. En parallell F2-follow-up mellan finalize och F3-send → F3 forkar tysta integrationer från superseded bas utan 409-signal. Strider mot 5-2-kontraktet (stale-base-408-gate ska fånga alla paths).

**Motargument / caveat:**
Prob 3 (ej vanligt scenario); F3 triggas explicit av användaren, ej automatiskt. `engineBaseVersionIdOverride` är avsiktlig designventil för F3-flödet.

**Minsta säkra åtgärd:** Servergate i integrations-F3-läget: jämför `parentVersionId` mot preferred-versionen på servern; returnera 409 om stale, utan att kräva `engineLatestKnownVersionId` från klienten.

**Owner-filer:** `src/app/api/engine/chats/[chatId]/chat-message-stream-post.ts` · `src/components/builder/PreviewPanelF3Trigger.tsx`

**Föreslagen branch:** `fix/f3-stale-base-gate`

**PR-storlek:** S (2 filer, server-gate + klientanpassning)

**Verifiering:**
- Scenario: parallell F2-follow-up + F3-send mot samma chatId → förvänta 409 från F3.
- Befintliga stale-base-tester gröna.

**Grandmaster-kontrakt:** 5-2-kontrakt — stale-base-409-gaten ska täcka alla send-paths.

---

### B13 — clear-redesign delta-brief tappas vid contract-gate-retry (tur 2)

**Kind:** bug / follow-up pipeline

**Verdict:** Scout 06 + triage Rank 13 (ej externgranskad).

**Kodankare:**
- `src/app/api/engine/chats/[chatId]/chat-message-stream-post.ts:416-422, 492-551, 1080-1122`
- `src/lib/gen/follow-up-orchestration-input.ts:85-87`

**Symptom / varför det är en bugg:**
#169 fixade clear-redesign delta-brief för happy path (tur 1 → codegen). Men om contract-gate returnerar (tur 1) innan codegen → delta-brief persisteras inte. Tur 2: `currentReplyWasConsumed` → `neutral`-klassificering → snapshot-fallback; LLM fick aldrig redesign-deltan. Tur 1 byggde delta-brief men den försvann vid kontext-reset.

**Motargument / caveat:**
Prob 3; contract-gate-retry är inte det vanligaste scenariot. #169 täcker primärt flödet; kvarvarande gap är i retry-path.

**Minsta säkra åtgärd:** Persistera delta-brief temporärt i chat-meta vid contract-gate; återläs vid contract-gate-svar (tur 2).

**Owner-filer:** `src/app/api/engine/chats/[chatId]/chat-message-stream-post.ts` · `src/lib/gen/follow-up-orchestration-input.ts`

**Föreslagen branch:** `fix/clear-redesign-contract-gate-retry`

**PR-storlek:** S (2 filer, ~30–50 rader)

**Verifiering:**
- Scenario: clear-redesign + contract-gate returnerar → tur 2 ska ha delta-brief i prompt.
- `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** 5-4-kontrakt (F1 clear-redesign-brief ska nå orchestrate).

---

### B14 — CI: `test:followup-contract` hoppas över om `test:ci` failar

**Kind:** test-gate / infra

**Verdict:** Scout 11-F2 + triage Rank 14 (ej externgranskad). Logikgapet är trivialt och verifierbart.

**Kodankare:**
- `.github/workflows/ci.yml:36-45` — `test:followup-contract`-steget saknar `if: ${{ !cancelled() }}`
- `package.json:45-47` — `test:followup-contract`-script

**Symptom / varför det är en bugg:**
Standard GitHub Actions `if: success()` (default) → om `test:ci` failar av orelaterat skäl hoppas `test:followup-contract`-steget över → Grandmaster 5-5/5-3b follow-up-invariant kan vara trasig men CI är "grön" (steg hoppades, inte rött). Osynlig regression.

**Motargument / caveat:**
XS (1 rad). Enda motargumentet är att "cancelled" scenario är ovanligt; men principen att stability-tester alltid ska köras är klar.

**Minsta säkra åtgärd:** Lägg `if: ${{ !cancelled() }}` på `test:followup-contract`-steget i `ci.yml`.

**Owner-filer:** `.github/workflows/ci.yml`

**Föreslagen branch:** `fix/ci-followup-contract-gate` (protected path → NEEDS_HUMAN från auto-merge-automation)

**PR-storlek:** XS (1 rad)

**Verifiering:**
- CI-körning: `test:ci` misslyckas pga orelaterat test → `test:followup-contract` körs ändå (inte skippas).

**Grandmaster-kontrakt:** CI-lane ska skydda alla Grandmaster-invarianter, oavsett brus i `test:ci`.

---

### B15 — `finalizeOrchestrationPrompts` använder stale `generationMode`-derivering

**Kind:** bug (latent)

**Verdict:** Scout 04B + triage Rank 15 (ej externgranskad). Latent — builder-UI sätter alltid explicit mode, men API/MCP/CLI-callers är exponerade.

**Kodankare:**
- `src/lib/gen/orchestrate.ts:1386` — stale `generationMode`-derivering
- `src/lib/gen/orchestrate.ts:869-875, 1423-1428` — `deriveFollowUpStateFromInputs`

**Symptom / varför det är en bugg:**
`finalizeOrchestrationPrompts` (rad 1386) deriverar `generationMode` från stale källa istf `deriveFollowUpStateFromInputs`. Vid `persistedScaffoldId:null` + utelämnad `mode` (t.ex. API/MCP/CLI-caller) hoppar variant-frys över → scaffold-variant kan bytas på follow-up trots 5-3b-kontrakt.

**Motargument / caveat:**
Prob 2; builder-UI sätter alltid explicit `mode`. XS fix.

**Minsta säkra åtgärd:** Ersätt rad 1386 med anrop till `deriveFollowUpStateFromInputs`.

**Owner-filer:** `src/lib/gen/orchestrate.ts`

**Föreslagen branch:** `fix/generation-mode-derive` (kan slås ihop med B04 eller B06)

**PR-storlek:** XS (1 rad)

**Verifiering:** API-caller utan explicit `mode` + `persistedScaffoldId:null` → variant-frys ska gälla. `npm run typecheck` 0 fel.

**Grandmaster-kontrakt:** 5-3-kontraktet (scaffold/variant-frys på follow-up).

---

### B-GA — Google OAuth-fel loggar rått HTTP-svar

**Kind:** security / XS

**Verdict:** Scout 14-F2 (ej externgranskad). XS-fix, bundlas med säkerhets-quick-wins.

**Kodankare:**
- `src/lib/auth/auth.ts:468-470` — `console.error(..., await response.text())` utan redigering

**Symptom:** Vid misslyckad Google OAuth token-exchange loggas hela HTTP-svar (`response.text()`) till Vercel/loggaggregator. Oväntade/proxy-svar kan innehålla känsliga fält; brytar mot "Never log secret values!"-principen i `config.ts`.

**Motargument:** Standard OAuth-felsvar är oftast `error` + `error_description` utan access token. Sällan i prod om OAuth är korrekt konfigurerat.

**Minsta säkra åtgärd:** Logga bara `response.status` + parsad `error`/`error_description`; aldrig rå body.

**Owner-filer:** `src/lib/auth/auth.ts`

**Föreslagen branch:** slå ihop med B07 eller B11 i ett säkerhets-PR

**PR-storlek:** XS (2 rader)

**Verifiering:** Trigga ogiltig OAuth `code` i dev → lograden ska inte innehålla token-liknande strängar.

---

## 3. Kluster + rekommenderad körordning

### P0 — Kärn-UX (kör först)

```
B01  Vit iframe (M)
     fix/preview-version-mismatch-polling
     Blockerar: inget. Kör som allra första.
```

### Snabb-wins XS (parallellt med eller tätt efter P0)

```
B08  quality-gate fail-closed (XS)   fix/quality-gate-catch-fail-closed
B14  CI followup-contract gate (XS)  fix/ci-followup-contract-gate   [protected path → NEEDS_HUMAN]
B15  generationMode latent (XS)      fix/generation-mode-derive
B-GA Google OAuth loggning (XS)      slå ihop med B07 eller B11
```

### Dossier/capability-kluster (R3 → R4 → R5)

Kör B03 före B05 — B03 säkerställer att `selectedDossierIds` är korrekt ifylld, vilket B05-fix förlitar sig på.

```
B03  resolveSelectedDossiersFromSnapshot (S)   fix/snapshot-selection-brief-field
     → B04  FollowUpContract caps union (S)    fix/followup-contract-caps-floor
       (parallellt med B03)
     → B05  Dossier-refusal selected filter (M) fix/dossier-refusal-selected-filter
       OBS: prod-aktiv, DRAFT tills Jakes review. Omedelbar rollback via Vercel env.
```

### False-green/status-kluster (R8 + R9)

Kör B08 tidigt (XS), B09 lämpligen efter #179 är på plats (säkerställer att degradations hamnar i bus).

```
B08  quality-gate fail-closed (XS)   → B09  version-badge degraded-gate (S)
     fix/version-badge-degraded-gate
```

### Follow-up/pipeline (R6 + B12 + B13)

```
B06  route-removal context guard (S)  fix/route-removal-context-guard
B12  F3 stale-base gate (S)           fix/f3-stale-base-gate
B13  clear-redesign retry gap (S)     fix/clear-redesign-contract-gate-retry
```

### Säkerhet (separat säkerhets-PR, inte fold in i false-green-slice)

```
B07  media auth cross-tenant (S)      fix/media-auth-cross-tenant
B11  export-zip private blob (S)      fix/export-zip-private-blob
B-GA Google OAuth loggning (XS)       slå ihop med B07 eller B11
```

### Infra/migration (separat PR)

```
B10  migrate dependency order (S)     fix/migrate-dependency-order
```

### Körordnings-tabell

| Prioritet | ID | Branch | Effort | Kluster |
|---|---|---|---|---|
| P0 kärn-UX | B01 | `fix/preview-version-mismatch-polling` | M | Enskild |
| Quick-win | B08 | `fix/quality-gate-catch-fail-closed` | XS | false-green |
| Quick-win | B14 | `fix/ci-followup-contract-gate` | XS | infra (protected) |
| Quick-win | B15 | `fix/generation-mode-derive` | XS | pipeline |
| Quick-win | B-GA | (slå ihop med B07) | XS | säkerhet |
| Dossier 1 | B03 | `fix/snapshot-selection-brief-field` | S | dossier/cap |
| Dossier 2 | B04 | `fix/followup-contract-caps-floor` | S | dossier/cap |
| Dossier 3 | B05 | `fix/dossier-refusal-selected-filter` | M | dossier/cap (PROD) |
| Status | B09 | `fix/version-badge-degraded-gate` | S | false-green |
| Route | B06 | `fix/route-removal-context-guard` | S | follow-up |
| F3 gate | B12 | `fix/f3-stale-base-gate` | S | follow-up |
| Follow-up | B13 | `fix/clear-redesign-contract-gate-retry` | S | follow-up |
| Säkerhet | B07 | `fix/media-auth-cross-tenant` | S | säkerhet |
| Säkerhet | B11 | `fix/export-zip-private-blob` | S | säkerhet |
| Infra | B10 | `fix/migrate-dependency-order` | S | DB/migration |

---

## 4. Avfärdade / utanför listan

### R2 / Triage Rank 2 — STALE (utesluten)

`product-postcheck/route.ts` early-return saknar `emitPostcheckDegraded` — **löst av PR #179** (mergad 2026-06-21). `missing_preview_url`-grenen emitterar nu `version.degraded` korrekt. `feature_disabled`-grenen är medvetet default-OFF och utanför scope. Ingen åtgärd.

---

### Medvetet parkerade (backlog, ej droppa)

| Post | Varför parkerad |
|---|---|
| **B3**: multi-instans durable event-bus (Postgres `engine_events` eller Redis per `versionId`) | L-arkitekturbeslut; deploy-topologi; `_backlog-deferrad.md` B3 |
| **B2**: `readAll`-per-rad O(events²)-dedup/perf (Scout 01B-F3, 02B-F1–F3) | Perf, ej korrekthet; Set-dedup (XS) är isolerbar delfix men koordinera med event-bus-ytan |
| **B1**: S3-lane warn-only → blockerande (Scout 11-F1) | Lane-arkitekturbeslut; S3-symbol raderad; backlog B1 |
| **B4**: canvas GITHUB_TOKEN → ingen CI | Secret-beslut; protected path |
| **#140** DB/Blob sync-gate P1/High | Annans infra-spår; Codex P1 säkerhet; B7; parkat per Jakes beslut 2026-06-19 |

---

### Mergade i Grandmaster — ej regression

| Fynd | Merged | Varför avfärdat |
|---|---|---|
| N#6 event-bus UI-flip (builder läste DB-resolver) | Område 6 #159–163 | `selectVersionStatus` + `busStatus` aktiv; `resolveEngineVersionDisplayStatus` raderad |
| F1 clear-redesign delta-brief happy path | #169 | Täcker tur-1; kvarvarande = contract-gate-retry (B13) |
| Stale-base 409 follow-up-stream primär | #166 | Primär sökväg täckt; kvarvarande = F3 auto-kick bypass (B12) |
| Route hard-clamp + capabilities floor | #168/#172/#174 | 5-3b + 5-5 mergade; kvarvarande implementationsgap = B04/B06 |
| promote-guard `passed:true`→`promotionBlocked:true` | #149 | Guard-nekar täckt; kvarvarande = exception-catch (B08) |
| A7-2 env-doc | #177 | Registrerad i env-policy + ENV.md; prod-aktiv per Jakes go |
| Eval-namnskugga + `evals/` + `scripts/evals/` | #178 | Raderade; `scripts/eval/` + `src/lib/gen/eval/` kvar korrekt |

---

### Reserverade events / pre-emptiva

| Fynd | Varför avfärdat |
|---|---|
| Scout 01A-F2: `version.saved` suddar `verifierOutcome` | `version.saved` är RESERVED — ingen produktions-emitter; pre-emptiv risk vid framtida wire-up |
| Scout 01A-F3: `phase:"done"` + blockers → solid grön | `version.done` ej emitterat i runtime; display-lagret liten real impact |
| Scout 02A-F3: `promoted` från DB när bus tom → solid "Publicerad" | Intentional fallback; reell risk kopplad till B3 (durable event-bus) |

---

### Låg confidens / edge / intentionella designval

| Fynd | Varför avfärdat |
|---|---|
| Scout 03-F2: `snapshotBrief` delar muterbara refs | Prob 3/impact 2; inga kända in-place-mutationer i kodebasen |
| Scout 03-F3: Partial client brief ersätter snapshot-brief | Builder skickar sällan `meta.brief` på neutral follow-up; continuity-prosa kompenserar |
| Scout 04A-F1: `scaffoldMode:"off"` kringgår freeze | Builder-UI sätter aldrig `off` på follow-up; risk = extern API/MCP-caller |
| Scout 04A-F3: scaffold/variant-clamp tyst no-op vid registry-miss | Registry-ids från persisted snapshot; lookup-miss sällsynt |
| Scout 04B-F3: clear-redesign variant unlock + route freeze | Policy-inkonsistens; manuell pin = "behåll IA" → dokumentera som intended behavior |
| Scout 05-F2: nätverksfallback `/messages` saknar stale_base_version | Prob 2; sällsynt väg; korrekthet intakt server-side |
| Scout 05-F3: parallella follow-ups utan serialisering (race) | Känd begränsning; M effort; builder-coexistence-regeln noterar redan |
| Scout 06-F3: `metaBriefApplied` sant trots misslyckad delta-brief | Telemetri-semantik; ej functional gap |
| Scout 07A-F3: `assertPromoteAllowed` fail-open vid saknad telemetry | Intentionellt för legacy-rader; separat beslut från B08 (exception-catch) |
| Scout 07B-F1–F3: timing-race tier2/post-check/poll-cap | Smala tidsfönster; primärfönster täckt av #162 (nonce-refresh) |
| Scout 08-F3: A7-2 + `SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS` | Kräver BÅDA flaggorna ON; sanity-fallback sannolikt unset i prod |
| Scout 09-F3: `needsParallax`-bron injicerar alltid båda parallax-dossiers | Medvetet "skjut brett" på init; låg prioritet |
| Scout 10-F1–F3: döda env-nycklar (`LOG_PROMPTS`, `ENABLE_PEXELS`, `PLAN_MODE_*`) | Ren env-städ; ingen false-green; kan göras i Område 8-cleanup |
| Scout 11-F2: A7-1 false-green-test ej blockerande CI | Kan portas till `event-bus-projection.test.ts`; prioritet lägre än B14 |
| Scout 12-F2: `error_log_events` utanför Drizzle-schema | Medveten "telemetry side-channel utanför typed schema" (kommentar i `error-log-store.ts`) |
| Scout 12-F3: `db:init:soft` maskerar alla init-fel | Medveten dev-startup-resilience; dokumenterad |
| Scout 13-F2: heartbeat förlänger ej preview-host TTL | Prob 4/impact 3; Fly 2h-cap; recover-bootstrap triggas vid 404; lägre prio än B01 |
| Scout 13-F3: lokal media-fallback nås ej från Fly-VM | Dev-fallback; U#29 backlog |
| Scout 15-F1–F3: stale docs (llm-flow-canvas, repository-and-platform.md, external-template-pipeline-contract.md) | Rena docs-städ; låg agent-risk; Område 8-svansen |
| Scout 16-F1–F3: stale docs (llm-callsite-matrix.md rad 15, _backlog-deferrad.md B5(a), BUG-SWARM-BACKLOG.md N#6) | Docs-only-synk; runtime orörd |

---

## 5. "Var 10 nog?"

**Inkluderat:** 15 buggar (B01–B15 + B-GA, dvs. R1–R10 minus R2/stale + R11–R15 + bonus XS R-GA).

Det externgranskade topptio-skiktet (R1–R10) håller. R2 är stale (löst av #179). De fyra ursprungliga konfirmerade fynden R3+R4+R5+R8 är kodrena och isolerbara. R1, R7, R9, R10 är solida.

Utöver de externgranskade tio är B11–B15 + B-GA med ur Triage Rank 11–15 + säkerhetsbonus. Dessa är genuint åtgärdsvärda och inte "padding":

- **B11** (export-zip public) och **B-GA** (OAuth raw log) är klara säkerhetshygienfynd — XS/S, ska fixas.
- **B14** (CI-gate 1 rad) är trivial men skyddar en Grandmaster-invariant — ska göras.
- **B15** (generationMode XS) är latent men XS, ska göras i samband med B04/B06.
- **B12** (F3 stale-base bypass) och **B13** (clear-redesign retry) är uppföljningsgap på #166/#169 — reella buggar med S-effort.

**Exkluderat som genuint svagt:**
Runt 26 avfärdade fynd är antingen: (a) parkerade arkitekturbeslut (B1–B4, durable event-bus), (b) pre-emptiva reserverade events utan aktiv emitter, (c) intentionella designval (parallell race, `scaffoldMode:"off"` via API), eller (d) docs-only-synk. Ingen av dessa är rimlig att fixa i detta pass — de är korrekt lämnade till Område 8 eller längre backlog.

**Slutsats:** 15 inkluderade fynd (varav 9 externbekräftade, 5 scout-nivå + 1 XS säkerhetsbonus) ger en komplett, beslutsklar backlog. Ingenting starkt har lämnats utanför.
