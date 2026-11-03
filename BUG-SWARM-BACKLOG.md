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
33 nya rader nedan; A6/A8/B5 hör till `SM-007` och M03 till `SM-080`.
Svärmens A/B/M-ID:n med detta datum är skilda från äldre `A#`-referenser.
Övriga äldre rader är inte omverifierade genom detta tillägg.

Fixpass samma dag: **36 av 37 fynd har lokala kodfixar**, riktade regressionsprov
och tre oberoende granskningspaket. `SM-080`/M03:s browser-origin återstår.
Statusen gäller fixgrenen `codex/verified-bugfixes-20261103`, inte en levererad
commit. Inga rader arkiveras eller bockas av innan respektive leverans är bevisad.

Regler:

- `Aktiv kö` är den kanoniska ID-tabellen. Status-cellen skiljer `Öppen kodbugg`,
  `Befintlig fix-PR`, `Kodfix i preview`, `Kodfix i master`,
  `Kvarvarande driftprov`, `Delvis åtgärdad`, `Behöver aktuell repro`,
  `Under rättning` och `Lokal kodfix` (ännu inte levererad).
- Kodfix på både preview och master flyttas till `Arkiv` med bevis. Kodfix bara
  på preview stannar i kön tills promote.
- Varje aktiv rad har ett stabilt `SM-###`. Nästa lediga ID är `SM-132`.
- En draft-PR är inte en fix. Kolumnen «Bevis på `master`» anger alltid vilken
  gren beviset gäller.

## Aktiv kö

