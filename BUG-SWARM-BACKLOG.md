# Bug-backlog (konsoliderad)

Bugggranskning **2026-10-19** mot `preview` **`d2bdd5c4b`** (plus #1634
`28375f143`) och `master` **`c3f62b636`**. 40 punkter verifierades read-only
mot koden, två per agent (20 agenter, Grok 4.7 xhigh): de 24 öppna raderna i
förra kön, `SM-025`/`SM-035`/`SM-071` ur repro-kön och svärmfynden `A#1`–`A#13`
från `.cursor/swarms/FINDINGS.md`. `SM-090` och `SM-077` stickprovades
dessutom av författaren. Rader som inte ingick är markerade som ej
omverifierade. Föregående snapshot (statuspass 2026-09-17) finns i git;
historikindex i
[`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

Detta är den enda kanoniska bugglistan. `.cursor/swarms/` är ett gitignorerat
triageförråd; bekräftade fynd lyfts hit med ett stabilt ID.

Kompletterande kodgranskning **2026-11-03**: 37 verifierade fynd från
`BUGGSVARM_2026-11-03.md` mot master `63dbb9ed25b9936d20fc0a21cb27967e1cab18c9`
och preview `e4f8c1f60d962b877928eaf3cb6cf267019e2b0a` (samma träd).
Fynden fick `SM-099`–`SM-131`; A6/A8/B5 hör till `SM-007` och M03 till
`SM-080`. Byggkortsfyndet `SM-132` kom till samma dag. Svärmens A/B/M-ID:n med
detta datum är skilda från äldre `A#`-referenser. Övriga äldre rader är inte
omverifierade genom detta tillägg.

**Levererat 2026-11-11:** fixarna mergades till preview i #1709
(`a7caef13c`, 2026-11-05) och är i produktion via promote #1715 (master
`b10654c91`, Production-deploy grön 2026-11-11). `SM-099`–`SM-132` ligger
därför i `## Arkiv`, utom `SM-105` som väntar på driftkonfiguration.
`SM-080`/M03:s browser-origin återstår.

**UI/UX-natten 2026-11-11** (rigg mot DEV, rapporter V/L/F/C/P och oberoende
granskning per PR): #1739, #1741 (chattens routing, etikett, räknare, kvitto),
#1742 (en förhandsvisningsstart per version, versionsindikator), #1743 (Sidans
utseende), #1744 (projektnamn, publiceringsnamn, versionshistorik), #1745
(CI-jobbet tål att apt-spegeln är nere), #1746 (Dator/Mobil, toast, «Stäng
förhandsvisningen», omstartsknapp) och #1747 (inmatningens layout) är i
produktion via promote #1754 (master `f86e6fcee`, 2026-11-20), tillsammans med
#1749, #1752 och #1753. Kvarvarande fynd därifrån är de ej arkiverade av
`SM-135`–`SM-152` och raderna med samma datum i de andra tabellerna.

