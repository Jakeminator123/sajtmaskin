# Svärmfynd 2026-08-19 — otriagerat underlag

> **Detta är inte buggkön.** Kanonisk källa till buggsanning är
> [`BUG-SWARM-BACKLOG.md`](../../../../../BUG-SWARM-BACKLOG.md). Filen ligger här
> bara för att den var gitignorerad och hade försvunnit med maskinen innan
> någon hann triagera den.
>
> **Radera filen när skrivpasset i
> [`../aktiviteter/housekeeping.md`](../aktiviteter/housekeeping.md) är gjort.**
> Två köer är värre än en ofullständig.
>
> **Ankarna är inte omverifierade mot dagens master.** Minst sex fynd lagades av
> PR:er som mergades efter att listan skrevs — se «Redan lagat idag» i
> [`../00-master-plan.md`](../00-master-plan.md). Bekräfta varje rad mot koden
> innan du ändrar något på den.
>
> **Alla siffror nedan är frysta vid skrivtillfället** (14:59 den 19 augusti).
> Radantalet «28 öppna rader» stämde då; kön har sedan dess fått `SM-058`–`SM-061`
> ur just den här listan. Räkna inte i den här filen — räkna i backloggen.

Read-only audit mot **nuvarande huvudcheckout** (motsvarar master-innehåll; worktree-UI från 08:09 committades aldrig). Prod-bevis: `övrigt/2026-08-19_d42ca2fd_granskning/` + chat `d42ca2fd-b564-4a05-8a43-46f320b1e07d`.

**Syfte:** laga så mycket som möjligt i befintliga kontrakt. Ingen ny yta utan ägarbeslut. Inga fixar här — bara rader.

**Format per rad:** (a) fel · (b) mekanism · (c) ankare · (d) repro · (e) minsta åtgärd · (f) status · (g) storlek/risk.

---

## Lägesbild

| Prio | Rader att laga | Varav nya (inte SM-kö) |
|---|---|---|
| P0 | 8 | 4 |
| P1 | 9 | 4 |
| P2 | 12 | 2 |
| P3 | 10 | 4 |
| Gör inte / avsiktligt | 8 | — |
| SM-kö sannolikt redan lagad | 4 | — |

Aktiv kö i `BUG-SWARM-BACKLOG.md` har **28** öppna rader (synktexten som säger 30 är inaktuell). SM-025 ligger i **Behöver repro**, inte i kön.

---

## Redan verifierat i sessionen (utred inte om igen)

| # | Rad | Mekanism (en mening) | Ankare |
|---|---|---|---|
| 1 | next-themes script-varning räknas som defekt | `ThemeProvider` (next-themes 0.4.6) injiceras när `suppressHydrationWarning` matchar; `shouldIgnoreConsoleError` släpper igenom «Encountered a script tag…» → postcheck-varning → tillsammans med overlay/`productBlocked` blir det «1 spärr» | `src/lib/gen/export/project-scaffold.ts:56`; `src/lib/gen/autofix/rules/layout-provider-fixer.ts:588-598`; `src/lib/gen/verify/product-postcheck.ts:512-521` |
| 2 | SM-037 header-hydration | Server renderade `tel:`+`outline`, klient `#bestall`+`default` i `components/site-header.tsx` | SM-037-klassen; prod `f160a16f097c` |
| 3 | Variant utan verkan på init | Se **P0-V1** nedan | — |
| 4 | Deep Brief-etikett ljuger på follow-up | Se **P1-UI1** | — |
| 5 | Init-prompt syns inte per chat | Se **P0-L1** | — |
| 6 | SM-017 grind grön trots `productBlocked` | Se **P0-G1** | — |

---

## P0 — laga först

### Prompt / orkestrering

#### P0-V1 — Vald mörk variant blir ljus sajt
- **(a)** `futuristic-investment-landing` (`colorMode: dark`, bakgrund `oklch(0.145 0 0)`, anti-pattern «never bright white full-bleed») valdes. v1 och v2 blev ljus (`--background: oklch(0.985 0.006 247)`). Mörkt kom först i v3 efter fri text «Gör sajten mer responsiv och snygg».
- **(b)** Tre oberoende mekanismer, alla sanna samtidigt:
  1. Variantblocket är uttryckligen rådgivande — modellen får ignorera tokens.
  2. Tokenraderna skrivs som `--background` / `--foreground`. Alla scaffolds (t.ex. landing-page) äger Tailwind v4 `@theme inline { --color-background: … }`. En kopia av `--background` ändrar inte `bg-background`.
  3. `buildSpec.stylePack` infereras från prompt-vocab, inte från variant-id. «Elektriker Uppsala» träffar ingen bucket → default `brand-led`. Style pack och variant-id är oberoende.
- **(c)** `src/lib/gen/system-prompt/theme-token.ts:39-55`; `src/lib/gen/system-prompt/sections/scaffold-stack.ts:59`; `src/lib/gen/build-spec/style-pack.ts:77-87`; `src/lib/gen/scaffolds/landing-page/files/app/globals.css:3-4`; `config/scaffold-variants/landing-page/futuristic-investment-landing.json:7,47-49,56-60`.
- **(d)** Init med landing-page + den varianten, friprompt utan «dark/futuristic». Jämför emitterad `app/globals.css` mot variantens `themeTokens.background`.
- **(e)** Härda *befintligt* kontrakt: emitta `--color-background` (och syskon) som Tailwind v4 faktiskt läser. Valfritt: om variant har `colorMode: dark`, låt inte `brand-led` vinna över den. Inte ett nytt style-lager.
- **(f)** `[VERIFIERAT]` mot prod-versioner + kod.
- **(g)** 2–4 filer, ~40 rader. Låg risk. Test: theme-token + en init-fixture.

### Postcheck / grind