<!-- prettier-ignore -->
| Klar | Status | Prio | Fynd | Bevis på `master` | Nästa steg |
| --- | --- | --- | --- | --- | --- |
| [ ] | Delvis åtgärdad | P1 | `SM-080` Preview-isolering: shared-läget delar OS-identitet och filsystem mellan kundprojekt; per-chat-maskiner skiljer processerna men preview-sajterna delar fortfarande webbläsar-origin. Svärm 2026-11-03 `M03` bekräftar den senare gränsen. | Master `63dbb9ed2`: `preview-host/src/runtime/shared.js`, `runtime/machine-runtime.js`, `server/routes.js`, `src/components/builder/preview-panel/runtime/PreviewPanelFrame.tsx`. Health på `vm-fly-jakem.fly.dev` 2026-11-03 kl. 15:11:49 UTC visade `machine/configured:true`, release `1bcca87b63f8e2311dfcb97c99d392b28ae70321`; tidigare uppgift om ej driftsatt maskinläge är inaktuell. Det är inte ett E2E-isoleringsbevis. | Bevara spärren tills nät-/tenantacceptans är dokumenterad. För browser-origin krävs unik origin per chat, bindning av HTTP/WS-host till chat, DNS/TLS och migration från delad origin. Kvarstående arkitektur-/driftarbete; ingen isoleringsacceptans eller aktivering görs av buggfixpaketet. |
| [ ] | Delvis åtgärdad | P1 | `SM-081` Parallella genereringar kan inte längre passera samma kreditförkontroll, men det finns ingen budgetreservation eller kostnadstak. | `src/lib/credits/generation-admission.ts:13`, `src/lib/gen/stream/generation-lock.ts:135`; preview och master. Utan Redis i production/preview nekas starten med 503. | Kvar: faktisk reservation/kostnadstak och övriga betalda körvägar. Beställ inte kontolåset igen. |
| [ ] | Delvis åtgärdad | P1 | `SM-072` Chromium-captures kan svälta `/tmp` på en varm Fluid-instans; en burst kan döda nästa launch. | `src/lib/capture/browser.ts:203` och `:395`: core-dumpar rensas före launch och `browser_crashed` visas inte som Degraderad, men profiler yngre än 300 s lämnas kvar. #1572 finns bara på preview. Burst-evidens preview 2026-09-20 (chat `a0b134d9`, 382–979 MB). | Kvar: städning av unga profiler under tryck och ett burstprov utan `playwright_unavailable`. |
| [ ] | Delvis åtgärdad | P1 | `SM-073` Inspector-bridgen stämplar bara meddelanden när `previewSessionId` finns; utan den släpper parent fail-closed. | `preview-host/src/runtime/inspect-bridge-src.js:44`, `src/components/builder/preview-panel/inspect/usePreviewInspectBridge.ts:390` (`93a9a0d2f`); preview och master. Ett avvisat ready visas nu i stället för att dö tyst. | Kvar: prod-stickprov (hover inom ~1 s på färsk sajt) eller stämpel även när sessionsmetadata saknas. |
| [ ] | Behöver aktuell repro | P1 | `SM-092` Resend nekade verifieringsmejl i prod med 403 «domain is not verified»; då kan en nyregistrerad inte verifiera sin e-post. | `src/lib/email/send.ts:153` klassar felet som `sender_not_verified`, `src/app/api/auth/register/route.ts:102` och `auth-modal.tsx:156` visar det; ingen retry. Senast i prod 2026-09-16. | (1) Kontrollera Resend-status för `sajtmaskin.se`. (2) Kör ett riktigt registrerings-/verifieringsmejl. PASS ⇒ arkivera; fortfarande 403 ⇒ launch-blockerande providerkonfiguration. Bygg ingen ny mejlväg. |
| [ ] | Öppen kodbugg | P2 | `SM-090` Planläget bygger systemprompten med `\n\n---\n\n` i stället för `SYSTEM_PROMPT_SEPARATOR`, så prod-asserten `missing-separator` slår. | `src/lib/own-engine/session/own-engine-plan-mode.ts:30` mot `src/lib/gen/system-prompt/compose.ts:35`; asserten anropas från `src/lib/gen/engine.ts:161`. Samma på preview och master. Prod: 5 träffar t.o.m. 2026-09-15 på båda stream-rutterna. | Låt planläget använda samma separator (eller sammansättning) som codegen. Sänk inte asserten till varning. |
| [ ] | Öppen kodbugg | P2 | `SM-001` Repair-accept skriver över samma versions `files_json`; ingen rollbackpunkt skapas. | `src/lib/db/chat-repository/repair.ts:386` (preview), `:281` (master): `acceptRepair` skriver payload över versionsraden och nollar `repaired_files_json`. | Avgör om accept ska skapa ny version eller filhistorik. |
| [ ] | Öppen kodbugg | P2 | `SM-094` Billing-upserten kopplar aldrig kampanj i efterhand: en version som först skrevs utan `campaign_entitlement_id`/`campaign_phase` får dem aldrig. Från svärmfynd `A#13`. | `src/lib/db/services/generation-billing.ts:196` (`onConflictDoUpdate`); preview och master. Debiteringen läser bara de sparade kolumnerna. Visningen täcks av #1630, debiteringen inte. | Sätt kampanjfälten i konfliktgrenen och lås med test. |
| [ ] | Öppen kodbugg | P2 | `SM-095` Falskgrönt: warm-tsc sätter `repaired:true` när LLM-fixern rapporterar success utan ny `tsc`, så yttre status blir `passed` med `errorsAfter:0`. Från `A#5`. | `src/lib/gen/autofix/validate-and-fix.ts:333` och `:563`; testet `validate-and-fix.test.ts:286` låser beteendet. Preview och master. | Kör om `tsc` efter fixern innan `repaired`, och ändra testet. |
| [ ] | Delvis åtgärdad | P2 | `SM-096` En deadline efter `reserve` kunde lämna budgetutfallet okänt och dedup-blockera nästa reparation. Från `A#7`. | Felet finns på remote preview `0e41113c9`, inte på master. Rättning i #1650 i `src/lib/gen/autofix/llm-repair-gate.ts`: avbrott före modellstart kvitteras som `aborted`, förbrukad slot behålls och misslyckad kvittens blockerar fortsatt försök. | Riktade gate-, repair-loop- och budgettester gröna. Granska och integrera #1650 före promote. |
| [ ] | Delvis åtgärdad | P2 | `SM-097` Bakgrundsverify kunde settle:a resume som `superseded` trots utebliven databasskrivning. Från `A#6`. | Remote preview `0e41113c9` har felet; master ignorerar null men har ingen resume-settle. Rättning i #1650 i `src/lib/gen/verify/server-verify/verify-run.ts` kräver sparad supersede-status och returnerar annars ett återförsökbart stopp. | Tester täcker null, kastat skrivfel, bekräftad supersede och resume-settle. Granska och integrera #1650 före promote. |
| [ ] | Delvis åtgärdad | P2 | `SM-077` Sen preview-boot gav ingen omverifiering. Master har klientens omförsök; preview har bytt till server-ägda efterkontroller. Även en misslyckad produktkontroll kunde låsa nästa resume. | #1650: server-resume i `src/lib/gen/verify/server-verify/verify-run.ts` återöppnar bara exakt misslyckat claim efter reserverat försök; godkända/blockerade kvitton och budgettak bevaras. Manuellt liveprov 2026-10-21 mot Preview/DEV/Fly: importerad testversion `67a28114` gick från `starting` via misslyckad kontroll till `passed` med lokal driver och fungerande sida. | Granska och integrera #1650. Provet bevisar inte driftens scheduler eller Vercels tidsbudget: schemat saknas, flaggan är `0` och `CRON_SECRET` saknas i verifierad Preview-konfiguration. Besluta schema/aktivering separat före promote; produktion är inte ändrad. |
| [ ] | Delvis åtgärdad | P2 | `SM-093` Flera flikar på samma `chatId` kan hålla en version i `pending` via upprepad `preview_superseded`. | Preview: 8 s backoff och högst en omstart per körning (`src/lib/gen/verify/server-verify/verify-run.ts:443`), men `superseded` räknas inte mot försökstaket 3 eller hold-taket 20 (`src/lib/db/services/server-repair-budget.ts:86`), så `pending` kan förnyas i upp till sju dagar. Master: `scheduleRetry` utan tak. | Räkna supersede mot ett tak eller avbryt i stället för att lämna `pending`. Repro med exakt två flikar. |
| [ ] | Delvis åtgärdad | P2 | `SM-091` Import-zip som ger 403 efter lyckad metadata säger inte om orsaken är privat repo, utgången token eller borttaget arkiv. | `src/lib/import/github-import-transport.ts:334` och `:470`; preview och master. Rå «Archive download forbidden» är ersatt med svensk text; meta-403 har egna meningar. | Skilj orsakerna i zip-403 när det går; kör privat-repo-smoken när `TEST_USER_*` finns. |
| [ ] | Delvis åtgärdad | P3 | `SM-030` En `postgres-drizzle`-dossier kan samexistera med en senare Mongo-markör, så BuildSpec/prompt bär två databasidentiteter. | `detect-integrations.ts:221` matchar fortfarande Mongo; preview kan 409-stoppa en godkänd Mongo-markör mot igenkänd postgres-drizzle-kärna (`tier3-readiness.ts:541`), master saknar spärren. `align-database-marker.ts` finns inte; #1414 stängdes utan merge. | Kvar: promptbygget när spärren inte tar. Reproducera innan ny kod landar. |
| [ ] | Öppen kodbugg | P3 | `SM-098` `hooks:install:soft` sväljer en hookinstallations-exit 1 och `predev` kör den vid varje dev-start, så pre-push kan saknas tyst. Från `A#12`. | `package.json:38`, `scripts/dev/predev.mjs:31`, `scripts/dev/install-git-hooks.mjs:444`; preview och master. Konflikttexten skrivs till stderr men dev fortsätter. | Gör saknad pre-push synlig vid dev-start eller i `npm run inbox`. |

