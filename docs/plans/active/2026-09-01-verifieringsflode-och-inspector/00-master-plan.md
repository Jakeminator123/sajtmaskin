# Verifieringsflöde + inspector — utredning och åtgärdsplan (2026-09-01)

Utredning körd 2026-08-31/09-01 på ägarens uppdrag: varför visar buildern
"Degraderad"/"Preview klar med luckor" på friska sajter, varför är
elementmarkeringen i preview-ytan död, och vem äger bildgranskningen
("ta en bild och få den granskad")?

Bugg-sanningen bor i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
(`SM-072`, `SM-073`, `SM-070`, `SM-025`) — den här mappen håller utredningens
helhetsbild, checklistan och beviskedjan. Radera mappen till `avklarat/` när
checklistan i [`01-checklista.md`](01-checklista.md) är avbockad.

## De tre bekräftade felen

1. **`SM-072` — `/tmp`-svält dödar postcheck-Chromium.** Warm Fluid-instans
   ackumulerar capture-artefakter; under en burst-session föll fritt utrymme
   513 → 31 → 23 MB på fem minuter och nästa launch dog
   (`Target page, context or browser has been closed`). Postchecken skippas
   (`playwright_unavailable`/`runtime_error`) och versionen visas som
   Degraderad trots att allt annat passerar. Skip-signaturen `e18935fd85a9`
   är plattformsbred (6 chattar sedan 22 aug — då live review dubblade
   Chromium-fångsterna per postcheck).
2. **`SM-073` — bridge-scriptet injiceras utan identitetsstämpel.** När
   preview-hostens sessionsstore tappat metadata injiceras
   `/api/inspect-bridge` med bara `parent=`-parametern. Buildern släpper
   (fail-closed sedan #1201, medvetet) alla ostämplade meddelanden, `ready`
   når aldrig fram, inspektorn faller tyst ner till kartläget — vars
   elementkarta är död i serverless prod. Resultat: en yta som sväljer klick
   och toastar "Hovra över ett element först" på en fullt Verifierad version.
3. **Merge-självlåsning.** #1218 (gör reviewkvittot advisory i
   `review-window`) kunde inte bli grön under den gamla grinden när
   Codex-reviewkvoten var slut. Ägaren mergade 2026-09-01 #1218 → #1220 →
   #1221 → #1222 med admin-bypass efter uttryckligt mandat i chatt
   (kommentar på respektive PR). Från och med #1218 på master är kvittot
   advisory och låsningen kan inte återuppstå i samma form.

## Bildgranskningens ägarskap (open claw-frågan)

Avsiktlig design, bekräftad i kod + prod-logg: workloaden `live_review`
(`config/ai_models/manifest.json`) med `gpt-4o` (fallback `gpt-5.5`) är
kritikern, körd av `src/lib/gen/verify/live-review.ts` inuti Product
Postcheck. OpenClaw/Sajtagenten är **inte** bildkritikern — den äger
åtkomstgrinden (`SAJTMASKIN_LIVE_REVIEW` ∧ `OC_EDIT` ∧ grant/auto-grant) och
får textdomen + bildlänkarna som chatkontext efteråt. Kanoniskt beslut:
`docs/decisions/README.md` 2026-08-27. Obs: auto-grant är på i prod trots att
`SM-070`-härdningen (Blob-retry, 7d-purge, attempt-budget) inte är klar —
öppet ägarbeslut, se checklistan.

## Åtgärder landade i denna ändring

| Åtgärd | Ägare | Status |
|---|---|---|
| `/tmp`-trycksvep: < 200 MB fritt ⇒ svep läckta Playwright-profiler äldre än 2 min (annars 15 min som förut) | `src/lib/capture/browser.ts` + test | Landad |
| Död kartläges-yta släpper igenom pekaren + amber-banner "Inspektorn kan inte läsa den här previewn" | `PreviewPanelInspectorDev.tsx` + test | Landad |
| Avvisat bridge-`ready` (fel identitetsstämpel) syns som status + console.warn — fortfarande fail-closed | `usePreviewInspectBridge.ts` + test | Landad |
| Backlog: `SM-072` + `SM-073` till Aktiv kö med bevis; `SM-025`:s avgörningsvillkor skärpt | `BUG-SWARM-BACKLOG.md` | Landad |

## Kvarvarande arbete (ej i denna ändring)

Kodfixar sedan utredningen: #1232 (sessionsrotation), #1234 (`/tmp` +
infra-retry + Degraderad→LLM-fix), #1237 (sanningsraden bort — öppen vid
avslut). Host-sidan av `SM-073` landade med Fly-deploy v59 2026-09-01.

- **Prod-burst (checklista B):** fritt `/tmp`, Verifierad vs Degraderad,
  inspector-hover, kamera-knapp. Utan det stannar `SM-072`/`SM-074` öppna
  i backlogen även om koden är mergad.
- **`SM-074` valfri serverhärdning:** follow-up-lanen ska inte handoff:a
  en session den vet inte kör (`reason=runtime_not_running`).
- **`SM-070`-beslut:** auto-grant för live review i prod av/på.
- **UX-svans (checklista F):** kompakt reparationskort, `logPassId` på
  postcheck, skarpare `cta_no_handler`.

## Beviskällor

Detaljerad beviskedja: [`02-bevis.md`](02-bevis.md). Artefakter (video på den
döda inspektorn, skärmbilder, Vercel-loggutdrag) laddades upp i agentkörningen
2026-08-31; loggutdragen är återgivna i bevisfilen.