#### P0-G1 — `SM-017` `quality_gate_result: preflight_passed` trots `productBlocked: true`
- **(a)** Backoffice/telemetri visar grön grind. Postcheck satte `productBlocked`. Användaren såg «1 spärr». Alla fyra designversioner i dumpen har `quality_gate_result: preflight_passed` + `verification_state=passed`.
- **(b)** Finalize stämplar `quality_gate_result` **före** preview/postcheck. Tri-state är bara preflight/verifier — postcheck skriver aldrig tillbaka. `preflight_passed` = «preflight+verifier rena», men fältet läses som slutlig grind.
- **(c)** `src/lib/gen/stream/finalize-version/persist-telemetry.ts:249-258`; `src/lib/db/services/generation-telemetry.ts:695-781` (stämplar om `preflight_passed` efter repair, fortfarande inte postcheck).
- **(d)** Valfri chat med overlay/`productBlocked`. Läs `generation_telemetry.quality_gate_result` vs `engine_version_error_logs` `product_postcheck.summary.meta.productBlocked`.
- **(e)** Samma kolumn: efter postcheck, skriv `product_blocked` (eller behåll `preflight_passed` men låt *läsaren* som backoffice visar slå ihop med senaste `product_postcheck.summary`). Inte en ny tabell.
- **(f)** `[VERIFIERAT]` prod-dump + kod.
- **(g)** 2–3 filer + 1 test. Medel risk (telemetri-konsumenter). Håll enum bakåtkompatibel.

#### P0-G2 — next-themes-script räknas som produktdefekt (referens, parallell agent äger)
- Se tabellen ovan. **Minsta åtgärd:** utöka `shouldIgnoreConsoleError` med next-themes/script-in-component-frasen *eller* sluta injicera ThemeProvider när enda signalen är `suppressHydrationWarning`. Inte båda i samma PR om det sprider scope.
- **(g)** 1 fil, ~10 rader. Låg risk.

#### P0-G3 — `SM-037` hydration i genererad header (referens, parallell agent äger)
- Se tabellen. **Minsta åtgärd:** håll i befintlig repair/autofix (statisk CTA: samma `href`+variant på server och klient). Inte ny LLM-ingång.
- **(g)** 1 fixer eller promptregel + test. Medel (genererad kod).

### Preview / Fly

#### P0-P1 — `SM-035` Fly `npm install --no-audit --include=dev` exit 254
- **(a)** Preview-VM dör i bootstrap. Signatur `a0bc26af7689`: 17 träffar / 4 chattar (senast 2026-08-19 07:06). I sessionen: från 09:03 på v4, sedan restore-v5. Preview död medan Vercel-prod bytte instans.
- **(b)** Hosten kör `npm install --no-audit --include=dev` när lockfile saknas eller är stale (`preview-host/src/runtime/package-install.js:305-334`). Exit 254 är npm:s generiska krasch (ofta ENOSPC / korrupt cache / avbrutet barn). Det finns `isNoSpaceInstallFailure` men felet loggas bara som exit 254 — rotorsaken når inte `engine_version_error_logs`.
- **(c)** `preview-host/src/runtime/package-install.js:305-342, 338-342`.
- **(d)** Prod-preview efter dossier-tung follow-up (Sanity) eller restore. Läs Fly-disk + sista install-logg.
- **(e)** Härda befintlig host: logga stderr/ENOSPC i error-log; prune cache vid ENOSPC (funktionen finns); retry en gång. Inte ny install-pipeline.
- **(f)** `[VERIFIERAT]` att felet finns och ägs av hosten. `[HYPOTES]` att just 09:03 var disk — klockan sammanföll med Vercel-deploy, men Fly är egen VM.
- **(g)** 1–2 filer i `preview-host/`. Medel risk (alla previews). Kräver Fly-åtkomst för rotorsak.

#### P0-P2 — `preview_boot_page` efter lyckad v7
- **(a)** v7 (F3-integrationer, 110 s, `success: true`) fick `product_postcheck.preview_boot_page` 09:10:31. Användaren såg start-/omstartssidan.
- **(b)** Postcheck provar preview innan runtime är ready. `decidePreviewReadiness` sätter `productBlocked: true` när hosten inte är ready **och** sidan ser ut som boot-placeholder (`product-postcheck.ts:251-261`). Retry-fönstret räcker inte efter npm-254-sviten / kall VM.
- **(c)** `src/lib/gen/verify/product-postcheck.ts:251-261, 849`; `src/lib/capture/preview-boot-page.ts:29`.
- **(d)** F3-runda direkt efter Fly-strul. Error-log `002f309f6ffc`.
- **(e)** Befintlig retry: vänta på host-ready *innan* boot-page räknas som block. Inte ny grind.
- **(f)** `[VERIFIERAT]` i dump. Retry-budget mot kod: `[VERIFIERAT]` att koden kan blocka för tidigt.
- **(g)** 1 fil + test. Låg risk.

### Telemetri / loggning

#### P0-L1 — Init-prompten syns inte i chatens `prompt_logs`
- **(a)** `/logg` på chatId ger bara follow-ups. Ingen kan se vad v1 faktiskt fick.
- **(b)** `create-chat-stream-post.ts` anropar `createPromptLog` **innan** chatten finns och sätter `chatId: null`. Follow-up skriver `chatId`. Retention (200/användare) rensar inte nödvändigtvis raden, men chat-scope-frågor missar den för evigt. Ingen senare UPDATE.
- **(c)** `src/lib/api/engine/chats/create-chat-stream-post.ts:446-452`; `src/lib/api/engine/chats/chat-message-stream/follow-up-prompt-log.ts:81-88`; `src/lib/db/services/prompt-logs.ts:32-39`.
- **(d)** Ny chat → dump `prompt_logs` WHERE chat_id = … (tomt för event `create_chat`). Samma user_id har event `create_chat` med `chat_id IS NULL`.
- **(e)** Skriv loggen *efter* `engineChat.id` finns, eller UPDATE `chat_id` när chatten skapas. Samma tabell.
- **(f)** `[VERIFIERAT]`.
- **(g)** 1 fil, ~15 rader. Låg risk.