| [ ] | Lokal kodfix | P1 | `SM-099` Drizzle-fel 23505 under cause missas av konflikt-/retryhanteringen. Svärm 2026-11-03 `A1`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/db/chat-repository/versions.ts`, `src/lib/db/services/domain-orders.ts`, `src/lib/db/services/projects.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-100` Tom dubblett av tool-call skriver över den riktiga planen. Svärm 2026-11-03 `A2`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/stream/stream-format.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-101` Replacement-token i genererat innehåll återinför blockerad kod efter sanering. Svärm 2026-11-03 `A3`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/security/output-sanitizer.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-102` Rubriker i användarens brief kan få kontraktsprioritet i promptbudgeten. Svärm 2026-11-03 `A4`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/system-prompt/budget.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-103` Manipulerad thumbnail_path når radering av annan projekts blob/mediefil. Svärm 2026-11-03 `A5`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/app/api/projects/[id]/thumbnail/route.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-104` Hemliga npmrc-värden följer med publik ZIP och privat backup. Svärm 2026-11-03 `A7`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/export/sanitize-public-export.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-105` Oautentiserad konversationsendpoint kan skicka leadmejl till fasta mottagare. Svärm 2026-11-03 `A9`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/app/api/did/conversation/route.ts`; lokal reproduktion 2026-11-03. | Bearer-guard och regressionsprov gröna. Före leverans: sätt separat DID_CONVERSATION_WEBHOOK_SECRET och matchande autentisering hos D-ID, kör syntetiskt prov; ingen livekonfiguration ändrad. |
| [ ] | Lokal kodfix | P2 | `SM-106` Trickle-svar kan överskrida capture-transportens avsedda tidsbudget. Svärm 2026-11-03 `A11`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/capture/pinned-fetch.ts`, `src/lib/projects/thumbnail-capture.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-107` WordPress-fallback kan ersätta originalsajtens innehåll med annan origins data. Svärm 2026-11-03 `A12`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/webscraper.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-108` Filbyte skriver över osparat kodutkast. Svärm 2026-11-03 `A13`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/components/builder/preview-panel/code/usePreviewPanelCodeDrafts.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-109` Appens analytics fortsätter efter nekat samtycke. Svärm 2026-11-03 `A14`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/components/layout/analytics-tracker.tsx`, `src/app/layout.tsx`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-110` Databasfel visas felaktigt som modellautentisering eller kvotfel. Svärm 2026-11-03 `A16`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/providers/errors/normalize-provider-error.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-111` Okända serverfel exponerar rå feltext via SSE/logg. Svärm 2026-11-03 `A19`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/providers/own-engine/generation-stream.ts`, `src/lib/utils/debug.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-112` JWT-signering tillåter tom nyckel vid saknad serverkonfiguration. Svärm 2026-11-03 `B1`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/auth/auth.ts`, `src/lib/env.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-113` Gammal lösenordshash överlever admininloggning med nya env-uppgifter. Svärm 2026-11-03 `B2`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/auth/auth.ts`, `src/lib/db/services/users.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-114` Autofix tolkar dollartext som replacement-token och korrumperar filer. Svärm 2026-11-03 `B3`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/autofix/pipeline-steps/rebuild-content.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-115` Verifieringslänk aktiverar lösenord valt av den som förregistrerade offrets e-post. Svärm 2026-11-03 `B4`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/app/api/auth/verify-email/route.ts`, `src/lib/db/services/users.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-116` Adminrensning tar bort betalningskvitton så signerad webhook-replay kan kreditera igen. Svärm 2026-11-03 `B6`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/app/api/admin/database/route.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-117` Flerstegsrensning i admin kan lämna halvfärdigt tillstånd vid databasfel. Svärm 2026-11-03 `B7`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/app/api/admin/database/route.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-118` Databasläsfel faller tillbaka till gammal deployidentitet. Svärm 2026-11-03 `B8`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/deployment.ts`, `src/lib/db/services/projects.ts`, `src/lib/domains/resolve-vercel-project.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-119` Misslyckad filhämtning kan skriva en tom projektsnapshot. Svärm 2026-11-03 `B9`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/app/builder/useBuilderProjectActions.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-120` Chattbyte kan skriva gamla meddelanden under den nya chattens localStorage-nyckel. Svärm 2026-11-03 `B10`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/hooks/usePersistedChatMessages.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-121` Enbart providernamn misstolkas som uttryckligt byte av väntande dossier. Svärm 2026-11-03 `B11`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/dossiers/select.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P1 | `SM-122` Git-vakt missar kommandon efter ensamt ampersand och kan tolka fel cwd. Svärm 2026-11-03 `B12`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `scripts/workflow/git-command-ambiguity.mjs`, `scripts/workflow/commit-guard.mjs`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-123` Wizardens IP-kvot kan kringgås med samma konto/run över flera IP-adresser. Svärm 2026-11-03 `B13`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/wizard/authorize-wizard-run.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. Delmängd av kostnadsskyddet i `SM-081`; budgetreservation återstår. |
| [ ] | Lokal kodfix | P2 | `SM-124` Ledande snedstreck hanteras olika av filparser och säkerhets-/exportkedjan. Svärm 2026-11-03 `B14`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/parser.ts`, `src/lib/gen/security/path-validator.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-125` Betald brief-anrikning körs före avvisning av ett saknat projekt. Svärm 2026-11-03 `B18`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/api/engine/chats/create-chat-stream-post.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. Delmängd av kostnadsskyddet i `SM-081`; budgetreservation återstår. |
| [ ] | Lokal kodfix | P2 | `SM-126` SDK-importfixaren missar multiline, trailing comments och subpaths. Svärm 2026-11-03 `B21`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/autofix/rules/tier3-sdk-guard-fixer.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-127` onClick i en kommentar feltolkas som klientkrav och tar bort metadata. Svärm 2026-11-03 `B22`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/gen/autofix/rules/metadata-client-conflict-fixer.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-128` Beställning av flera follow-ups och bugggranskning routas till vanlig byggtur. Svärm 2026-11-03 `B25`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/builder/composer-route.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-129` Dubbel avkodning av företagsnamn med procenttecken kraschar rendering. Svärm 2026-11-03 `B27`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/entry/use-entry-params.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P2 | `SM-130` PDF-extraktion anropar pdf-parse v2 som v1-funktion och ger 422. Svärm 2026-11-03 `M07`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/app/api/text/extract/route.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |
| [ ] | Lokal kodfix | P3 | `SM-131` Negerat eller omnämnt stopp feltolkas som order att avbryta agentmandatet. Svärm 2026-11-03 `M10`. | Master `63dbb9ed2` och preview `e4f8c1f6`: `src/lib/openclaw/debug/armed-mandate.ts`; lokal reproduktion 2026-11-03. | Riktade regressionsprov och oberoende granskning gröna; PR/CI och leverans till preview/master återstår före avbockning. |

