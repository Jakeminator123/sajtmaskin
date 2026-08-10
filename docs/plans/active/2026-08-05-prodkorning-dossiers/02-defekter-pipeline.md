---
status: active
owner: unassigned
topic: Pipeline-/agent-defekter utanför dossier-kedjan från prod-körningen 2026-08-05 — OpenClaw auto-send (rotorsak funnen), postcheck-racet med fel felettikett, hydrering som preflight såg, klassificerar- och telemetriluckor.
created: 2026-08-05
source: Samma session som 00-master-plan.md. Rotorsaker filverifierade mot master; runtime-bevis ur prod-DB, Vercel-loggar och Fly.
---

# Pipeline-defekter utanför dossiers

## B1 — OpenClaw armerad autonomi kan aldrig klicka skicka — LEVERERAD i #846

**Fixad 2026-08-08 (PR #846, `SM-026` — arkivrad i
`docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-07-25.md` (git):**
parse:n memoiseras på `msg.content` och auto-send-effekten nycklas på
`messageId` med `action` läst via ref, så omrenderingar aldrig dödar
retry-kedjan. Regressionstest låser beteendet. Beskrivningen nedan är
historik.

Armering fungerar (mandat skapas, "Armerad: 2 follow-up(s) kvar"), fältet fylls
autonomt — men klicket kommer aldrig. Kortet står kvar på "Fyller fältet och
skickar…" för alltid, utan felmeddelande.

Rotorsak i `src/components/openclaw/OpenClawMessage.tsx`:

```ts
const parsed = parseOpenClawMessage(msg.content);  // rad 75 — nytt objekt per render
const action = !isUser ? parsed.action : null;     // rad 76
// ...
}, [action, setArmedMandate, setArmedContinuation, messageId]);  // rad 414
```

Ny `action`-referens per render → effekten körs om → cleanup sätter
`cancelled = true` och rensar timern → nya körningen bailar direkt på
`if (startedRef.current) return`. Retry-loopen dör; `attempts` når aldrig
`MAX_ATTEMPTS` (25 × 100 ms), så inte ens felstatusen visas.
Typewriter-effekten (`useSmoothText`) garanterar omrenderingar under
textavslöjandet, så felet är i praktiken deterministiskt.

**Fix-riktning:** stabilisera `action` (memoisera parse:n på `msg.content`)
eller nyckla effekten på `messageId` + primitiva fält i stället för
objektreferensen. Verifierat i prod: flaggorna (`OC_DEBUG`, `OC_EDIT`) är på
och var aldrig problemet. Övriga fellägen är katalogiserade i
subagent-rapporten (armed-continuation-abortvägar) men detta är den som bet.

**Sekundärt:** när autonomin till slut skickades manuellt fungerade hela
continuation-kedjan aldrig eftersom auto-send-kortet var dött — mandatets två
steg förblev ospenderade.

## B2 — Product Postcheck dör efter första körningen, med fel diagnos (hög)

| Version | Utfall | Tid |
|---|---|---|
| v1 | passed | 3,8 s |
| v2 | skipped `playwright_unavailable` | 17,6 s |
| v3 | skipped `playwright_unavailable` | 13,2 s |

Vercel-loggen visar det verkliga felet:
`page.evaluate: Target page, context or browser has been closed` — webbläsaren
dog mitt i kontrollen. `productPostcheckSkipReasonFromError` mappar det till
`playwright_unavailable`, dvs. installationsdiagnosen från #783-buggen, vilket
skickar felsökaren åt fel håll.

**Hypotes (tidsstödd, obevisad):** thumbnail-capturen laddade upp sin bild kl
18:57:42, en sekund efter postcheckens fall 18:57:41. Båda startar Chromium via
`launchCaptureBrowser` i samma serverless-funktion; thumbnail-vägen har
`finally { browser.close() }` och listar exakt detta felmönster som
`TRANSIENT_ABORT_PATTERNS` i `src/lib/projects/thumbnail-capture.ts`.

**Åtgärdsspår:** ~~(a) rätta skip-klassificeringen (browser-closed ≠
unavailable)~~ — **levererad i #841**: navigeringsmönstret testas nu före
browser-mönstret, så `page.goto`/`page.evaluate`-fel mot previewen klassas som
`navigation_failed`. Äkta launch-fel behåller `playwright_unavailable`.
**Kvar: (b)** ~~utred delad/konkurrerande Chromium~~ — **processlås i
`launchCaptureBrowser` levererad i #843** (launch→close per warm-instans).
Väntar prod-bevis att follow-up-versioner inte längre skippas med browser-closed.

Felklassen återkom i prod-körningen 2026-08-08 (chat `1b906aa1`, tre versioner
i rad) med `page.goto` i stället för `page.evaluate` — samma etikettfel, vilket
bekräftade rotorsaken innan (a) rättades.

## B3 — Hydreringsfel shippades trots träff i preflight (medel)

Preflight varnade exakt: "new Date() is used in render scope in
components/order-form.tsx" (`order-form.tsx:58`, `const now = new Date()`).
Icke-blockerande → shippades → small i webbläsaren → fångades av #778-mirroring
(`preview:client-error`). Samma felklass återkom alltså dagen efter #777, som
skrev prompt-regeln mot ecommerce-footerns `getFullYear()` — regeln täcker inte
formulärens render-scope.

Notera för felsökning: Next-overlayn pekade på `site-header.tsx (37:9)` — en
statisk `<Link>`. Overlayn visar reconciliation-punkten, inte källan.

## B4 — Miniatyrbilden fotograferar dev-miljön för tidigt (medel)

Bilden sparades (rättelse av sessionens första slutsats — DB lästes innan
uppladdningen hunnit ske), men:

1. **Next.js dev-badgen "N" syns i bilden** — previewen är `next dev`, och
   badgen följer med in i "Mina projekt".
2. **Hjältebilden är en tom platshållare** — `networkidle` (8 s tak) + fonts +
   400 ms räckte inte för bildinläsningen.
3. Mekanismen är fortfarande en ren timer: `CAPTURE_DELAY_MS = 8_000` i
   `src/app/builder/useProjectThumbnail.ts:20`, ingen readiness-koll. Här
   fungerade det för att VM:en var varm; kall boot (15–30 s) träffar
   splash-sidan. Routens doc-kommentar ("when a preview session becomes
   ready") beskriver inte koden.

## B5 — Klassificerare och telemetri ger svag signal (låg–medel)

- **`classifyVersionDefect`:** 10 av 15 signaturer i sessionen klassades
  `other`, inklusive alla fyra `quality-gate:verifier-blocking` (uppenbart
  compile-klass). Två signaturer har `file: "package.js"` — filnamn kapat vid
  punkten.
- **RAG-telemetrin (`error_log_events`):** 8 rader under sessionen, samtliga
  med `fix = null`, `outcome = null`. Tänkt som fault/fix-inlärning; fungerar
  som felräknare.
- **`Deep brief: på` i orkestreringskortet på varje uppföljning:** kortet
  skriver önskemålet (`promptAssistDeep`, `src/lib/hooks/chat/helpers.ts:803`)
  i stället för utfallet (`promptAssistDeepActive`,
  `src/lib/models/trace.ts:230` — kräver `canUseDeepBrief`, som är falsk för
  uppföljningar). Samma klass av fel som `tsc-skipped`-raden: konfiguration
  visas som verklighet.

## B6 — D-ID-avataren kopplar aldrig upp (låg)

`{"kind":"SessionError","description":"missing or invalid session_id"}` från
`@d-id/client-sdk`; panelen står på "Ansluter till mAIa..." permanent.
Textchatten opåverkad. Separat från OpenClaw-logiken.