---

## P1

### Prompt / orkestrering

#### P1-PR1 — Deep Brief-rader ljuger på uppföljningar
- **(a)** Init-kortet visar brief-status. Follow-up (41 s) hade ingen brief-status men samma tre «Deep Brief-provider/modell/inställning»-rader. Live i `95464d2b-194b-4f39-a607-12cbf51e3c14`.
- **(b)** `buildModelInfoSteps` skriver raderna så fort fälten är satta (ingen «brief kördes»-villkor). `handleMetaEvent` fyller dem från builder-state varje tur. `canUseDeepBrief={!vm.chatId}` — follow-up kör inte brief, men state lever kvar.
- **(c)** `src/lib/hooks/chat/helpers-model-info.ts:56-76`; `src/lib/hooks/chat/stream-handlers-lifecycle.ts:42-46`; `src/app/builder/builder-shell-content/shell-content.tsx:146`.
- **(d)** Init med Deep Brief på → en follow-up. Jämför model-info-steg.
- **(e)** Visa de tre raderna bara när `briefApplied === true` (fältet finns redan, rad 185-187) eller när `!chatId`.
- **(f)** `[VERIFIERAT]`.
- **(g)** 1–2 filer, ~20 rader. Låg risk.

#### P1-PR2 — `SM-038` parallella rutter (`/blog` + `/artiklar`)
- **(a)** Generator skapar en ny routestruktur i stället för att återanvända scaffoldens. Prod-chat `208c3d04`.
- **(b)** Locale-dedupe tar `/blog`↔`/blogg`, inte `/blog`↔`/artiklar`. Ingen synonym för «samma syfte».
- **(c)** `src/lib/gen/route-plan/locale-dedupe.ts:15-66`; `src/lib/gen/route-plan/route-patterns.ts:47`.
- **(d)** Blog-scaffold + prompt som ber om «artiklar». Kräv en struktur.
- **(e)** Utöka *befintlig* dedupe med purpose-synonymer (blog/artiklar/articles), inte ny planner.
- **(f)** `[VERIFIERAT]` att dedupen saknar paret. Sessionen var one-page — inte reproducerad idag.
- **(g)** 1 fil + test. Låg risk.

### Autofix / fixers

#### P1-AF1 — `new Date()` i genererad footer överlever preflight
- **(a)** Preflight på d42ca2fd flaggade `new Date()` i `site-footer.tsx`. Hydration-klass (serverår ≠ klientår nära nyår, eller locale).
- **(b)** Ingen fixer skriver om copyright-år till konstant. `global-shadow-import-fixer` skyddar `new Date()` mot shadowing — den tar inte bort anropet. Preflight är advisory; versionen promotas ändå.
- **(c)** Preflight-logg i dump; `src/lib/gen/autofix/rules/global-shadow-import-fixer.ts:10-18`.
- **(d)** Generera landing-page; sök `new Date()` i footer.
- **(e)** Befintlig preflight/fixer: ersätt footer-år med statisk literal, eller `suppressHydrationWarning` på den noden. Inte ny LLM-repair.
- **(f)** `[VERIFIERAT]` att preflight såg det. `[HYPOTES]` att just det orsakade overlay (header-mismatch är den bevisade SM-037-träffen).
- **(g)** 1 fixer + test. Låg risk.

#### P1-AF2 — `SM-034` skyddad route kan fortfarande saknas efter repair
- **(a)** Repair droppar scaffold-skyddad path; `reinjected: []`, `stillMissing: [app/api/placeholder/route.ts]`; save går vidare.
- **(b)** `reinjectProtectedPathsFromFallback` återställer bara om fallback *har* filen. Om både LLM och fallback saknar den loggas `stillMissing` och persist fortsätter.
- **(c)** `src/lib/gen/scaffolds/protected-paths.ts:91-120`; `src/lib/gen/verify/server-verify/repair-execution.ts:210-241`; `src/app/api/engine/chats/[chatId]/repair/route.ts:397-426`.
- **(d)** Repair som emitterar placeholder-route och där previous-version också saknar den.
- **(e)** Blockera save när `stillMissing.length > 0` för skyddade paths. Fallback-reinject finns redan.
- **(f)** `[VERIFIERAT]` att stillMissing inte stoppar. Delvis härdat (reinject).
- **(g)** 2 filer + test. Medel (repair-gate).

#### P1-AF3 — `SM-001` repair skriver över samma version
- **(a)** Misslyckad repair har ingen återgångspunkt.
- **(b)** `saveRepairedFiles` / `updateVersionFiles` muterar `files_json` in-place. Stale-base-guard finns (concurrent edit), men ingen immutable repair-version.
- **(c)** `src/lib/db/chat-repository/repair.ts`; `src/lib/db/chat-repository/version-files.ts:15-77`.
- **(d)** Acceptera en repair som gör koden sämre; det finns ingen «förra files_json».
- **(e)** Snapshot före skrivning *eller* ny version-rad (befintligt versionskontrakt). Inte ny tabell om versionsrad räcker.
- **(f)** `[VERIFIERAT]` in-place. Ej live-repro idag.
- **(g)** 3–6 filer. Högre risk (versionsmodell). Ta efter P0.

### Postcheck / grind

