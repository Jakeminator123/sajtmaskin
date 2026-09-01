# Robusthetsfynd — live prod-session 2026-09-01

Källa: `/logg-internet`-session (chat `5efde3c4`, bageri, 3 versioner) +
Premium-körning (chat `63d0992f`, "Niklas käkar korv", `gpt-5.6-sol`, 12m55s).
Rådata och beviskedja: `.cursor/logg-internet/runs/2026-09-01_1412.md` (gitignored).
Master vid körning: `90f651aef` (#1240). Fly preview-host: v60. DB-paritet dev/prod: grön.

## Bekräftade fel (plattformen, inte sajterna)

| # | Fynd | Bevis | Ägare | Ägarbeslut |
|---|---|---|---|---|
| 1 | `preview_ready_timeout`-banner visas över frisk preview vid versionsrotation. Hosten var frisk (`session_bound_to_other_version`, `session_newer`); auto-resync-telemetrin läkte mismatchen men bannern hann visas. | Repro 14:13, chat `5efde3c4`; telemetri `version_mismatch_auto_resync → succeeded` | `usePreviewIframe.ts` (deadline-fail), `PreviewPanelFrame.tsx` ~rad 252 (banner), `diagnostics.ts` | **Ta bort banner-ytan helt** (Jakob 14:15). Recovery-logiken behålls. Ankare: SM-074 |
| 2 | Inspect-bridge-scriptet injiceras FÖRST i `<head>` (`injectPreviewHeadTag`, kommentar "viewer bootstrap is first in head") → Reacts hydrering matchar sajtens JSON-LD-script mot bridge-scriptet → hydration mismatch-console-error på FRISK genererad sajt. Kan mata falska `hydration_mismatch`/`console_error`-fynd till postcheck/RepairGate. | Console-diff 14:48 (chat `63d0992f`): server `type="application/ld+json"` vs client `src=.../api/inspect-bridge` | `preview-host/src/runtime/preview-proxy.js` (`injectPreviewHeadTag`, proxyRes-injektion) | Fixas: flytta injektionspunkt så hydrering inte störs. Samma felklass som caret-beslutet 2026-08-31 |
| 3 | Bildvalidatorn i finalize ersatte en död bild-URL med en annan död Unsplash-URL — utan att verifiera ersättningen. Samma 404 överlevde v1, v2 OCH v3 som postcheck-advisory; syns även som Next devtools "1 issue" + CORB-brus. | `photo-1464306076886` 404 i alla tre postchecks (bageri) | `validate-images`-flödet (finalize) + postcheck `broken_image` | Fixas: HEAD-verifiera ersättnings-URL + URL-skopad deterministisk om-fix på postcheck-fynd |
| 4 | Postcheck-/live-review-fynd som INTE är productBlocked går aldrig till autofix — kritikerns `targeted_repair`-issues (med exakt URL/selector) blir bara en badge. | v2 bageri: live review `targeted_repair` (404-bilden) → ingen åtgärd | `post-checks.ts` (autofix-grenen), `useAutoFix.ts` | Ägaridé: batcha utvalda advisory-koder + live-review-issues in i samma riktade autofix-runda efter gate-pass (vägen finns sedan ägarbeslut 2026-09-01) |

## Bekräftade svagheter (design/latens)

| # | Fynd | Bevis |
|---|---|---|
| 5 | Verifieringskedjan saknar serverägare: v1 (bageri) blev `pending` → uppföljning kom → `superseded` utan egen dom. Postcheck/gate är klientdrivna; resume-lanen ("Återupptar verifiering...") kör bara vid flikbesök. Sen resume bedömde dessutom v1 mot UPPFÖLJNINGENS önskemål (fel userRequest i bundlen). | v1 pending 11:55→12:01; sen postcheck 12:02 med prissektions-kritik |
| 6 | Kall kedja-latens: ~5m50s från version till "Verifierad"-toast för v2 (seriellt: preview-ready-wait → Chromium-bilder → live review ≤90s → `tsc` på Fly shared-CPU → promote). Varm kedja (v3): 55 s. Toasten kom ~2 min efter synlig preview — ägaren reagerade skarpt. | v2 12:01:04→12:06:55; v3 12:09:25→12:10:20 |
| 7 | Live review v1 (bageri) fick bara mobilbild (`has_desktop: false`) — desktop-skottet försvann tyst. v2/v3 fick båda. | `live_review_runs` chat `5efde3c4` |

## UX-beslut och polish

| # | Fynd | Ägare | Beslut |
|---|---|---|---|
| 8 | Versionsspaltens in-/utfällning: header-knappen "Versioner" ska BORT på desktop; panelens egen "Fäll in versioner" blir enda reglaget. Verifiera att infällt läge har fäll-ut-yta. | `BuilderHeader.tsx` ~714, `version-history-view.tsx` | Ägarbeslut 14:30 |
| 9 | LIVE-GRANSKNING-kortet upprepar sig: `rationale` och `reasoning` nästan identiska + två "Visa resonemang"-expanderare i samma meddelande. | `live-review-types.ts` (schema/prompt), live-review-kortet | Visa reasoning bara när den tillför; döp om expandern |
| 10 | a11y: fokuserad knapp inuti `aria-hidden`/`inert` i Sajtagenten-widgeten. | Sajtagent-widgeten | Låg prio |

## OpenClaw-genomgång (2026-09-01, chat `63d0992f`)

Extern granskning av hela LLM-flödet. Verifierat mot koden — så här landade
punkterna:

| # | OpenClaw-påstående | Verifiering mot kod | Åtgärd |
|---|---|---|---|
| A | 7 `cta_no_handler` är sannolikt falsklarm: kontrollen ser knappkomponenten men inte handlers via länkar, `asChild` eller React-props. | Stämmer. `evaluateProductDomSnapshot` godkände bara `inForm`/`type=submit`/`aria-controls`/`aria-expanded`; React-onClick, knapp-i-länk, `aria-haspopup` och `onclick`-attribut var osynliga. | **Fixat i denna PR**: snapshotet probar Reacts `__reactProps$`-expando (element + närmaste föräldrar), ankarwrap, `aria-haspopup` och `onclick`-attribut. Fynd bär nu `selector`, `detection` (testmetod) och `confidence` (hög/medel). |
| B | "9 varningar rapporterade, 7 redovisade" + dubbla gate-pass går inte att utreda; varje körning behöver run-id och räknare. | Delvis rätt: attestation-tupeln (chatId+versionId+previewSessionId+lifecycleToken+filesRevision) fanns redan på varje rad, men inget körnings-id och ingen reported/persisted-diff. | **Fixat i denna PR**: routen myntar `verificationRunId` per körning; alla persisterade rader + bus-events bär det; summaryn får `reportedWarningCount` vs `persistedWarningCount`. Gate-trigger-metadata (varför gaten kördes om) är kvar som uppföljning. |
| C | Preview-URL:en är chat-baserad → verifieraren kan i teorin granska fel version; kräver versions-handslag före skärmbilder. | Redan implementerat, starkare än förslaget: `waitForProductPostcheckPreviewRunning` (pre-capture handslag mot versionId+filesRevision), `bindProductPostcheckTarget`, dubbla `isTargetCurrent`-staket (efter postcheck och efter live review), supersede-fence i själva körningen före capture-uppladdning, attestation-validering vid persist. | Ingen kodändring behövdes. `verificationRunId` (B) kompletterar tupeln. |
| D | Kravtolkningen saknar spårbarhet (synlig kravlista efter brief, krav-mot-bild-kontroll); live-granskningen godkänner personutseenden utan bildbevis. | Stämmer som designlucka — briefen bedöms inte som effektiv byggspec efter scaffold/variant-tillämpning. | Ritbordsfråga, egen plan (för stor för denna batch). |
| E | Inga verkliga interaktionstester (spela spelet, felmatchning, omstart); kortblandning saknades på sajten. | Mobilmeny-klicktestet finns; djupare interaktionstester finns inte. Kortblandningen är ett sajtfynd, inte plattform. | Uppföljning — kandidat: utöka postcheckens klickprob för `onClick`-knappar. |

## Noterat, ingen åtgärd

- WASM/CSP-violation är report-only; kräver `'wasm-unsafe-eval'` först om CSP enforc:as.
- THREE.js-deprecation + WebGL Context Lost = landningssidans avatar, kosmetiskt.
- CORB-block = browserns skydd, brus.
- Follow-ups koncentrerar alla ändringar i `page.tsx` (309 rader) i stället för egna komponenter — mönsterobservation.
- Scaffoldval fungerade korrekt i båda körningarna (`agreement`; bageri high, korv medium via svag keyword+embedding-enighet). Variant `editorial-lux` via `hint-fallback`, template-referens `XOMN4texeRO`, inget addendum (saknar post i `variant-template-addenda.json` = medvetet ingen injektion).
- Icke-blockerande-designen höll: inga röda väggar av småfel; `superseded` visas neutralt ("Ersatt").
- Auto-grant för live review är på i prod trots öppen SM-070-härdning — sedan tidigare känd öppen ägarfråga.