MVP före öppen lansering: `SM-080` (isolering) är spärren; `SM-092` måste
kontrolleras live. `SM-096`, `SM-097` och `SM-077` gäller kod som bara finns på
preview och ska lösas eller bevisas före nästa promote.

Svärmfynd som är fixade bara på preview och når prod vid nästa promote:
`A#1` (#1634), `A#2` (#1633), `A#3` och `A#4` (#1632), `A#8`, `A#9` och `A#11`
(#1635). `A#10` gäller gitignorerade lokala `source-command-*`-speglingar i en
checkout, inte spårad kod.

## Releaseblockerare bakom avstängd flagga

Inte nåbara produktbuggar medan flaggan är av. Ej omverifierade 2026-10-19.

<!-- prettier-ignore -->
| ID | Prio | Flagga | Kvar före aktivering |
| --- | --- | --- | --- |
| `SM-007` | P1 | `SAJTMASKIN_DOMAIN_PURCHASE` | Registrar-kontrakt och registrantdata, pengar/reconciliation, crash recovery/ledger, konsekvent provider/pris/state samt färdig retur-, relink- och köp-UX. Svärm 2026-11-03: `A6` NXDOMAIN gav köpmandat, `A8` SEK-avrundning ändrade registrars USD-pris och `B5` misslyckad refund kvitterades 200. Lokala kodfixar med regression i `src/lib/domains/registrar/offer.test.ts`, `fulfilment.test.ts` och `src/app/api/stripe/webhook/domain-purchase.test.ts`; ännu inte levererade. Dessa tre delpunkter stänger inte resten av SM-007 och aktiverar inte köpflaggan. Domänpåslaget x2 styrs av admin via `pricing_settings`. |
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

## Väntar på ägarbeslut

Jake äger samtliga frågor. Ej omverifierade 2026-10-19.

<!-- prettier-ignore -->
| Prio | Fråga | Senast när |
| --- | --- | --- |
| P3 | Ska ”Publik preview” döpas om till vad kontrollen faktiskt gör, och ska ”Hantera domän” flyttas från domän-chevronen till Publicera-menyn? | Fritt. |
| P3 | Briefing N3–N5: återinför Refine efter verifierarfynd, prova bevarande `clear-refine`, och betala extra variant-embedding? | Inte före kvalitetsplanens A-mätning. Se [`docs/plans/archived/2026-08-18-briefing-och-kallpaket.md`](docs/plans/archived/2026-08-18-briefing-och-kallpaket.md). |
| P3 | Dossier D5: ska Backoffice få fri add/remove efter att D2–D4 landat? | D2–D4 är parkerade. Se [`docs/plans/archived/2026-08-19-dossier-forenkling.md`](docs/plans/archived/2026-08-19-dossier-forenkling.md). |
| P3 | Är per-rubrikstaket 480 rätt när `selected-sections` breddas? | Inte aktuellt; taket är ratificerat i [`docs/decisions/README.md`](docs/decisions/README.md). |
| P2 | Ska högst en hard dossier väljas per promptrunda? | Nästa dossier-härdning. |
| P2 | Ska `SAJTMASKIN_REFUSE_DOSSIER_STUBS` vara på i production? | Verifiera aktuell env före nästa flaggändring. |
| P3 | OpenClaw Builder: starta som projektledande byggagent, eller skrota? Underlag i [`docs/plans/archived/2026-08-24-openclaw-builder/`](docs/plans/archived/2026-08-24-openclaw-builder/README.md). | Fritt. |
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

## Arkiv

Avslut med kodfix på både preview och master. Verifierade 2026-10-19 om inget
annat anges; äldre arkiv finns i git och i
[`bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

<!-- prettier-ignore -->
| Klar | Rad | Status på `master` | Bevis |
| --- | --- | --- | --- |
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