#### P1-G1 — `fake_form` är systematiskt i designläge
- **(a)** Signatur `def4a6d153de`: 11 träffar / 5 chattar, senast denna session (v4). Formulär med submit men utan `action`.
- **(b)** F2-muten *förbjuder* integrationskod (`app/api/**`, SDK, `process.env`) och kräver lokal `useState` + demo-toast. Postcheck behandlar samma mönster som `fake_form` och kan måla det som spärr när `productBlocked` redan är true (readiness B1).
- **(c)** `.cursor/rules/env-flow-f2-mute.mdc` (kontrakt); `src/lib/gen/verify/product-postcheck.ts:387-397`; `src/lib/chat-readiness.ts:206-217, 309-316`.
- **(d)** Init landing + kontaktformulär i designläge. Vänta postcheck.
- **(e)** Markera F2-demoformulär (`demoOnly` / data-attribut som snapshot redan respekterar) i *generatorn*, eller räkna inte `fake_form` som spärr-målning i designläge. Inte ny UI-yta.
- **(f)** `[VERIFIERAT]` att koden och dumpen stämmer. Kontraktet är medvetet — utfall mot användaren är felet.
- **(g)** 2 filer. Medel (F2-kontrakt).

#### P1-G2 — `SM-036` verifier-kalibrering (falska dep-fynd spärrar)
- **(a)** Null-payload / redan-avregistrerad medlem och «next/react saknas» trots att `package.json` har dem (`777848b18c3b`) behandlas som blockers.
- **(b)** Severity-mappning i verifier/repair. Inte omverifierad mot dagens kod i den här auditen.
- **(c)** Backlog: `src/lib/gen/stream/finalize-version/` + verifier-väg.
- **(d)** Version där server-verify är grön men promotion stoppas på dep-existens.
- **(e)** Kalibrera severity i befintlig verifier; regression quality-vs-blocker.
- **(f)** `[HYPOTES]` — backlog öppen, inte kodstegad idag.
- **(g)** 2–4 filer. Medel.

### Builder-UI (finns i master — worktree committades aldrig)

#### P1-UI1 — Lanseringskortet «1 spärr» sitter kvar
- **(a)** Ägaren sa att kortet ska bort. Worktree `fix/chat-readiness-to-diagnostics` avmonterade `LaunchReadinessCard` och tog bort overlay-text ur collapse-raden. **Aldrig committat.** Master monterar fortfarande kortet.
- **(b)** `shell-content.tsx` renderar kortet ovanför chatten. `resolveChatCollapseStatusText` tar fortfarande `deployBlocker`. Fynden finns redan i `VersionDiagnosticsDialog`.
- **(c)** `src/app/builder/builder-shell-content/shell-content.tsx:307-311`; `src/lib/builder/chat-collapse-status.ts:76-99`.
- **(d)** Öppna builder efter generation med postcheck-varning. Kortet syns.
- **(e)** Avmontera kortet; peka på befintlig «Visa diagnostik». Ta inte bort komponentfilen i samma PR om tester hänger i den. **Inte ny yta — ta bort yta.**
- **(f)** `[VERIFIERAT]` mot master-filen.
- **(g)** 2 filer. Låg risk. Tester i `LaunchReadinessCard.test.tsx` / collapse-test behöver följa med.

#### P1-UI2 — `SM-032` Maps CSP på sajtmaskin.se
- **(a)** Adressautocomplete laddar inte. `script-src-elem` mot `maps.googleapis.com` blockeras.
- **(b)** `loadGoogleMaps` injicerar script från `maps.googleapis.com`. `buildCspPolicy()` har ingen Maps-host i `script-src`/`connect-src`.
- **(c)** `src/lib/google-maps-loader.ts:22-38`; `src/proxy.ts:96-168`.
- **(d)** Öppna location-picker / competitor-map på prod. DevTools CSP.
- **(e)** Minsta hostar i befintlig `buildCspPolicy`. Policytest.
- **(f)** `[VERIFIERAT]` i kod. Inte samma fel som JSON-LD-scriptet i preview.
- **(g)** 1–2 filer. Låg risk (håll CSP stängd i övrigt).

---

## P2

### Prompt / orkestrering

#### P2-PR1 — `SM-027` + `SM-030` kontraktslager vs capability-lager
- **(a)** Recurring-vokabulär ger Stripe i kontrakt trots att capability-lagret inte routar till `payments`. Mongo-ask kan ge Postgres i F2 och Mongo i F3.
- **(b)** `applyDefaultStripePlaceholderWhenPaymentNeeded` matchar `billing|subscription|betalning` i corpus oberoende av `needsPayments`. Manifest Stripe-regel har samma patterns. Mongo-rad i registry lever medvetet.
- **(c)** `src/lib/gen/contract/pre-generation-contracts.ts:221-230`; `config/ai_models/manifest.json:512-513`.
- **(d)** Prompt «återkommande betalning» / «MongoDB». Jämför capability vs contract.
- **(e)** Låt fallback lita på `capabilities.needsPayments`; ta bort `subscription`/`billing` ur Stripe-patterns. Samma pass för SM-030.
- **(f)** `[VERIFIERAT]` regex. Ej live-repro idag.
- **(g)** 2 filer + tester. Medel.

#### P2-PR2 — `SM-021` `starter-neutral` säger `either` men skickar mörka tokens
- **(a)** Light-läge är inte valbart i praktiken.
- **(b)** `colorMode: "either"` + `themeTokens.background: oklch(0.15 …)` (mörk). Samma token-prefixfel som P0-V1.
- **(c)** `config/scaffold-variants/base-nextjs/starter-neutral.json:32,59-61`.
- **(d)** Init base-nextjs + starter-neutral, be om ljust.
- **(e)** Harmoniera metadata och tokens. Inte dashboard-light-skulden.
- **(f)** `[VERIFIERAT]`.
- **(g)** 1 JSON. Låg.

#### P2-PR3 — `SM-011` sync-matcher (sannolikt lagad — se § döda)
- Lämnad som residual: vid **lika score** vinner `auth-pages` för att den står först i listan (`matcher.ts:151-160` + stable sort i `pickBestScaffold:377-380`). Inte first-threshold längre.