**Släpp 2 2026-11-20:** promote #1771 (master `c3f8896ce`, preview `d2355eb56`)
tog #1756, #1757, #1758, #1759, #1762, #1764, #1765, #1766, #1769 och #1770.
Synken #1772 gav preview och master samma träd. Produktionen provades efter
båda släppen (rigg V-2). Efter #1754: ett sessions-id per chatt, men
efterkontrollen larmade falskt och färgbytet slog inte igenom (rättat i #1762
och #1757). Efter #1771: inget falsklarm, capture och miniatyrer fungerar på
Node 24, och färgbytet nådde den fyllda knappen. `SM-133`, `SM-137`, `SM-139`,
`SM-140` och `SM-146` ligger därför i `## Arkiv`.

Regler:

- `Aktiv kö` är den kanoniska ID-tabellen. Status-cellen skiljer `Öppen kodbugg`,
  `Befintlig fix-PR`, `Kodfix i preview`, `Kodfix i master`,
  `Kvarvarande driftprov`, `Delvis åtgärdad`, `Behöver aktuell repro`,
  `Under rättning` och `Lokal kodfix` (ännu inte levererad).
- Kodfix på både preview och master flyttas till `Arkiv` med bevis. Kodfix bara
  på preview stannar i kön tills promote.
- Varje aktiv rad har ett stabilt `SM-###`. Nästa lediga ID är `SM-165`.
- En draft-PR är inte en fix. Kolumnen «Bevis på `master`» anger alltid vilken
  gren beviset gäller.

## Aktiv kö

<!-- prettier-ignore -->
| Klar | Status | Prio | Fynd | Bevis på `master` | Nästa steg |
| --- | --- | --- | --- | --- | --- |
| [ ] | Delvis åtgärdad | P1 | `SM-080` Preview-isolering: shared-läget delar OS-identitet och filsystem mellan kundprojekt; per-chat-maskiner skiljer processerna men preview-sajterna delar fortfarande webbläsar-origin. Svärm 2026-11-03 `M03` bekräftar den senare gränsen. | Master `63dbb9ed2`: `preview-host/src/runtime/shared.js`, `runtime/machine-runtime.js`, `server/routes.js`, `src/components/builder/preview-panel/runtime/PreviewPanelFrame.tsx`. Health på `vm-fly-jakem.fly.dev` 2026-11-03 kl. 15:11:49 UTC visade `machine/configured:true`, release `1bcca87b63f8e2311dfcb97c99d392b28ae70321`; tidigare uppgift om ej driftsatt maskinläge är inaktuell. Det är inte ett E2E-isoleringsbevis. Gästmaskinerna är 2 vCPU/4 GB. | Bevara spärren tills nät-/tenantacceptans är dokumenterad. Levererat 2026-11-11: #1729 (gäst förstörs efter 25 min inaktivitet, kontrollplanet krympt) och #1727 (egen origin per chatt bakom `PREVIEW_HOST_ORIGIN_MODE`, default `path`). M03 klar 2026-11-20: flaggan är på i produktion (hostdeploy från `07672d2a`, `/health` visar `origin.mode: subdomain`), och tvåchattsprovet är sparat (rigg V-6: olika `p-…`-adresser, `localStorage` delas inte, fel värd ger 404, bashosten 307; gamla chattar öppnas på 115–125 s efter #1765). Återgång: `PREVIEW_HOST_ORIGIN_MODE=path` och hostdeploy. Kvar därefter: cookies med `Domain=sajtmaskin.com` delas mellan previews tills PSL-post eller egen domän finns. Ingen isoleringsacceptans är gjord. |
| [ ] | Delvis åtgärdad | P1 | `SM-081` Parallella genereringar kan inte längre passera samma kreditförkontroll, men det finns ingen budgetreservation eller kostnadstak. | `src/lib/credits/generation-admission.ts:13`, `src/lib/gen/stream/generation-lock.ts:135`; preview och master. Utan Redis i production/preview nekas starten med 503. | Kvar: faktisk reservation/kostnadstak och övriga betalda körvägar. Beställ inte kontolåset igen. |
| [ ] | Delvis åtgärdad | P1 | `SM-072` Chromium-captures kan svälta `/tmp` på en varm Fluid-instans; en burst kan döda nästa launch. | `src/lib/capture/browser.ts:203` och `:395`: core-dumpar rensas före launch och `browser_crashed` visas inte som Degraderad, men profiler yngre än 300 s lämnas kvar. #1572 (`0fb453660`, utan `--single-process`) finns på preview och master. Burst-evidens preview 2026-09-20 (chat `a0b134d9`, 382–979 MB). Inert Vercel-prov 2026-10-07: 12/12 browserliv exit 0 utan dump/profil/överlevare; arkiv `capture-vercel-sm072-20261007.zip` (SHA256 `4b7cf420…a588a7d`) hos ägaren. | Kvar: säker städning av unga profiler under tryck och ett produktburstprov (init + minst två follow-ups på varm captureväg) utan `playwright_unavailable`, med /tmp, RSS och native exit mätt. Överlappande cross-isolate-last är obevisad. Ägdes tidigare av verifieringsplanen (avklarad 2026-11-11). |
| [ ] | Delvis åtgärdad | P1 | `SM-073` Inspector-bridgen stämplar bara meddelanden när `previewSessionId` finns; utan den släpper parent fail-closed. | `preview-host/src/runtime/inspect-bridge-src.js:44`, `src/components/builder/preview-panel/inspect/usePreviewInspectBridge.ts:390` (`93a9a0d2f`); preview och master. Ett avvisat ready visas nu i stället för att dö tyst. | Kvar: prod-stickprov (hover inom ~1 s på färsk sajt) eller stämpel även när sessionsmetadata saknas, plus driftprov mot hibernerad VM efter >10 min idle (ny session adopteras, ingen evig `preview_ready_timeout`). Icke-blockerande UX-rest: kompakt reparationskort, `logPassId` på postcheck, falska `cta_no_handler`. |
| [ ] | Behöver aktuell repro | P1 | `SM-092` Resend nekade verifieringsmejl i prod med 403 «domain is not verified»; då kan en nyregistrerad inte verifiera sin e-post. | `src/lib/email/send.ts:153` klassar felet som `sender_not_verified`, `src/app/api/auth/register/route.ts:102` och `auth-modal.tsx:156` visar det; ingen retry. Senast i prod 2026-09-16. | (1) Kontrollera Resend-status för `sajtmaskin.se`. (2) Kör ett riktigt registrerings-/verifieringsmejl. PASS ⇒ arkivera; fortfarande 403 ⇒ launch-blockerande providerkonfiguration. Bygg ingen ny mejlväg. |
| [ ] | Öppen kodbugg | P2 | `SM-090` Planläget bygger systemprompten med `\n\n---\n\n` i stället för `SYSTEM_PROMPT_SEPARATOR`, så prod-asserten `missing-separator` slår. | `src/lib/own-engine/session/own-engine-plan-mode.ts:30` mot `src/lib/gen/system-prompt/compose.ts:35`; asserten anropas från `src/lib/gen/engine.ts:161`. Samma på preview och master. Prod: 5 träffar t.o.m. 2026-09-15 på båda stream-rutterna. | Låt planläget använda samma separator (eller sammansättning) som codegen. Sänk inte asserten till varning. |
| [ ] | Öppen kodbugg | P2 | `SM-001` Repair-accept skriver över samma versions `files_json`; ingen rollbackpunkt skapas. | `src/lib/db/chat-repository/repair.ts:386` (preview), `:281` (master): `acceptRepair` skriver payload över versionsraden och nollar `repaired_files_json`. | Avgör om accept ska skapa ny version eller filhistorik. |
| [ ] | Öppen kodbugg | P2 | `SM-094` Billing-upserten kopplar aldrig kampanj i efterhand: en version som först skrevs utan `campaign_entitlement_id`/`campaign_phase` får dem aldrig. Från svärmfynd `A#13`. | `src/lib/db/services/generation-billing.ts:196` (`onConflictDoUpdate`); preview och master. Debiteringen läser bara de sparade kolumnerna. Visningen täcks av #1630, debiteringen inte. | Sätt kampanjfälten i konfliktgrenen och lås med test. |
| [ ] | Öppen kodbugg | P2 | `SM-095` Falskgrönt: warm-tsc sätter `repaired:true` när LLM-fixern rapporterar success utan ny `tsc`, så yttre status blir `passed` med `errorsAfter:0`. Från `A#5`. | `src/lib/gen/autofix/validate-and-fix.ts:333` och `:563`; testet `validate-and-fix.test.ts:286` låser beteendet. Preview och master. | Kör om `tsc` efter fixern innan `repaired`, och ändra testet. |
| [ ] | Delvis åtgärdad | P2 | `SM-093` Flera flikar på samma `chatId` kan hålla en version i `pending` via upprepad `preview_superseded`. | Preview: 8 s backoff och högst en omstart per körning (`src/lib/gen/verify/server-verify/verify-run.ts:443`), men `superseded` räknas inte mot försökstaket 3 eller hold-taket 20 (`src/lib/db/services/server-repair-budget.ts:86`), så `pending` kan förnyas i upp till sju dagar. Master: `scheduleRetry` utan tak. | Räkna supersede mot ett tak eller avbryt i stället för att lämna `pending`. Repro med exakt två flikar. |
| [ ] | Delvis åtgärdad | P2 | `SM-091` Import-zip som ger 403 efter lyckad metadata säger inte om orsaken är privat repo, utgången token eller borttaget arkiv. | `src/lib/import/github-import-transport.ts:334` och `:470`; preview och master. Rå «Archive download forbidden» är ersatt med svensk text; meta-403 har egna meningar. | Skilj orsakerna i zip-403 när det går; kör privat-repo-smoken när `TEST_USER_*` finns. |
| [ ] | Delvis åtgärdad | P3 | `SM-030` En `postgres-drizzle`-dossier kan samexistera med en senare Mongo-markör, så BuildSpec/prompt bär två databasidentiteter. | `detect-integrations.ts:221` matchar fortfarande Mongo; preview kan 409-stoppa en godkänd Mongo-markör mot igenkänd postgres-drizzle-kärna (`tier3-readiness.ts:541`), master saknar spärren. `align-database-marker.ts` finns inte; #1414 stängdes utan merge. | Kvar: promptbygget när spärren inte tar. Reproducera innan ny kod landar. |
| [ ] | Öppen kodbugg | P3 | `SM-098` `hooks:install:soft` sväljer en hookinstallations-exit 1 och `predev` kör den vid varje dev-start, så pre-push kan saknas tyst. Från `A#12`. | `package.json:38`, `scripts/dev/predev.mjs:31`, `scripts/dev/install-git-hooks.mjs:444`; preview och master. Konflikttexten skrivs till stderr men dev fortsätter. | Gör saknad pre-push synlig vid dev-start eller i `npm run inbox`. |
| [ ] | Kvarvarande driftprov | P2 | `SM-105` Oautentiserad konversationsendpoint kunde skicka leadmejl till fasta mottagare. Svärm 2026-11-03 `A9`. | Bearer-guard i `src/app/api/did/conversation/route.ts` via #1709 (`a7caef13c`), i produktion via #1715 (`b10654c91`). Utan `DID_CONVERSATION_WEBHOOK_SECRET` svarar routen 503 (fail-closed). | Sätt `DID_CONVERSATION_WEBHOOK_SECRET` i Vercel och matchande Bearer hos D-ID, kör ett syntetiskt prov. PASS ⇒ arkivera. |
| [ ] | Öppen kodbugg | P2 | `SM-134` `OBSERVED_PHASES` i `src/lib/observability/metrics.ts` är inaktuell och `metrics.test.ts` låser den. | `src/lib/observability/metrics.ts`, `src/lib/observability/metrics.test.ts`; preview. | Härled listan från faktiska faser och uppdatera testet. |
| [ ] | Delvis åtgärdad | P2 | `SM-135` Generatorn: ändringen «gör knapparna mörkgröna» gav 1 av 3 knappar i riggbygge 2 (2 av 3 i bygge 1), och den gröna «Hitta hit» fick mörk text på mörkgrönt, nästan osynlig. | Riggbyggen 2026-11-11 mot DEV: chatt `c023c7ff` v2 (`rgb(48,75,56)` på 1 knapp) och `6d05c34a` v2. Färgbytet: [#1757](https://github.com/Jakeminator123/sajtmaskin/pull/1757) gav kontraktet i `config/prompt-core/03-visual-design.md` (ändra raden i `@theme inline`, ingen parallell token), pinning av `app/globals.css` vid färgord och eval-fallet `button-recolor`. Kontrasten: [#1770](https://github.com/Jakeminator123/sajtmaskin/pull/1770) gör `src/lib/gen/autofix/rules/button-contrast-check.ts` rådgivande; den rättar inget och skriver knappar under 3:1 till `generation_telemetry.meta.buttonContrast` (beslut 2026-11-20). Båda på master via #1771 (`c3f8896ce`). Prod före #1757 (V-2, chatt `3fdcf6be`): «…mörkröda» gav 0 av 8 knappar, eftersom modellen satte `--color-primary` i `@layer base`. Prod efter #1771 (V-2 § 13, chatt `2500f0ee`): «Gör knapparna mörkröda» ändrade raden i `@theme inline` till `#752f35`, 1 av 1 fylld knapp bytte färg, kontrast 9,06:1. Riggen mot DEV gav 2 av 2 (`#782d35`, 9,15:1). | Läs `meta.buttonContrast` efter ett antal byggen i produktion och avgör om automatisk rättning behövs, i så fall bara för verifierade shadcn-knappar. Med låst `themeColors` (`SM-143`) kan ett färgbyte fortfarande bli halvt. Räcker inte kontraktet: en deterministisk varning när `--color-*` deklareras utanför `@theme` (verkningslöst). |
| [ ] | Öppen kodbugg | P2 | `SM-136` Projektlistan hämtar status för varje projekt parallellt, cirka 95 anrop för ett stort konto, och varje anrop läser flera tabeller. | `src/app/projects/page.tsx:114` (`Promise.all` → `getProjectSite`); preview `805ef6313`. | Serverpaginering och lat status för synliga kort (listan visar redan 24 åt gången). |
| [ ] | Delvis åtgärdad | P3 | `SM-138` Startsidan 1440×900: kortet (lanyard) överlappar rubriken, snöret korsar menyn och «Skapa första utkastet» hamnar under vecket. Rigg V-16, 80 % (kortet animeras). | #1759 (`bebd9500e`), på master via #1771 (`c3f8896ce`): det statiska kortet storleksätts efter stagens höjd (`lanyard-static-fallback.tsx`) och ryms i stagen; 3D-kortet ritas redan inom sin canvas, och animationen är orörd. «Snöret korsar menyn» är inte återskapat i kod; troligen cookiekortets flyganimation efter valet (`translateY(-24vh)`, `z-[200]` i `lanyard-experience.tsx`), som finns kvar. Inte fotograferat efter cookievalet. | Ny bild 1440×900 under och efter cookievalet. Kvar: «Skapa första utkastet» under vecket. Desktopstagen är orörd eftersom den styr 3D-kortets storlek. |
| [ ] | Öppen kodbugg | P3 | `SM-141` Hostens startsida säger «laddar om automatiskt om några sekunder» i över en minut vid första start: 71 s i riggbygge 1 (statuskortet klart 217 s, sajten synlig 288 s; V-15) och cirka 74 s i bygge 2 (startsidan syntes 136–210 s; rigg V § 8). | `preview-host/src/runtime/preview-placeholder-page.js:30-31`; preview `805ef6313`. | Säg att första starten kan ta ett par minuter, eller visa förlopp. Hoständring kräver egen deploy och måste fungera mot både master- och preview-appen. |
| [ ] | Öppen kodbugg | P3 | `SM-142` En flik mot en utgången eller okänd chatt laddar om hostens 503-startsida var fjärde sekund utan slut (från #1733; kommentar på #1740). | `preview-host/src/runtime/preview-proxy.js:336-356` (`sendPendingSessionNavigationPage`, `retry-after: 4`) + `preview-placeholder-page.js:53` (`meta refresh 4`); preview `805ef6313`. | Övre gräns (till exempel sluta efter cirka 10 minuter) eller växande intervall. Hoständring, se `SM-141`. |
| [ ] | Öppen kodbugg | P3 | `SM-143` Färglåset (F D4): uppföljningar skickar `themeColors` låst från `designTheme`, så ett färgbyte i chatten krockar med låsta tokens. En omladdad eller URL-öppnad chatt tappar i stället låsningen av primary/secondary/accent (R-1743). «Design & färger» efter första bygget väntar på detta. | `src/lib/hooks/chat/useSendMessage.ts:299`; preview `805ef6313`. | Beslut 2026-11-11: låset och «Design & färger» ändras inte utan eval. Eval-fall först, sedan `themeColors` bara när temat uttryckligen bytts för rundan; «Design & färger» som förifylld text (`fill-chat-input.ts`), aldrig autosänd. |
| [ ] | Öppen kodbugg | P3 | `SM-144` Byggval (F): Stil pinnar variant, så Ton- och Färgläge-nyckelord når inte variantvalet (D3). Byggval utom tema överlever inte en inloggningsomdirigering (modulstore). | `src/lib/builder/init-build-choices.ts`; preview `805ef6313`. | D3: dokumentera eller låt nyckelorden välja inom stilens varianter. Inloggning: spara valen som utkastet (`pending-builder-draft.ts`). |
| [ ] | Öppen kodbugg | P3 | `SM-145` Förhandsvisningen laddas om en extra gång efter att sajten syns (cirka 2 s per öppning): ready-reloaden efter running-kvittot kan inte skilja hostens startsida från sajten. | `src/components/builder/preview-panel/runtime/usePreviewIframe.ts:319` (`startTier2ReadyReload`); rigg 2026-11-11 (omladdning 31,7 s); preview `805ef6313`. | Hoppa över omladdningen när `usePreviewRouteBridge` redan sett sajtens dokument för samma identitet. Känslig `SM-074`-logik. |
| [ ] | Behöver aktuell repro | P3 | `SM-147` Inspektionens elementkarta (map-motorn, när bridgen är av) mäts inte om vid byte Dator/Mobil; hover-rutorna hamnar fel tills inspektionen slås av och på (R-1746, ej verifierat). | `src/components/builder/preview-panel/inspect/usePreviewPanelInspectMapPlacement.ts:286-290`; preview `805ef6313`. | Repro: slå på inspektion, växla till Mobil, hovra. Bekräftat ⇒ mät om vid breddbyte. |
| [ ] | Behöver aktuell repro | P3 | `SM-148` Publiceringsadressen kan få ett team-suffix: dialogen visar `<namn>-<suffix>.vercel.app`, men Vercel kan ge ett alias med teamnamn när namnet är upptaget. | `src/components/builder/publishing/DeployNameDialog.tsx` + `src/lib/vercel/project-name.ts`; #1739 visar därför det attesterade aliaset som «Teknisk adress»; preview `805ef6313`. | Prova en namnkollision på preview; bekräftat ⇒ dialogen säger att adressen kan avvika och portalen visar den faktiska. |
| [ ] | Öppen kodbugg | P3 | `SM-149` Projektnamn: när servern svarar `renamed: false` behåller fliken «Namnlöst projekt». Publiceringsdialogen föreslår då promptnamnet och skriver synligt över ett namn som satts i `/projects` (R-1744). | `src/app/builder/page-controller/project-naming.ts` (#1744); preview `805ef6313`. | Sätt `appProjectName` från svarets `project` när `renamed` är `false`. |
| [ ] | Öppen kodbugg | P3 | `SM-150` Routingrester (R-1741): åsiktsfrågor med bilaga («Skulle du byta hjältebilden mot den här?», «Gör den här bilden sidan för långsam?») blir bygge, och «Hej! Kan du lägga in den här loggan?» blockeras. Etiketten visar mottagaren före Skicka, så inget sker tyst. | `src/lib/builder/composer-route.ts:131` (`BUILD_OPENERS`) och `:266`; preview `805ef6313`. | Tillåt hälsning före kan/skulle/vill. Åsiktsfrågor bara med testfall för båda riktningarna. |
| [ ] | Öppen kodbugg | P3 | `SM-151` Text i chatten: strukturerad vy delar inte ut «Tekniska detaljer» (R-1741); första byggets kontrollrad nämner alltid «öppettider, priser, kontaktuppgifter och omdömen», även för en app; Sajtagentens systemprompt säger «Prompt-assist» i stället för UI-namnet «Förbättra texten». | `src/components/builder/chat/MessageList.tsx` (grenen som renderar `GenerationSummary`), `src/lib/gen/stream/turn-summary.ts:44`, `src/app/api/openclaw/chat/route.ts:75` och `:79`; preview `805ef6313`. | Små textändringar; kontrollraden kan följa byggets intent (hemsida/app). |
| [ ] | Öppen kodbugg | P3 | `SM-152` UI-rester från riggen: utfällda «Tekniska detaljer» i versionshistoriken har större monotext än kortet och bryter ord mitt i («skippe d»); den hopfällda knappen «Skriv till chatten» hamnar i kortets gamla hörn och täcker sajtens ingress. Genererade sajter får engelska sidnamn (`/pricing`, `/contact`) i svenska sajter. | `src/components/builder/version-history/version-history-view.tsx` (#1744), `src/components/builder/chat/FloatingCollapsedChatInput.tsx` (#1747); sidnamnen: riggbyggen 2026-11-11 (generatorn). preview `805ef6313`. | Mindre monotext och `break-words`; placera den hopfällda knappen vid kanten. Sidnamnen, utrett 2026-11-20 utan ändring (G-2): svenska nyckelord ger engelska vägar i `src/lib/gen/route-plan/route-patterns.ts` («kontakt» → `/contact`), sidnamn utan path ger svensk slug utan å/ä/ö (`planning-helpers.ts`), och `locale-dedupe.ts` slår bara ihop fyra språkpar. Minsta väg: svenska vägar per locale i `route-patterns.ts`, fler par i `locale-dedupe.ts` och svenskt exempel i briefschemat (`src/lib/builder/site-brief-generation.ts`), cirka sex källfiler plus tester. Först regeln att befintlig väg vinner på uppföljning, annars `/kontakt` bredvid `/contact`. Engelska sajter kräver en språksignal i briefen, eftersom locale i praktiken alltid är `sv`. |
| [ ] | Öppen kodbugg | P3 | `SM-153` Kurerade paletter: knapptexten når inte WCAG AA 4,5:1 i alla tio scaffold-standardteman (vit på `oklch(0.58 0.16 258)`, 4,10:1), 11 av 41 scaffold-varianter (lägst `warm-local` 3,19, `friendly-saas` 3,53, `studio-soft` 3,66, `boutique-warm` 3,78) och 13 av 26 klusterpaletter (lägst `indigo` ljus secondary 3,95). Ingen under 3,0. | Mätt 2026-11-20 med `color-contrast.ts` (#1757) mot `src/lib/gen/scaffolds/*/files/app/globals.css`, `config/scaffold-variants/**` och `THEME_CLUSTERS` i `src/lib/builder/theme-presets.ts`; full tabell i #1757. Sedan #1770 rättar `src/lib/gen/autofix/rules/button-contrast-check.ts` inget; den rapporterar knappar under 3,0 (`BUTTON_TEXT_MIN_CONTRAST`) till telemetrin, så paletterna larmar inte i dag. | Rätta vid källan så att vit text når 4,5:1 (mörkare märkesfärg) eller sätt mörk förgrund där det är avsikten. Höj sedan `BUTTON_TEXT_MIN_CONTRAST` till 4,5; testet «finds nothing for the default and secondary Button on every curated palette» (`button-contrast-check.test.ts`) är rött tills paletterna klarar det. |
| [ ] | Öppen kodbugg | P3 | `SM-155` Ett konto över projekttaket kan inte bygga om ett äldre projekt som har sparad kod men ingen `engine_chats`-rad, till exempel ett betalkonto som sjunkit till 100 krediter eller färre med tio byggda projekt. Under taket går det. | `src/lib/projects/project-cap.ts:54`: bara ett projekt med chatt passerar; övriga prövas mot ägarens byggda projekt utom det aktuella. Postgres-kontrakt i `scripts/db/project-cap.postgres.test.ts`. Codex-tråd på #1769 och granskningarna av #1769 och #1771; master `c3f8896ce`. | Undanta bara projekt som både skapades och hade sparad kod före släppet #1771, enligt tidsstämplar som databasen sätter (kolumnen avgörs vid fixen). Bara `app_projects.created_at` räcker inte: tomma projekt från före #1771 räknas inte längre mot taket, så ett gratiskonto med åtta gamla tomma projekt skulle kunna bygga dem utöver taket. Ett undantag för «redan byggt» duger inte: `src/app/api/projects/[id]/save/route.ts` låter klienten skriva kod och `chat_id`. |
| [ ] | Öppen kodbugg | P3 | `SM-156` Deep Brief körs innan projekttaket säger nej: ett gratiskonto på 8 av 8 med en tom platshållare öppen får briefen gjord och 403 först när bygget startar. | `src/lib/hooks/useInitBrief.ts:116` anropar `/api/ai/brief`, som inte prövar taket; bygget prövar det först i `src/lib/api/engine/chats/create-chat-stream-post.ts:246`. Användaren debiteras inte, eftersom briefens kostnad dras när bygget committar (`briefUsageClaimKey`), men Sajtmaskin betalar LLM-anropet. Granskningen av #1766; master `c3f8896ce`. | Pröva taket med `checkProjectCapForFirstChat` före briefen, eller visa taket redan när buildern laddar en tom platshållare. |
| [ ] | Delvis åtgärdad | P3 | `SM-158` Versioner byggda före #1762 kan bära ett falskt `blocked` från efterkontrollen: dolda `[data-nextjs-dialog]`-element (Next 16.4.2:s säkerhetsnotis) räknades som felöverlägg. Sådana versioner visar varningstriangeln, live review hoppades över och Sajtagenten upprepar larmet. | Detektorn kräver ett synligt överlägg sedan #1762 (`detectNextErrorOverlayInBrowser` i `src/lib/gen/verify/product-postcheck.ts`), master via #1771 (`c3f8896ce`). Prod 2026-11-20 före fixen (V-2 § 8b, chatt `3fdcf6be`): undersidorna hela men `productBlocked: true`. Efter fixen (V-2 § 13): `productBlocked: false`, 0 varningar. Antalet sparade falska `blocked` i PROD är inte räknat. | Räkna read-only i PROD hur många versioner som bär verdiktet, och avgör sedan om de ska omverifieras eller lämnas. Ingen DB-skrivning utan eget mandat. |
| [ ] | Öppen kodbugg | P3 | `SM-160` För admin visar «Visa detaljer» modellens råa resonemang på engelska, hackigt och svårläst. | `src/components/builder/chat/GenerationSurface.tsx:44`: admin ser resonemang, arbetslogg och råtext; andra får en svensk sammanfattning. Prod 2026-11-20 (V-2 § 13, chatt `2500f0ee`). | Visa admin samma svenska sammanfattning först och råtexten bakom en egen knapp. Rör bara admins vy. |
| [ ] | Kodfix i preview | P2 | `SM-163` En omladdning av buildern mitt i en visning kunde ge en ny kallstart (cirka 2 min och en ny maskin): buildern bad hosten pausa maskinen vid `pagehide`, som också kommer vid en omladdning, och hosten väcker inte en pausad session när den nya sidan frågar efter status. Stallknappen visades dessutom efter 120 s, mitt i en normal kallstart (115–125 s). | Ej på master. Fix på preview (beslut 2026-11-21): ingen pausning vid `pagehide` i `src/components/builder/preview-panel/runtime/usePreviewHeartbeat.ts`; en dold flik pausas efter 10 min som förut, och en stängd flik tas om hand av hostens tomgångsstopp (dev-servern efter 10 min, maskinen efter 25 min som förut). Stallknappen efter 3 min (`useStalledFlag.ts`). Underlag: prod 2026-11-20, rigg V-6 § 4. | Efter promote: ladda om buildern mitt i en visning i produktion två gånger; sajten ska synas utan ny kallstart. Att hosten väcker en pausad session i stället för att skapa en ny står kvar under «Preview-livscykel». |
| [ ] | Delvis åtgärdad | P3 | `SM-154` Projekttakets betalgräns: ett konto räknades som betalande först över 100 krediter (`isPaidProjectTier`), så en betalande kund med 100 krediter eller färre fick gratistaket 8, och admin hade inget undantag. | Ej på master. Admin får betaltaket på preview (beslut 2026-11-21, `src/lib/projects/project-limit.ts`). | Före MVP-prissättning: låt `isPaidProjectTier` följa köp (`transactions.type = 'purchase'` med Stripe-session) eller en aktiv sajtprenumeration i stället för saldot. Fem filer och sju anrop (init, projects, prompts som även bär audit-handoffen, template och tre i `create-chat-stream-post`) behöver då ett asynkront uppslag. |
| [ ] | Kvarvarande driftprov | P3 | `SM-164` Cookiekortet på desktop kräver ett val innan startsidan syns, medan mobilen har en remsa sedan #1759. Vad remsan kostar i samtycken (Google Ads) är inte mätt. | Beslut 2026-11-21 i [`docs/decisions/README.md`](docs/decisions/README.md): kortet står kvar under mätningen. | Mät andelen besök med sparat val på mobil mot desktop fram till 2026-12-19. Minst 90 % av desktops andel: byt till remsan även på desktop (`src/components/layout/cookie-banner.tsx`). Annars: arkivera raden. |

MVP före öppen lansering: `SM-080` (isolering) är spärren; `SM-092` måste
kontrolleras live. Grinden «`SM-096`/`SM-097`/`SM-077` före nästa promote» är
uppfylld: fixen #1650 nådde master via #1655 och raderna är arkiverade.
Kvarvarande scheduler/`CRON_SECRET` för server-resume är en beslutsfråga under
`## Väntar på ägarbeslut`.

Äldre svärmfynd `A#1` (#1634), `A#2` (#1633), `A#3` och `A#4` (#1632), `A#8`,
`A#9` och `A#11` (#1635) är i produktion; master och preview har samma
träd 2026-11-20 (promote #1771, synk #1772). `A#10` gäller gitignorerade lokala
`source-command-*`-speglingar i en checkout, inte spårad kod.

## Releaseblockerare bakom avstängd flagga

Inte nåbara produktbuggar medan flaggan är av. Ej omverifierade 2026-10-19.

<!-- prettier-ignore -->
| ID | Prio | Flagga | Kvar före aktivering |
| --- | --- | --- | --- |
| `SM-007` | P1 | `SAJTMASKIN_DOMAIN_PURCHASE` | Registrar-kontrakt och registrantdata, pengar/reconciliation, crash recovery/ledger, konsekvent provider/pris/state samt färdig retur-, relink- och köp-UX. Svärm 2026-11-03: `A6` NXDOMAIN gav köpmandat, `A8` SEK-avrundning ändrade registrars USD-pris och `B5` misslyckad refund kvitterades 200. Kodfixar med regression i `src/lib/domains/registrar/offer.test.ts`, `fulfilment.test.ts` och `src/app/api/stripe/webhook/domain-purchase.test.ts` levererade i #1709 och i produktion via #1715. Dessa tre delpunkter stänger inte resten av SM-007 och aktiverar inte köpflaggan. Domänpåslaget x2 styrs av admin via `pricing_settings`. |
| `SM-070` | P2 | `SAJTMASKIN_LIVE_REVIEW` | Idempotent Blob-retry, verklig sju-dagarsrensning inklusive chat-delete samt beständig modellförsöksbudget över persistfel/abandon. Production kräver separat ägarbeslut efter grönt Preview-smoke. |

## Behöver repro

Testkö, inte bekräftade buggar. Körvägar i
[`docs/runbooks/live-verifiering.md`](docs/runbooks/live-verifiering.md).
Bara `SM-035` och `SM-071` omverifierades mot kod 2026-10-19.

<!-- prettier-ignore -->
| Ref | Osäkerhet | Vad avgör raden |
| --- | --- | --- |
| `SM-035` | Historisk Fly `npm install` exit 254. Koden klassar nu OOM och disk (`preview-host/src/runtime/package-install.js:630`), men `installDiagnostics` saknar pakethanterare, läge och duration. | Nästa träff ska bära manager/mode/duration och machine-/regiondata. |
| `SM-071` | Fem äldre `app-shell`-körningar misslyckades före manifeständringarna 21–23 aug. Kodläget är en komplett app-shell med fyra varianter (`src/lib/gen/scaffolds/app-shell/manifest.ts`). | Kör en ny `app-shell` mot nuvarande master och lokalisera första preview-/buildfelet. |
| `SM-037` | Historiska hydrationkrockar saknar aktuell producent. | Browser/preview-host-test med patch-lane på och HMR av; bind served och selected version till session. |
| Block/Marknadsblock | Flaggan är på men riktig Pro-källa är inte livebevisad. | Infoga `hero1` i prod och verifiera hämtad källkod, inte metadata-fallback. |
| OpenAI E2E | UX-kedjan finns; tidigare projektnyckel saknade quota. | Spara riktig projektägd nyckel, bygg integrationen en gång, få providersvar och reloada. |
| Scaffold-kohort | `(null)` kan vara blandning av explicit off, import och pending. | Kör `control-stats.mjs` per kohort; skapa buggrad endast för konkret fallande kohort. |
| Hydration → RepairGate | Inga säkra par av klientfel och hydration-advisory för samma revision. | Läs ny proddata; koppla till befintlig repair-loop bara vid versionsbundet par. |
| Fast Edit Lane | Stale chunk efter quick edit är en hypotes. | Repro på Fly med patch utan HMR. |
| Template-galleri | Evidensen för synliga mallars crash/lazy-load är gammal. | Kör catalog/blob-audit och click-smoke på dagens synliga mallar. |
| DB-pool | Poolsvält kan finnas trots backoff (pool max 3 per instans mot pooler). | Fånga pool `x/3`, idle, waiting och headroom under samma prodgenerering. |
| Socket loss | Okänt vilken genereringsendpoint som tappar anslutningen. | Samla HAR/SSE och namnge exakt endpoint innan buggrad skapas. |
| OpenClaw health | En 502 följdes av 200 och kan ha varit cold start. | Korrelera nästa träff med Vercel runtime-logg. |
| Analytics/consent i genererad sajt | Genererade sajters consent återstår att verifiera. Appens egen tracker granskas separat i `SM-109` (A14). | Auditera genererad sajt; appens lokala fix är inte bevis för genererade sajter. |
| CI-flake quality-core | Orsaken (testing-librarys 1 s-default) är åtgärdad med 5 s i `vitest.setup.ts`; raden är bevakning. | Nästa enstaka `waitFor`-fail som är grön på rerun: mät hur långt över deadline workern låg i stället för att höja blint. |
| CI-flak quality-project-persistence | `e2e/project-persistence.spec.ts:47` föll en gång på #1747: `GET /api/engine/chats/<id>` gav 500 efter 41 s kall kompilering (next.js 38,1 s), och serverloggen visar `SyntaxError: Unexpected end of JSON input` för routen. PR:en ändrade inga serverfiler, jobbet var grönt på #1743 (13,7 s kompilering), och en omkörning utan kodändring gick grön (run 43066377585). Klassat som flak vid långsam kall kompilering; vilken `JSON.parse` som kastar är inte belagt. | Nästa träff: logga routen och vilken body som tolkas (begäran eller cachad läsning), och jämför kompileringstiden med gröna körningar. Höj inte timeouten blint. |
| Konsolfel i buildern (rigg V-17) | Under start i dev: ett hydreringsfel («server rendered text didn't match»), en React-varning (state update före mount) och 2 × 502 från hosten. Dev-läge, ej felsökt. | Samma fel i en production-build på preview? Då buggrad med komponent. |
| Engelska texter i granskningskorten | Rapporterat i UX-granskningen 2026-11-11; komponenten är inte lokaliserad. | Skärmbild av kortet och dess källfil; därefter buggrad. |
| `SM-159` Hjältebilden i live review | Live review för v1 påstod att hjältebilden var tom på desktop (`targeted_repair`, 0,93), men riggens skärmbild i 1440 visar bilden (V-2 § 13, prod 2026-11-20, chatt `2500f0ee`). Antagande: skärmbilden togs innan bilden laddats. Ingen automatisk reparation skapades. En träff. | Nästa träff: jämför tiden för live reviews skärmbild med bildens laddning (`src/lib/gen/verify/live-review.ts`). Bekräftat ⇒ vänta på bilderna före skärmbilden. |

## Väntar på ägarbeslut

Jake äger samtliga frågor. Ej omverifierade 2026-10-19.

<!-- prettier-ignore -->
| Prio | Fråga | Senast när |
| --- | --- | --- |
| P3 | Ska ”Publik preview” döpas om till vad kontrollen faktiskt gör, och ska ”Hantera domän” flyttas från domän-chevronen till Publicera-menyn? | Fritt. |
| P3 | Briefing N3–N5: återinför Refine efter verifierarfynd, prova bevarande `clear-refine`, och betala extra variant-embedding? | Inte före källkvittots A-mätning ([parkerad plan](docs/plans/archived/2026-09-17-inspiration-kvitto-och-komposition.md)). Se [`docs/plans/archived/2026-08-18-briefing-och-kallpaket.md`](docs/plans/archived/2026-08-18-briefing-och-kallpaket.md). |
| P3 | Dossier D5: ska Backoffice få fri add/remove efter att D2–D4 landat? | D2–D4 är parkerade. Se [`docs/plans/archived/2026-08-19-dossier-forenkling.md`](docs/plans/archived/2026-08-19-dossier-forenkling.md). |
| P3 | Är per-rubrikstaket 480 rätt när `selected-sections` breddas? | Inte aktuellt; taket är ratificerat i [`docs/decisions/README.md`](docs/decisions/README.md). |
| P2 | Ska högst en hard dossier väljas per promptrunda? | Nästa dossier-härdning. |
| P2 | Ska `SAJTMASKIN_REFUSE_DOSSIER_STUBS` vara på i production? | Verifiera aktuell env före nästa flaggändring. |
| P3 | OpenClaw Builder: starta separat shadow-planner/kandidatsandbox eller skrota? Dagens Sajtagent uppfyller inte automatiskt detta spår. Parkerat underlag med skyddsräcken och tekniska spikes i [`docs/plans/archived/2026-08-24-openclaw-builder/`](docs/plans/archived/2026-08-24-openclaw-builder/README.md). | Nytt ägarbeslut före implementation. |
| P2 | Ska en pending dossier ersätta modellbyggd kod för samma capability, fråga användaren eller samexistera? | Nästa F3-vägändring. |
| P2 | Ska `stream_ended_without_version` återbetalas när text levererats men ingen version sparats? | Före MVP-leverans. |
| P2 | Vilket kontrakt gäller för `BuildPlanCard` när alla versioner är failed? | Före nästa versionsläsändring. |
| P2 | Ska en dossierfil med `defect.kind: compile` blockera i stället för att vara advisory? | Nästa F3-incident/härdningspass. |
| P2 | Vid oenighet mellan Visual QA (källregex) och live-review (skärmdump): ska renderingsbevis vinna, eller viktas de? | Nästa verifieringsomgång. |
| P2 | Ska klientpolling få Sajtmaskin-build-id för att pausa under redeploy? | Nästa reproducerade redeploy-500-skur. |
| P2 | Ska F2 köra verifier-LLM-passet; vilken SLO motiverar separat verify-lane och senare parallell codegen? | När latens prioriteras. |
| P2 | Konsolidera reparationslagren: warm-tsc i F2 även när grinden är planerad, skärpt `risky_fixes`-trigger, live review gatad på sensorfynd vid init. Mäts mot `control-stats-baseline-2026-09-11.json`. | Efter ett nytt 14-dagarsfönster. |
| P3 | Nav-synken lägger aldrig till länkar för modellskrivna sidor (olänkade sidor som `/categories`, `/om`). Lägga till länkar, droppa sidorna, eller göra `non_blocking_quality_warning` blockerande? | Nästa scaffold-/ruttplanspass. |
| P2 | Rotera Actions `OPENAI_API_KEY` och ersätt den gamla eval-baselinen medvetet? | Före nästa gång baselinen används som bevis. |
| P3 | Ska tool-only-förslag plus approval prissättas som ett eller två modellsteg? | Före MVP-prissättning. |
| P3 | Ska tvetydig eller helnegerad providerfråga ställas tillbaka till användaren? | Nästa providerpass. |
| P3 | Ska verifier-LLM sluta få hela projektet varje gång (`SM-047`)? | När verifierkostnad/latens prioriteras. |
| P2 | Ska generation flyttas ur HTTP-anslutningen (`T9b`) efter mobilens frånkopplingsincident? | Nästa döda generation eller uttrycklig beställning. |
| P2 | Ska en loop-säker Vercel Log Drain skapas (`T11`)? | Endast när ägaren kör runbooken. |
| P3 | Flytta stor historik till Blob och därefter eventuellt `git filter-repo`? | När PR-kön är tom och alla kloner kan ersättas. |
| P3 | Kör produktbenchmark på 20–30 verkliga byggen? | Inför lansering/värdering. |
| P3 | Kostnadsfri: ska `SAJTMASKIN_PREVIEW_PREWARM` slås på så preview-VM:en värms vid init-generering? Kräver mätning på preview-hosten först. | Fritt. |
| P2 | Server-resume efter sen preview-boot (rest från arkivraden om sen boot, #1650): ska schemaläggaren aktiveras? Koden finns i `verify-run.ts` (#1650), men schemat saknas, flaggan är `0` och `CRON_SECRET` saknades i verifierad Preview-konfiguration 2026-10-21. Beslut om schema, flagga och hemlighet per miljö. | Före nästa ändring i server-verify eller när sena boots syns i prod. |
| P3 | `/analys` B2: ska `noindex` tas bort och `/analys` läggas i sitemap? Behåll unik H1, egen metadata och canonical; kontrollera copy, gästpolicy och API först. | Fritt; ratificeras i `docs/decisions/README.md`. |
| P3 | `/analys` B4: ska partneringången `/?mode=audit` flyttas till `/analys`? Tills dess oförändrad; partner-QA vid flytt. | Fritt. |
| P2 | Ska `scaffold-baseline-v1` taggas om (58 commits efter)? Backofficens fabriksåterställning är spärrad tills dess. | Före nästa fabriksåterställning. |
| P3 | Generation History: ska dedup ske per version? `imported_repo` skriver två rader. | Nästa historikpass. |

Fattade beslut flyttas till
[`docs/decisions/README.md`](docs/decisions/README.md); implementationen hör
inte hemma i denna tabell.

## Säkerhet, infra och teknisk skuld

Konkret, fortfarande relevant skuld. Ej omverifierad 2026-10-19.

<!-- prettier-ignore -->
| Prio | Klass | Kvarvarande skuld |
| --- | --- | --- |
| P2 | Env (`SM-087`) | Stripe live-nycklar och webhook finns i production; `STRIPE_PRICE_*` är medvetet osatta. Production-posterna är Vercel `sensitive` och kan inte läsas tillbaka; att skriva om dem är ägarstyrd driftinställning. Beslut: [`docs/decisions/README.md`](docs/decisions/README.md) (Stripe / live-läge). |
| P2 | Observability | `engine_version_error_logs.version_id` är `NOT NULL`, så fel före första versionen kan inte loggas (`T3`). |
| P2 | Säkerhet | Läsande CI-jobb delar prod-credentials med skrivande jobb; inför separat read-only-roll/DSN. |
| P2 | Säkerhet (cross-tenant) | `sites.sajtmaskin.se` saknar Public-Suffix-List-post, så en kundsajt skulle kunna sätta cookie på den delade parent-domänen. Blockerar branded-rollouten — se [`docs/runbooks/branded-user-urls.md`](docs/runbooks/branded-user-urls.md). |
| P2 | Observability (`SM-045`) | Brief-anropets `llm_usage` saknar både `chat_id` och `session_id`. |
| P2 | Sanningsskuld (`SM-054`) | `verification_state` bär ingen `filesRevision`; ett lagrat verdikt kan gälla äldre innehåll. |
| P3 | Kontraktsasymmetri (`SM-056`) | Ruttplanens filfilter gäller scaffoldfiler men inte modellens egna emitterade sidfiler. |
| P3 | Config (`SM-046`) | `deploy-assistant` finns i manifest/fasrouter/Backoffice men har ingen runtime-anropare. |
| P3 | Env/export | Verbatim-export kan falla tillbaka till hela placeholder-katalogen i `.env.local`; tråda dossier-scope. |
| P3 | Dependency | Generatorpaket saknar egen deklarativ katalog och paritetsvakten täcker bara en del av `KNOWN_PACKAGES`. |
| P3 | Test | Runtime-guards saknar full kö- och `idle → hibernated → reboot`-täckning. |
| P3 | Arkitektur | Ta bort dött SSE-callbackförsök och gör polling till enda kanoniska väg. |
| P3 | Prompt | Budgettruncering är blind; mät triggerfrekvens och gör den fil-/fence-medveten. |
| P3 | Legacy | Bestäm kompatibilitetsperiod och migration för `template_cache`. |
| P3 | UX | Blockera save under `verifying/repairing` utan att tappa lokal draft. |
| P3 | UX (lastbärande copy) | Boot-placeholderns titlar är bakåtkompatibel fallback bredvid maskinmarkören `data-sajtmaskin-preview-boot`; byt inte titlarna förrän production-appen läser markören. |
| P3 | Dossier-test | Demotester bevisar inte övergång till riktig projektnyckel; lägg representativa aktiveringstest. |
| P3 | Dossier-arkitektur | `STAGING_BY_ID` är en handkodad placeringskarta parallellt med manifesten. |
| P3 | Uppdelning | Dela `DossiersPanelView`, `usePreviewPanelDossiersController`, `audit-modal`, `repair-loop`, `import-validator` och `scaffold_wizard` bakom oförändrade fasader. |
| P3 | Lint | Betala per-fil Python F401, bredda lint till `scripts/` och ta bort React hook-disables en yta i taget. |
| P3 | Migration | `v0ChatId` har levande DB- och previewkontrakt; namnbyte/borttagning kräver migrationsplan. |
| P3 | Testinfra | Global Vitest-`jsdom` belastar rena Node-tester; dela testmiljöer. |
| P3 | Backoffice | `backoffice.shared` fryser 99 namn och åtta ytor duplicerar Node-subprocess/JSON-hantering. |
| P3 | Observability | Fault-matrix trunkerar joinen vid 200 nycklar; antal och ”ingen fixer” kan bli missvisande. |
| P3 | Backoffice | Template-kuratorn uppdaterar session-binding men inte visad analys-addenda efter write. |
| P3 | Legacy | Två `prompt_assist`-ytor är konfigurerade men saknar skrivare/konsument. |
| P3 | Test | Färgtokenfix #1049 saknar dark-variant-smoke över en genererad sajt. |
| P3 | Säkerhet | Öppna inloggningar lever kvar efter lösenordsbyte; ingen ogiltigförklaring finns. |
| P3 | Säkerhet/diagnostik | `GET /api/engine/postchecks` lägger kvalitetsgrindens `body`/`status` (inkl. `checks[].output`) i `results[].outcome`; bevarat och låst i #1726. Beslut: ta bort eller behåll som driftdiagnostik. |
| P3 | Verktyg | `knip:files` flaggar `src/lib/gen/eval/cli.ts` lokalt på Windows; CI:s dead-code är grön. |
| P3 | Sajtagenten | En reparation som agenten startar direkt får inget kvitto från `useAutoFix`: kortet säger «Reparation startad» även när autofixen tyst avstår (bygge pågår, redan igång, inte senaste versionen), och agentens väntan på byggresultatet ligger kvar i upp till 90 s (`agent-action-consent.ts`, R-1760 N2). Komposerns eget bygge släpper den; autofix, plan- och F3-knappar gör det inte. Åtgärd: startat/avstått-kvitto från `useAutoFix`. |
| P3 | Test | `test-guest-agent.mjs` är instabil på Windows (EBUSY vid rmdir); CI på Linux påverkas inte. |
| P3 | Backoffice/Blob | Manuell `upload-mallar-blob.mjs --upload` från terminalen tar inte uppladdningslåset (#1732); gamla Blob-nycklar blir föräldralösa efter nästa uppladdning. |
| P3 | Dossiers | Två TS-regelgrupper för filsökvägar saknas i Python-backoffice (`dossiers:validate-all` fångar dem). |
| P3 | Kvalitet | QA-rest från `2fd745845`: `maxRetries: 0`, usage-`meta` och SDK-transporttest i `qa-short-circuit.ts`. |
| P3 | Lokal miljö | Huvudcheckoutens `node_modules` är inaktuell efter dependabot-bumpar (`npm ls` visar 7 invalid) och vitest-filer laddar inte där («Cannot read properties of undefined (reading 'config')»). Åtgärd: `npm ci` när ingen process håller filer öppna. |
| P3 | Preview-livscykel | Kvar efter #1742 (rapport L): strömmens `preview-ready` skrivs till en stängd ström sedan #1593; en hibernerad session för samma version rivs och återskapas (ny maskin) i stället för att väckas (mätt i prod, se `SM-163`); destroy väntar på maskinlåset bakom en pågående create (27–29 s imagepull); `postcheck-recovery` väntar 5 min innan den väcker en avbruten kedja. |
| P3 | Preview-indikator | En tidig route-rapport före sessionsmetan får token `""` och kasseras, så den gröna signalen kommer cirka 10 s senare (`usePreviewRouteBridge.ts:22-36`, R-1746). Hostens bootstrap stämplar storens `versionId` (`preview-host/src/runtime/preview-proxy.js:934`), inte den bootade processens (R-1742). |
| P3 | Builder (byggval) | Välkomstmarkeringen från #1743 (`welcome-composer-bridge.ts`) kan ersättas av `isCreatingChat` som parameter till `useBuilderGenerationPreferences`; rensa annars även när ett första bygge avbryts utan chatt (R-1743). Testet `PreviewPanelInitControls.test.tsx:221` speglar `useCreateChat` i stället för att anropa den. |
| P3 | CI | `quality-project-persistence` lägger 240 s per körning medan apt-speglarna är nere, och `timeout` stoppar bara `node`, inte `apt-get` (`.github/workflows/ci.yml:388`, #1745). Sänk taket när DNS-felet är löst. |
| P3 | Lokal miljö | `next dev` (16.4.2) skriver blocket «BEGIN:nextjs-agent-rules» i `AGENTS.md` i den checkout där den körs (`node_modules/next/dist/server/lib/generate-agent-files.js`). Återställ filen före commit; överväg att stänga av genereringen. |
| P3 | Lokal miljö | Cursor raderar de äldsta mapparna under `.cursor/worktrees` när antalet eller den sammanlagda storleken passerar gränsen, även med ocommittat arbete (sex worktrees 2026-11-11, med `worktreeMaxCount: 5` och `worktreesGlobalMaxSizeGb: 8`). Höjt till 10 och 40 GB 2026-11-21; en worktree med `node_modules` är cirka 1,1 GB. `npm run worktree:remove` kraschar fortfarande på en saknad mapp (`scripts/cursor/worktree.mjs`). Varning i [`git-worktree.md`](docs/runbooks/git-worktree.md). |
| P3 | DB-prestanda (`SM-157`) | `engine_chats.project_id` saknar index: varken `src/lib/db/schema.ts` eller någon migrering skapar ett. Projekttakets `hasChat` (`src/lib/projects/project-cap.ts:36`) och predikaten i `src/lib/db/services/project-started.ts` (listan och taket) läser kolumnen. DEV-plan 2026-11-20: hashad delplan, ingen skanning per rad; PROD är inte mätt. Ett index kräver migrering och eget DB-mandat. |
| P3 | Död kod (`SM-161`) | `postPreviewDestroy` (`src/lib/builder/preview-session/api.ts:91`) används inte sedan #1749 och saknar anropare sedan #1759, och `handleClearPreview` (`src/app/builder/useBuilderCallbacks.ts:80`) exponeras i `useBuilderPageController.ts:1052` men läses inte. Inget test täcker skalets koppling från omstartsknappens `onClear` till `forcePreviewResync` (`shell-content.tsx:202`). Granskningen av #1749. |
| P3 | Beroenden (`SM-162`) | Lyften i Dependabot #1750, #1737, #1735 och #1734 är samlade i #1773 (samma versioner, en CI-körning). #1738 ersätts av en samlad lyft av `ai` och `@ai-sdk/*` inom nuvarande huvudversioner (2026-11-21: `ai` 6.0.333, `@ai-sdk/openai` 3.0.144, `@ai-sdk/anthropic` 3.0.143, `@ai-sdk/react` 3.0.336; en version av `provider-utils` i trädet). Kvar: huvudversionslyften till `ai` 7 och `@ai-sdk/*` 4 som ett eget uppdrag. `@sparticuz/chromium` (149, senaste 153) och `playwright-core` (1.61.1) lyfts tillsammans och provas med capture i produktion (se `SM-072`). Underlag: paket N 2026-11-20. |

## Arkiv

Avslut med kodfix på både preview och master. Verifierade 2026-10-19 om inget
annat anges; raderna med #1709/#1715 och #1650/#1655 kontrollerades 2026-11-11 och raderna med #1754/#1771 2026-11-20; äldre arkiv finns i git och i
[`bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

<!-- prettier-ignore -->
| Klar | Rad | Status på `master` | Bevis |
| --- | --- | --- | --- |
| [x] | `SM-133` | Fixad | Tomma «Namnlöst projekt» från `/builder`, `?new=1` och «Ny chatt» räknades mot projekttaket och fyllde `/projects`. Fix i `src/lib/db/services/project-started.ts` (räknas och visas inte), `src/lib/projects/project-cap.ts` (taket prövas vid första chatten och räknar byggda projekt) och `src/lib/projects/project-cleanup.ts`. #1756 (`67635f138`), #1766 (`91a2dc61a`), #1769 (`f68bdcd4e`) / master #1771 (`c3f8896ce`). Prod 2026-11-20 (V-2 § 13): inget «Namnlöst projekt» i `/projects`. Rester: `SM-154`–`SM-157`. Engångsstädning kräver eget uppdrag (beslutsraden 2026-11-20). |
| [x] | `SM-137` | Fixad | Cookie-rutan täckte promptfältet på 390 px (rigg V-05). Fix i `src/components/layout/cookie-banner.tsx` (remsa under `md`), `src/lib/app-viewport.ts` och `landing-hero.tsx`. #1759 (`bebd9500e`) / master #1771 (`c3f8896ce`). Prod 2026-11-20, 390×844 utloggad (V-2 § 13): remsan 757–844 px, promptfältet 616–684 px, inget överlapp. Desktopkortet på `/` är medvetet oförändrat; frågan står under `## Väntar på ägarbeslut`. |
| [x] | `SM-139` | Fixad | Builderns mobilheader tog 270 av 844 px (rigg V-10). Fix i `src/components/builder/shell/BuilderHeader.tsx`: en rad under `lg`. #1759 (`bebd9500e`) / master #1771 (`c3f8896ce`). Prod 2026-11-20, 390 px (V-2 § 13): en rad, 48 px; «Mer» har Ny chatt, Versionshistorik och Logga ut. |
| [x] | `SM-140` | Fixad | Versionshistoriken saknade ingång under 1024 px. Fix: «Versionshistorik» i Mer öppnar ett ark (`src/app/builder/builder-shell-content/shell-content.tsx`). #1759 (`bebd9500e`) / master #1771 (`c3f8896ce`). Prod 2026-11-20 (V-2 § 13): arket öppnas i helskärm. |
| [x] | `SM-146` | Fixad | Väntetexterna lovade för kort start. Dialogen säger «ett par minuter» (`BuilderPreviewTools.tsx`, #1749 `90f7a88bb` / master #1754 `f86e6fcee`), och versionslistans startchip likaså (`src/lib/builder/version-history-status-labels.ts`, #1759 `bebd9500e` / master #1771 `c3f8896ce`). Hostens platshållare är kvar i `SM-141`. |
| [x] | `SM-099` | Fixad | Svärm `A1`: Drizzle-fel 23505 under cause missas av konflikt-/retryhanteringen. Fix i `src/lib/db/chat-repository/versions.ts`, `src/lib/db/services/domain-orders.ts`, `src/lib/db/services/projects.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-100` | Fixad | Svärm `A2`: Tom dubblett av tool-call skriver över den riktiga planen. Fix i `src/lib/gen/stream/stream-format.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-101` | Fixad | Svärm `A3`: Replacement-token i genererat innehåll återinför blockerad kod efter sanering. Fix i `src/lib/gen/security/output-sanitizer.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-102` | Fixad | Svärm `A4`: Rubriker i användarens brief kan få kontraktsprioritet i promptbudgeten. Fix i `src/lib/gen/system-prompt/budget.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-103` | Fixad | Svärm `A5`: Manipulerad thumbnail_path når radering av annan projekts blob/mediefil. Fix i `src/app/api/projects/[id]/thumbnail/route.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-104` | Fixad | Svärm `A7`: Hemliga npmrc-värden följer med publik ZIP och privat backup. Fix i `src/lib/gen/export/sanitize-public-export.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-106` | Fixad | Svärm `A11`: Trickle-svar kan överskrida capture-transportens avsedda tidsbudget. Fix i `src/lib/capture/pinned-fetch.ts`, `src/lib/projects/thumbnail-capture.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-107` | Fixad | Svärm `A12`: WordPress-fallback kan ersätta originalsajtens innehåll med annan origins data. Fix i `src/lib/webscraper.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-108` | Fixad | Svärm `A13`: Filbyte skriver över osparat kodutkast. Fix i `src/components/builder/preview-panel/code/usePreviewPanelCodeDrafts.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-109` | Fixad | Svärm `A14`: Appens analytics fortsätter efter nekat samtycke. Fix i `src/components/layout/analytics-tracker.tsx`, `src/app/layout.tsx`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-110` | Fixad | Svärm `A16`: Databasfel visas felaktigt som modellautentisering eller kvotfel. Fix i `src/lib/providers/errors/normalize-provider-error.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-111` | Fixad | Svärm `A19`: Okända serverfel exponerar rå feltext via SSE/logg. Fix i `src/lib/providers/own-engine/generation-stream.ts`, `src/lib/utils/debug.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-112` | Fixad | Svärm `B1`: JWT-signering tillåter tom nyckel vid saknad serverkonfiguration. Fix i `src/lib/auth/auth.ts`, `src/lib/env.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-113` | Fixad | Svärm `B2`: Gammal lösenordshash överlever admininloggning med nya env-uppgifter. Fix i `src/lib/auth/auth.ts`, `src/lib/db/services/users.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-114` | Fixad | Svärm `B3`: Autofix tolkar dollartext som replacement-token och korrumperar filer. Fix i `src/lib/gen/autofix/pipeline-steps/rebuild-content.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-115` | Fixad | Svärm `B4`: Verifieringslänk aktiverar lösenord valt av den som förregistrerade offrets e-post. Fix i `src/app/api/auth/verify-email/route.ts`, `src/lib/db/services/users.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-116` | Fixad | Svärm `B6`: Adminrensning tar bort betalningskvitton så signerad webhook-replay kan kreditera igen. Fix i `src/app/api/admin/database/route.ts` (låsta användar-ID, kvitton skyddade). Ingen live-race bevisad. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-117` | Fixad | Svärm `B7`: Flerstegsrensning i admin kan lämna halvfärdigt tillstånd vid databasfel. Fix i `src/app/api/admin/database/route.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-118` | Fixad | Svärm `B8`: Databasläsfel faller tillbaka till gammal deployidentitet. Fix i `src/lib/deployment.ts`, `src/lib/db/services/projects.ts`, `src/lib/domains/resolve-vercel-project.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-119` | Fixad | Svärm `B9`: Misslyckad filhämtning kan skriva en tom projektsnapshot. Fix i `src/app/builder/useBuilderProjectActions.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-120` | Fixad | Svärm `B10`: Chattbyte kan skriva gamla meddelanden under den nya chattens localStorage-nyckel. Fix i `src/lib/hooks/usePersistedChatMessages.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-121` | Fixad | Svärm `B11`: Enbart providernamn misstolkas som uttryckligt byte av väntande dossier. Fix i `src/lib/gen/dossiers/select.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-122` | Fixad | Svärm `B12`: Git-vakt missar kommandon efter ensamt ampersand och kan tolka fel cwd. Fix i `scripts/workflow/git-command-ambiguity.mjs`, `scripts/workflow/commit-guard.mjs`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-123` | Fixad | Svärm `B13`: Wizardens IP-kvot kan kringgås med samma konto/run över flera IP-adresser. Fix i `src/lib/wizard/authorize-wizard-run.ts`. Budgetreservation kvar i `SM-081`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-124` | Fixad | Svärm `B14`: Ledande snedstreck hanteras olika av filparser och säkerhets-/exportkedjan. Fix i `src/lib/gen/parser.ts`, `src/lib/gen/security/path-validator.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-125` | Fixad | Svärm `B18`: Betald brief-anrikning körs före avvisning av ett saknat projekt. Fix i `src/lib/api/engine/chats/create-chat-stream-post.ts`. Budgetreservation kvar i `SM-081`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-126` | Fixad | Svärm `B21`: SDK-importfixaren missar multiline, trailing comments och subpaths. Fix i `src/lib/gen/autofix/rules/tier3-sdk-guard-fixer.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-127` | Fixad | Svärm `B22`: onClick i en kommentar feltolkas som klientkrav och tar bort metadata. Fix i `src/lib/gen/autofix/rules/metadata-client-conflict-fixer.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-128` | Fixad | Svärm `B25`: Beställning av flera follow-ups och bugggranskning routas till vanlig byggtur. Fix i `src/lib/builder/composer-route.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-129` | Fixad | Svärm `B27`: Dubbel avkodning av företagsnamn med procenttecken kraschar rendering. Fix i `src/lib/entry/use-entry-params.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-130` | Fixad | Svärm `M07`: PDF-extraktion anropar pdf-parse v2 som v1-funktion och ger 422. Fix i `src/app/api/text/extract/route.ts`. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-131` | Fixad | Svärm `M10`: Negerat eller omnämnt stopp feltolkas som order att avbryta agentmandatet. Fix i `src/lib/openclaw/debug/armed-mandate.ts`; rester i #1711. #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-132` | Fixad | Byggkort visar fortsatt previewarbete efter avslutad eller avbruten SSE trots att samma version har kanonisk terminalstatus (separat observation 2026-11-03). #1709 (`a7caef13c`) / master #1715 (`b10654c91`). |
| [x] | `SM-096` | Fixad | Deadline efter `reserve` lämnade budgetutfallet okänt och dedup-blockerade nästa reparation (`A#7`). Fix i `src/lib/gen/autofix/llm-repair-gate.ts`: avbrott före modellstart kvitteras `aborted`. #1650 (`84736bf8a`) / master #1655 (`c67e73593`). |
| [x] | `SM-097` | Fixad | Bakgrundsverify kunde settle:a resume som `superseded` utan databasskrivning (`A#6`). Fix i `src/lib/gen/verify/server-verify/verify-run.ts`: kräver sparad supersede-status. #1650 (`84736bf8a`) / master #1655 (`c67e73593`). |
| [x] | `SM-077` | Fixad | Sen preview-boot gav ingen omverifiering. Server-resume i `src/lib/gen/verify/server-verify/verify-run.ts` återöppnar exakt misslyckat claim; liveprov 2026-10-21 (version `67a28114` → `passed`). #1650 (`84736bf8a`) / master #1655 (`c67e73593`). Scheduler/`CRON_SECRET` är en beslutsfråga under `## Väntar på ägarbeslut`. |
| [x] | `SM-078` | Fixad | RLS och revoke av PUBLIC/anon/authenticated i `src/lib/db/migrations/harden-wizard-runs-access.sql`; tabellen nås bara via serverns pg-pool. #1325 / master #1344. |
| [x] | `SM-079` | Fixad | `createGoogleUser` (`src/lib/db/services/users.ts:72`) kör transaktion med identitets-/radlås, nekar konflikt och nollar `password_hash` för overifierat konto. #1325 / master #1344. Historiskt felkopplade konton är separat dataresidual. |
| [x] | `SM-082` | Fixad | `icon-component-value-fixer.ts:47` matchar bara JSX-barn; regressionstest finns. |
| [x] | `SM-083` | Fixad | 409 `DEPLOY_TYPECHECK_ADVISORY` före Vercel-anrop (`src/app/api/v0/deployments/_route/post.ts:185`, `engine-version-lifecycle.ts:182`). |
| [x] | `SM-084` | Fixad | `quality-gate-checks.ts:177` viker bara `routes.d.ts` + `TS1005`; hosten städar inte `.next/dev/types`, men det behövs inte med folden. |
| [x] | `SM-003` | Fixad | Deploy-repair no-opar bara när stämpeln gäller just den failade deploymenten (`src/app/api/v0/deployments/repair/route.ts:95`, #1431). |
| [x] | `SM-013` | Fixad | Misslyckad template-init visar feltext och Försök igen (`PreviewPanelEmptyState.tsx:108`, #1376 / master #1416). |
| [x] | `SM-088` | Fixad | `MessageList.tsx:483` bygger `planParts` utan debugfilter; `BuildPlanCard` renderas i default-UI (#1373 / master #1394). |
| [x] | `SM-089` | Fixad | Init-planläget skriver entry/exit via `startTracedCreateChatPlanModeResponse` (`create-chat-stream-post.ts:751`, #1377 / master #1416). |
| [x] | `SM-033` | Fixad | Terminal wizard-telemetri skickas alltid i `finally` före taket (`src/lib/wizard/route-budget.ts:46`, #1434 / master #1459). |
| [x] | `SM-074` | Fixad | Klienten adopterar `running` med ny session/lifecycle (`usePreviewIframe.ts:66`); hårdkodad `startOutcome: "resumed"` finns kvar men orsakar inte längre falsklarm. |
| [x] | `SM-085` | Fixad | `resolveUserRequestForVersion` (`live-review.ts:346`) används av HTTP-routen och server-verify (#1375). |
| [x] | `SM-086` | Fixad | `screenshotViewportCoverage` används av prompt, bilddelar och `maybeAttachLiveReview` (`live-review.ts:138`, #1375). |
| [x] | `SM-025` | Avfärdad | Postcheck och thumbnail startar varsin browser och `captureBrowserGate` köar bara inom samma isolate (`src/lib/capture/browser.ts:35`, #843); en annan isolates close når inte browsern. |
| [x] | `SM-014` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) binder preview-overlay till runtime-readiness. |
| [x] | `SM-018` | Fixad | [#1126](https://github.com/Jakeminator123/sajtmaskin/pull/1126) synkar parentens aktiva route med iframe-navigation. |
| [x] | `SM-032` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) lägger minsta Maps-hostar i CSP med test. |
| [x] | `SM-038` | Fixad | [#1124](https://github.com/Jakeminator123/sajtmaskin/pull/1124) återanvänder kanonisk bloggrutt. |
| [x] | `SM-040` | Fixad | [#1137](https://github.com/Jakeminator123/sajtmaskin/pull/1137) tillåter exakt `Data Protection Policy` efter `och`/`and`. |
| [x] | `SM-075` | Fixad | PR #1242 lägger `TS2724` och `TS2693` i `RENDER_RISK_TS_CODES`. |
| [x] | `SM-076` | Fixad | PR #1242 anropar `failVersionVerification` i build-error-repairens catch när `files_json` är oförändrad. |
| [x] | `SM-015` | Fixad | [#1138](https://github.com/Jakeminator123/sajtmaskin/pull/1138) använder opak `text-muted-foreground`; kontrasttester låser 5,75–6,45:1. |
| [x] | Affärsmodell / månadsavgift | Beslutad 2026-09-11, inte byggd | Riktningen ratificerad i [`docs/decisions/README.md`](docs/decisions/README.md). Implementation återstår. |

Stängda eller supersedade PR-utkast räknas inte som mergebevis; aktuell kod på
`master` eller en mergad PR är alltid auktoritet.
