# Beviskedja (2026-08-31/09-01)

Allt nedan är read-only-observationer från prod-DB, Vercel-runtimeloggen,
Fly preview-hosten och en egen live-session. Tider i UTC.

## 1. `SM-072` — `/tmp`-svält (chat `30840b09-04d2-4280-bea9-ec8e3809d785`)

Vercel runtime, `POST /api/engine/chats/30840b09…/product-postcheck`,
samma deployment `dpl_81XhZUJJFme37wZUd4stG6Js32i6`:

```text
19:36:58  postcheck v1 OK   free space: 513MB of 525MB
19:40:45  postcheck v2 OK   free space: 513MB of 525MB (live review desktop+mobile)
19:43:45  SKIPPED           free space:  31MB of 525MB
          [product-postcheck] skipped: Error: page.evaluate: Target page, context or browser has been closed
19:45:01  SKIPPED           free space:  23MB of 525MB
          [product-postcheck] skipped: Error: browser.newPage: Target page, context or browser has been closed
```

DB-spegel (`engine_version_error_logs`): `product_postcheck.skipped` med
`skippedReason: playwright_unavailable` (19:44:02) och `runtime_error`
(19:45:20). Overlayn `reportedQualityGate: product_postcheck_degraded` gav
"Degraderad"/"Preview klar med luckor" — medan `verification_state: passed`,
`release_state: promoted`, quality gate pass och live review pass (v1).

Defektsignatur `e18935fd85a9` (postcheck-skip): 6 chattar, first_seen
2026-08-22 — samma vecka som live review började dubbla Chromium-fångsterna.
Live review-signaturen `aca3fa7303fc`: first_seen 2026-08-31 (ny funktion).

DB-pool frisk: 0 träffar på `timeout exceeded when trying to connect` /
`EMAXCONNSESSION` i 24h-fönstret.

## 2. `SM-073` — ostämplad bridge-injektion (chat `cdf5e0aa-e35b-4720-a925-760c7b2780c4`)

Egen live-generering (kafésajt, ~3 min, postcheck pass, live review pass med
`modelId: gpt-4o`, version 1 = Publicerad + Verifierad). Trots det:

- "Inspektera preview" aktiv ⇒ ingen hover-markering; klick ger toasten
  **"Hovra över ett element först."** — den finns bara i kartläget, alltså
  hade bridge-motorn tyst fallit ner (5 s ready-timeout).
- Preview-HTML hämtad med `?inspect=1` visar injektionen:

```html
<script src="https://sajtmaskin.vercel.app/api/inspect-bridge?parent=https%3A%2F%2Fsajtmaskin.vercel.app" defer>
```

  — utan `versionId`/`previewSessionId`/`lifecycleToken`. Scriptet stämplar
  då `IDENTITY` med null och `bridgeIdentityStampMatches` i buildern avvisar
  allt, inklusive `ready` (fail-closed sedan #1201, 2026-08-27 — matchar
  "fungerade för ~en vecka sedan").
- Fly `/admin/sessions` svarade `{"count": 0, "sessions": []}` samtidigt som
  runtimen serverade sajten — sessionsmetadatan som
  `inspectInjectionScriptSrc` behöver var borta.
- Kartlägets elementkarta är död i serverless prod (koden själv:
  "i prod, där kartan är 503") ⇒ ytan blev en osynlig klickvägg.

Video- och skärmbildsartefakter laddades upp i agentkörningen 2026-08-31
(4x-video "inspector_test_4x_hover_klick_doda" med tidsstämplar verifierade
av oberoende videogranskning).

## 3. Bildgranskningens ägarskap

Prod-logg `product_postcheck.live_review`: `modelId: "gpt-4o"`, verdict
`pass`, confidence 0.95. Manifest `config/ai_models/manifest.json` →
workload `live_review`, `defaultModel: gpt-4o`, `fallbackModels: [gpt-5.5]`,
`codeEntry: src/lib/gen/verify/live-review.ts`. OpenClaw är grind + konsument
(`src/lib/openclaw/live-review-access.ts`), inte kritiker.

## 4. Merge-kön

Före åtgärd: #1218/#1220/#1221/#1222 gröna på alla required checks utom
`review-window` (ACTION_REQUIRED). #1218:s `merge:ready` postades 19:58 men
Codex-reviewkvoten var slut ⇒ inget kvalificerande kvitto ⇒ grinden kunde
aldrig bli grön för sin egen fix. Ägarmandat i chatt 2026-09-01 ⇒ admin-merge
i ordning #1218 (`2d6a6e544`) → #1220 (`df8963a43`) → #1221 (`ecbe5ddc0`) →
#1222 (`cef726eea`), dokumenterat i PR-kommentarer.