#### P2-PR4 — `SM-012` `allowedBuildIntents` efter promotion
- **(a)** Historiskt: promotion utan slutkontroll.
- **(b)** `scaffoldForIntent` / `scaffoldForExplicitIntent` finns nu (`matcher.ts:516-547`). Residual: website→app om `provisionalWebsiteAppEvidence >= MIN_SCORE`.
- **(c)** `src/lib/gen/scaffolds/matcher.ts:341-355, 516-547`.
- **(d)** Explicit «Hemsida» + app-vokabulär.
- **(e)** Om residualen reproducerar: klampa efter promotion. Annars arkivera.
- **(f)** `[HYPOTES]` residual. Stora delen ser lagad ut.
- **(g)** Liten om residual.

#### P2-PR5 — `SM-040` kolonlista `och`/`and` (delvis lagad)
- **(a)** `Terms and Conditions` kunde bli två sidor.
- **(b)** `KNOWN_CONJUNCTION_PAGE_TITLES` finns (`planning-helpers.ts:376-389`). Okända konjunktionstitlar splittas fortfarande.
- **(c)** `src/lib/gen/route-plan/planning-helpers.ts:368-389`.
- **(d)** `Sidor: Hem, Data Protection Policy och Villkor`.
- **(e)** Utöka den lilla listan vid träff. Inte ny parser.
- **(f)** `[VERIFIERAT]` residual.
- **(g)** 1 fil. Låg.

### Autofix

#### P2-AF1 — `SM-002` klient-autofix får filtrerad repair-kontext
- **(a)** `onAutoFix` får `repair` filtrerad till `typecheck|build|lint`.
- **(b)** Samma filter som skyddar server-repair mot zod-400 återanvänds när klienten ska autofixa (`post-checks.ts:1012-1038, 1069-1075`).
- **(c)** `src/lib/hooks/chat/post-checks.ts:1012-1075`.
- **(d)** Quality-gate med repairable icke-kanonisk check + autofix på.
- **(e)** Filtrera bara POST till repair-routen; skicka full lista till `onAutoFix`.
- **(f)** `[VERIFIERAT]` i kod.
- **(g)** 1 fil + test. Låg.

#### P2-AF2 — `SM-003` deploy-repair no-op på orelaterad `repair_available`
- **(a)** Idempotens tittar på versionens `verification_state`, inte deploymentId.
- **(b)** `if (scoped.version.verification_state === "repair_available") return alreadyAvailable`.
- **(c)** `src/app/api/v0/deployments/repair/route.ts:89-101`.
- **(d)** Två failade deploys på samma version.
- **(e)** Idempotens per `deploymentId`.
- **(f)** `[VERIFIERAT]` i kod.
- **(g)** 1 fil + test. Låg.

### Preview / Fly

#### P2-PV1 — `SM-014` Tier-2 iframe `onLoad` släpper overlay för tidigt
- **(a)** Halvfärdig preview syns.
- **(b)** Own-engine pollar ready (`usePreviewIframe.ts:105-169`). **Icke-own-engine / Tier-2** sätter `iframeLoading=false` direkt på `onLoad` (rad 172-178). Hard-cap 6 s visar innehåll medvetet (`PreviewPanelFrame.tsx:46-54`).
- **(c)** `src/components/builder/preview-panel/runtime/usePreviewIframe.ts:172-178`.
- **(d)** Tier-2-preview (inte Fly). Sessionen var Fly — därför inte sett.
- **(e)** Samma ready-poll eller timeout som own-engine, bara för Tier-2.
- **(f)** `[VERIFIERAT]` i kod. Ej sett live 19 aug.
- **(g)** 1 fil. Låg.

#### P2-PV2 — `broken_image` + `http_error` 404
- **(a)** Dump: `images` / `product_postcheck.broken_image` (4+2); `http_error` 404 på samma chat (`3f22d3bd605d`).
- **(b)** Snapshot: `complete && naturalWidth <= 0` → `broken_image`. Browser 404 → `http_error` (advisory, `productBlocked` false från browserEval). Generator pekar på saknade assets.
- **(c)** `src/lib/gen/verify/product-postcheck.ts:346-354, 614-616`.
- **(d)** v1–v3 error-log i dumpen.
- **(e)** Befintlig bildvalidering/autofix: byt till scaffold-placeholder eller droppa src. Inte ny crawl.
- **(f)** `[VERIFIERAT]` att klasserna träffade. Rot-URL:ar inte djuplästa.
- **(g)** Beror på URL. Ofta 1 fixer.

#### P2-PV3 — `SM-033` wizard 504
- **(a)** `/api/wizard/competitors` `maxDuration = 25`, `/enrich` = 30.
- **(b)** Oförändrat.
- **(c)** `src/app/api/wizard/competitors/route.ts:22`; `enrich/route.ts:26`.
- **(d)** Analyserad-flöde mot långsam scrape.
- **(e)** Mät; bounded arbete. Inte blint höj.
- **(f)** `[VERIFIERAT]` gränser. Ej kört idag.
- **(g)** 2 rutter. Medel (latens).

#### P2-PV4 — `SM-025` postcheck dör efter v1 (Behöver repro)
- **(a)** Cross-isolate-race utanför processlås.
- **(b)** Denna session: postcheck **körde** på v1–v4 och v7. Premissen träffades inte.
- **(c)** `src/lib/capture/browser.ts`; backlog § Behöver repro.
- **(d)** Se backlog.
- **(e)** Laga inte förrän skip+browser-closed reproas.
- **(f)** `[VERIFIERAT]` att den **inte** dog i d42ca2fd. Raden är öppen som repro-krav.
- **(g)** — 

### Builder-UI

#### P2-UI1 — `SM-013` template-init-spinner hänger
- **(a)** Failad `POST /api/template` lämnar «Läser in mallen».
- **(b)** `pendingTemplateInit = Boolean(templateId) && !chatId`. Fel nollställer inte `templateId`.
- **(c)** `src/components/builder/preview-panel/PreviewPanelEmptyState.tsx:93-94`.
- **(d)** Öppna `?templateId=` och faila init.
- **(e)** Tråda felet till empty-state. Befintlig yta.
- **(f)** `[VERIFIERAT]` i kod.
- **(g)** 2 filer. Låg.

#### P2-UI2 — `SM-007` domänköp bakom flagga
- **(a)** Tolv fynd (a)–(l) blir verkliga när `SAJTMASKIN_DOMAIN_PURCHASE` slås på.
- **(b)** Releasegrind, inte incident. Flaggan är av.
- **(c)** Backlog + `src/lib/domains/`, `src/app/api/domains/`.
- **(d)** Inte nu.
- **(e)** Inte i den här byggsvängen om inte ägaren slår på flaggan.
- **(f)** `[VERIFIERAT]` som grind.
- **(g)** Stor — utelämna.

---

## P3

### Builder-UI / a11y / CI

#### P3-UI1 — Hero-visitkortet hänger för lågt
- **(a)** Three.js-canvas ~65 px från topp; ska hänga högre.
- **(b)** Wrapper: `-mt-6 md:-mt-10`, höjd `clamp(300px, 40vh, 400px)`. Kortets group `[0, 2.8, 0]` + kamera `[0,0,11]`.
- **(c)** `src/components/landing-v2/landing-hero.tsx:58-63`; `src/components/landing-v2/lanyard-card.tsx:212, 350`.
- **(d)** `/` i prod, mät canvas top.
- **(e)** Justera margin/kamera i **befintlig** hero. Ingen ny yta.
- **(f)** `[HYPOTES]` att 65 px är just den wrapern — inte uppmätt i den här auditen.
- **(g)** 1–2 filer. Låg. Visuellt — jämför med ägaren.

#### P3-UI2 — «Publik preview» är inte iframe av/på
- **(a)** Etiketten lovar preview-toggle. Den sätter `chatPrivacy: unlisted`.
- **(b)** Checkbox i Mer → Inställningar.
- **(c)** `src/components/builder/shell/BuilderHeader.tsx:550-557`.
- **(d)** Slå på; sajten syns fortfarande i buildern; länk blir olistad.
- **(e)** Byt **etikett** till «Olistad länk» (befintlig kontroll). Inte ny toggle. **Kräver ägarbeslut** om copy.
- **(f)** `[VERIFIERAT]`.
- **(g)** 1 sträng + ev. tooltip. Låg.

#### P3-UI3 — Sköld-wrapper i Sajtagenten är inte klickbar
- **(a)** Master-toggle = sköldknappen; pil = meny. Yttre `div` har ingen `onClick`. Val grå tills skölden är in. Utan `OC_EDIT` → `null`.
- **(b)** Medvetet två hit targets i kommentaren; ägaren vill att wrappern togglar.
- **(c)** `src/components/openclaw/OpenClawPowersControl.tsx:24-27, 70-100`.
- **(d)** Klicka padding runt skölden.
- **(e)** Flytta `handleToggle` till wrapper, behåll pil-stopPropagation. Befintlig kontroll.
- **(f)** `[VERIFIERAT]`.
- **(g)** 1 fil. Låg.

#### P3-UI4 — Domän-chevron är syskon till Publicera
- **(a)** Ägaren: in i Publicera-menyn, inte egen knapp.
- **(b)** `domainMenu` är separat `DropdownMenu` + `Button` bredvid Publicera.
- **(c)** `src/components/builder/shell/BuilderPublishControl.tsx:104-132, 211-233`.
- **(d)** Header till höger om Publicera.
- **(e)** Flytta «Hantera domän» in i Publicera-dropdown. **UX-önskemål, inte defekt.** Kräver ägarbeslut om det räknas som ny menyform.
- **(f)** `[VERIFIERAT]`.
- **(g)** 1 fil. Låg.

#### P3-UI5 — Prompt-assist-knapp saknas i master
- **(a)** Verktyg-raden har Plan, inte Prompt-assist. #1038 var OPEN 19 aug. Worktree lade Skärmdump — inte i master.
- **(b)** B10 är beslutad yta, inte committad här.
- **(c)** `src/components/builder/chat/ChatInterface.tsx:735-750`.
- **(d)** Builder-input.
- **(e)** Land #1038 separat. Inte i bugg-PR:en. **Kräver ägarbeslut** att blanda in B10.
- **(f)** `[VERIFIERAT]` saknas i den här checkouten. PR-status inte `gh`-kollad (förbjudet i det här uppdraget).
- **(g)** Egen PR.

#### P3-A11Y — `SM-015` / `SM-016`
- **(a)** `muted-foreground/70`, `text-gray-500`, `hover:bg-primary/90` under AA.
- **(b)** Tokens oförändrade; `src/components/ui/button.tsx:12`.
- **(c)** Många träffar; primärknapp `button.tsx`.
- **(d)** Contrast-audit.
- **(e)** Befintlig token, opak hover. Inte nu om P0/P1 lever.
- **(f)** `[VERIFIERAT]` klasser finns.
- **(g)** Tokens + tester. Bred yta — håll smalt.

#### P3-UI6 — `SM-018` previewflik följer inte iframe-navigation
- **(a)** Parent `previewUrl` ändras inte vid intern nav.
- **(b)** Ingen route-change via preview-bryggan hittad i den här auditen.
- **(c)** Backlog: preview-bryggan.
- **(d)** Multipage-preview, klicka intern länk.
- **(e)** Befintlig bridge-event.
- **(f)** `[HYPOTES]` — inte kodstegad färdigt.
- **(g)** 2 filer.

#### P3-UI7 — `SM-031` `Verify-lane OK` onåbar
- **(a)** `resolveQualityTier` returnerar aldrig `production`. UI mappar `production` → «Verify-lane OK».
- **(b)** `promoted` → `tier2` → «Live-preview startad».
- **(c)** `src/lib/db/engine-version-lifecycle.ts:92-104`; `src/components/builder/version-history/version-history-view.tsx:374-382`.
- **(d)** Promotad version i versionslistan.
- **(e)** Ta bort onåbar gren *eller* mappa `promoted` ärligt. Ägarbeslut om copy.
- **(f)** `[VERIFIERAT]`.
- **(g)** 2 filer. Låg.

#### P3-UI8 — `SM-039` diagnostik blandar körpass (delvis lagad)
- **(a)** Historiskt: v1/v2 i samma vy.
- **(b)** Dialogen är per `versionId`. `selectActiveErrorLogs` filtrerar på `latestPassId`; **om `latestPassId` är null returneras alla loggar** (rad 28).
- **(c)** `src/lib/builder/version-diagnostics-summary.ts:24-38`; `VersionDiagnosticsDialog.tsx:189-200`.
- **(d)** Version utan `logPassId`.
- **(e)** Fail-closed: visa bara rader med pass-id när pass-id saknas på summary, eller gruppera synligt. Inte ny panel.
- **(f)** `[VERIFIERAT]` null-path. Sessionen använde «Visa diagnostik»-vägen.
- **(g)** 1–2 filer.

#### P3-CI1 — `SM-019` `merge:ready` (delvis lagad)
- **(a)** Statuskommentar rev labeln.
- **(b)** Workflow körs bara för `sender.type == Bot` (inte vanlig människokommentar). `decideMergeReadyAction` tar bort vid *vilken* event som är nyare än sign-off — bot-status («usage limit reached») räknas som fynd.
- **(c)** `.github/workflows/merge-ready-freshness.yml:19-47`; `scripts/ci/merge-ready-freshness.mjs:88-90`.
- **(d)** Codex «usage limit»-kommentar efter sign-off.
- **(e)** Invalidera bara vid kända fynd-markörer, inte alla bot-kommentarer.
- **(f)** `[VERIFIERAT]` residual.
- **(g)** 1 skript + test.

---

## SM-kö: öppen / död / delvis

| ID | I kön? | Status 2026-08-19 | Bygg nu? |
|---|---|---|---|
| SM-001 | ja | Öppen (in-place) | P1 efter P0 |
| SM-002 | ja | Öppen | P2 |
| SM-003 | ja | Öppen | P2 |
| SM-007 | ja | Grind, flagga av | Nej |
| SM-011 | ja | **Sannolikt lagad** (`pickBestScaffold` sorterar). Residual: tie → auth först | Arkivera efter stickprov |
| SM-012 | ja | **Delvis lagad** (`scaffoldForIntent`) | Bara vid residual-repro |
| SM-013 | ja | Öppen | P2 |
| SM-014 | ja | Öppen (Tier-2 only) | P2 |
| SM-015/016 | ja | Öppen | P3 |
| SM-017 | ja | Öppen, prod-träff idag | **P0** |
| SM-018 | ja | Öppen | P3 |
| SM-019 | ja | Delvis lagad (bot-filter) | P3 residual |
| SM-020 | ja | **Sannolikt lagad** (`aliasRetiredModelId` → gpt-5.6-sol). Ingen admin-offer av 5.4-mini hittad | Arkivera efter admin-stickprov |
| SM-021 | ja | Öppen | P2 |
| SM-022 | ja | **Sannolikt lagad** (`removeLink` ENOENT→unlink; `.env.local`-symlink samlas av `findLinkedEntries`) | Arkivera efter en teardown |
| SM-025 | repro | Inte träffad i d42ca2fd | Vänta repro |
| SM-027/030 | ja | Öppen | P2 |
| SM-031 | ja | Öppen | P3 |
| SM-032 | ja | Öppen | P1 |
| SM-033 | ja | Öppen | P2 |
| SM-034 | ja | Delvis (reinject); stillMissing stoppar inte | P1 |
| SM-035 | ja | Öppen, prod idag | **P0** |
| SM-036 | ja | Öppen, ej omkodad | P1 |
| SM-037 | ja | Öppen, prod idag | **P0** (parallell) |
| SM-038 | ja | Öppen | P1 |
| SM-039 | ja | Delvis | P3 |
| SM-040 | ja | Delvis | P2 residual |

Arkiverade (rör inte): SM-005/008/009/010/023/024/026/041–044/048–053/055 m.fl.

---

## Dump-signatur → kodägare

| Signatur | Kategori | Kind | Ägare | Rad |
|---|---|---|---|---|
| `d77346dbbddf` | preflight:summary | info | finalize | Gör inte (brus) |
| `d9e287d57a7b` | autofix risky | warning | autofix | Observability |
| `d7432b0d977d` | quality-gate passed | info | grind | SM-017-lögn när postcheck röd |
| `30be40afccf4` | product_postcheck.skipped | skip | capture | SM-025; **inte** i d42ca2fd |
| `424eb2ee845b` | postcheck summary | warning | postcheck | Följd, inte rot |
| `44d9f63b6f49` | autofix risk summary | info | autofix | Brus |
| `d86af93ee7ef` | preflight:issues | warning | preflight | `new Date()` m.m. |
| `bc5682c6222d` | cta_no_handler | product | postcheck + codegen | P1-G1-släkt |
| `a0bc26af7689` | npm install 254 | compile | preview-host | **P0-P1** |
| `ab89e0680a69` | hydration text | runtime | codegen | SM-037 |
| `1cfd0227be2c` | Next overlay | runtime | postcheck | P0-G2/G3 |
| `f160a16f097c` | hydration HTML | runtime | codegen | SM-037 |
| `9bf13221eb3e` | typecheck advisory | compile | gate | Avsiktligt advisory |
| `def4a6d153de` | fake_form | product | F2-mute + postcheck | **P1-G1** |
| `eeffc058eba7` | server verify passed | info | verifier | Brus |
| `002f309f6ffc` | preview_boot_page | runtime | postcheck timing | **P0-P2** |
| `51fd32dbcccb` | images warnings | other | bildvalidering | P2-PV2 |
| `e8e73d204aae` | hydration attrs | hydration | codegen | SM-037 |
| `b541c288de0e` | trasiga bild-URL | other | codegen | P2-PV2 |
| `81ab683a850e` | script tag | runtime | next-themes | **P0-G2** |
| `3f22d3bd605d` | 404 | runtime | assets | P2-PV2 |
| `6de14fbd2dc7` | script tag (annan chat) | runtime | samma som 81ab | P0-G2-klass |

d42ca2fd `errorCategories`: quality-gate 5, preview 6, fake_form 4, images 4, broken_image 2, runtime_crash 3, http_error 2, console_error 5, client-error 3, route-plan 1, boot_page 1.

---

## UI-skuld vs master (worktree committades aldrig)

| Ägarönskemål | Worktree 08:09 | Master nu |
|---|---|---|
| Lanseringskort bort | Avmonterat | **Kvar** (`shell-content.tsx:307`) |
| Collapse utan «Blockerar publicering» | Ändrat | **Kvar** (`chat-collapse-status.ts:96`) |
| Versionsflik infällning | Gjort | Ej verifierat som bugg |
| GitHub under Mer | Gjort | Ej djupkollat |
| Skärmdump-knapp | Tillagd | **Saknas** |
| Prompt-assist | Väntade #1038 | **Saknas** |
| Visitkort högre | Inte gjort | Oförändrat |
| Publik preview-copy | Inte gjort | Oförändrat |
| Sköld-wrapper | Inte gjort | Oförändrat |
| Domän in i Publicera | Inte gjort | Syskon-chevron kvar |

---

## Gör inte (ser ut som bugg, är avsiktligt)

| Sak | Varför | Ankare |
|---|---|---|
| HMR / Fast Refresh / React DevTools i postcheck | Medvetet ignorerat | `product-postcheck.ts:511-520` |
| `ERR_ABORTED` / `blockedbyclient` | Egen crawl + SSRF-gate | `shouldIgnoreFailedRequest:529-547` |
| Browser console_error sätter inte `productBlocked` ensam | Advisory-only; block kommer från overlay/DOM | `product-postcheck.ts:591-595, 1092-1100` |
| Restore-versioner v5/v6 `verification_state=pending` | `editKind: restore` ska inte auto-promotas | `versions/route.ts:371-381` |
| Variantblocket «not a contract» | Medveten frihet — *tokens ska ändå vara applicerbara* (P0-V1) | `scaffold-stack.ts:59` |
| Compact follow-up droppar full tokenlista | Tokenspar; anti-patterns behålls | `scaffold-stack.ts:38-54` |
| Deploy ignorerar `productBlocked` | B1: blockerar F3, inte `canDeploy` | `chat-readiness.ts:103` |
| OpenClaw-bubblor persisteras inte | Session-dump | — |
| `preview_success: true` i dump-telemetri | Kan vara post-finalize runtime-receipt; lita inte på den mot overlay | `persist-telemetry.ts:230-243` |

---

## Inte verifierat / inte hunnit

- Live Fly-disk/npm-cache för exit 254 (bara loggrad + kod).
- Exakt v1 `globals.css` byte-för-byte (bevis via session-dump + tokenmekanism).
- `orchestrationStreamMeta.variantId` null i dump-telemetrins `variant`-fält — dump-skriptet kan mappa fel kolumn; kod *skriver* `variantId` (`persist-telemetry.ts:210-223`).
- SM-036 severity-tabell rad för rad.
- SM-018 bridge-events komplett.
- Admin-UI för SM-020 (alias finns; offer-lista inte öppnad).
- SM-022 live teardown med `.env.local`-symlink.
- #1038 live-status (`gh` inte kört).
- Hero-canvas 65 px uppmätt i browser.
- `cta_no_handler` 18 träffar historiskt — inte isolat i d42ca2fd.
- Route-plan-raden i d42ca2fd (1 st) — inte läst.
- Sanity v4: telemetri visade bara `maplibre-map` på v4; v7 hade `sanity-cms` + `resend-contact-form`. Inte djupkört som egen defekt.

---

## Föreslagen byggordning (inte fixar)

1. **P0-L1** init-prompt `chatId` — 15 min, låser all vidare prompt-debug.
2. **P0-G2** ignorera next-themes-script *eller* sluta injicera ThemeProvider på fel signal.
3. **P0-V1** `--color-*` tokens (+ ev. dark från `colorMode`).
4. **P0-G1** stämpla/läs grind efter postcheck.
5. **P1-UI1** avmontera lanseringskortet (ägarorder, master saknar worktree).
6. **P0-G3 / SM-037** statisk header-CTA + footer-år (P1-AF1).
7. **P1-PR1** Deep Brief-rader villkor.
8. **P1-UI2** Maps CSP.
9. **P1-G1** fake_form vs F2-demo.
10. **P0-P1 / P0-P2** Fly 254 + boot-page — om Fly-åtkomst finns; annars logg först.
11. Rest P1/P2 efter gemensam granskning.

Håll P3-UI (visitkort, sköld, domän, Publik-copy) utanför bugg-PR:en om de kräver copy-/layoutbeslut.

MVP-bias: härda befintliga kontrakt. Rader märkta **kräver ägarbeslut** är nya ytor eller copy — fråga först.
