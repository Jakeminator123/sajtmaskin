# Bug-backlog (konsoliderad)

**Enda aktiva bugglistan i repot** (kanonisk; preflight `check-bug-backlog.mjs` + canvas-generatorn läser den). Sammanslagen från tidigare rålistor (`BUG-SWARM-BACKLOG-MASTER.md`, `gpt_sammanställnin.txt` — borttagna). Grandmaster-svärmens **B01–B15 är arkiverad/löst historik** i [`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md) — **inte** en parallell aktiv lista; dess kvarvarande öppna items (B05/B12/B13) är inlyfta i triage-sektionen nedan.

> **Aktuell aktiv kö = sektionen "Triage-svärm 2026-06-22" nedan**. Den långa **G#/N#/R#-tabellen längst ned = historik + beslut**, inte en daglig att-göra-kö. Låt inte dess längd lura dig: de flesta öppna `[ ]`-rader är **policyval eller edge utan repro**, inte aktiva buggar (svärmen 2026-06-22 klassade dem).

> **Senaste fixvåg (2026-06-22):** verifierade icke-säkerhetsbuggar stängda — `company_profiles`-orphan (#190), `cn` self-import + TS2304 (#201/#209), `physics-3d`-utan-`visual-3d` (#198/#209), inspect-bridge origin/pick-mode (#203), app-side SSRF (#196), och **B05** `refuseDossierStubs` scope-fix (#211, inkl. eval/MCP-trådning). Kvarvarande öppna `[ ]` = arkitektur/drift (G#20/G#25/G#26), repro-krävande (B12/B13/E#1) eller medvetet deprioriterade säkerhetsfynd (#196 TOCTOU, #197 nonce/spoofing). Inga kända "uppenbara + säkra" pure-bug-fixar kvar.

## Legend

| Markering | Status | Regel |
| --- | --- | --- |
| `[x]` | Avslutad | Läs `Status`-kolumnen för om raden är `Fixad`, `Fixad i HEAD` eller `Inte bug`. |
| `[ ]` | Öppen | Bug, risk eller städpunkt som inte ska bockas av förrän den är verifierad/fixad. |

Källor: `G#` = gamla GPT/masterlistan, `U#` = gamla UI/media-svärmlistan, `N#` = inkommande defensiv triage 2026-05-01, `R#` = äldre kodrapport inskickad 2026-05-01.

Defensiv triage använder samma backlogg-system men med en extra bedömning:

| Bedömning | Regel |
| --- | --- |
| Bekräfta | Kod/docs visar ett reellt kvarvarande problem eller en tydlig regression-gate. Behåll som aktiv rad. |
| Edge | Plausibelt men behöver reproduktion eller smal verifiering. Behåll som verifieringsrad, inte byggblocker. |
| Avfärda / kassera | Dubblett, redan fixat, by-design eller inte ett relevant edge case. Räkna inte som aktiv buggrisk. |

## Triage för nästa agent

| Grupp | Antal | Hantering |
| --- | ---: | --- |
| Totalt | 130 | Alla rader i tabellen nedan. |
| Avslutade (`[x]`) | 82 | Filtrera bort från aktiv bugfix. |
| Öppna (`[ ]`) | 48 | Kandidater för fortsatt triage/fix. |
| Explicit `Inte bug` | 13 | Avskrivna eller naming/copy/fallback-beslut; ska inte räknas som aktiv buggrisk. |

| Aktiv prioritet | Kvar | Kommentar |
| --- | ---: | --- |
| P0 | 0 | Inga kvarvarande P0-rader. |
| P1 | 4 | Triage 2026-06-18: G#10/G#13/N#1 BLOCKER (pipeline/policy), E#1 Edge (kräver eval-run mot LLM-providers). Inga säkra smala fix. |
| P2 | 18 | Triage 2026-06-18: 14 BLOCKER (F3/dossier/capability/verify/status-pipeline + policy) + 4 Edge (G#16 env-audit, G#18 docs, G#38 PDF-CPU-policy, G#40 SSRF-rebind). F3-batch: G#21 delvis fixad (empty-files false-green → `409`); G#20 BLOCKER-rot fördjupad (F3-prompt härleds från contracts, ej version-filer); G#22 omverifierad BLOCKER. |
| P3 | 26 | Triage 2026-06-18: 8 kodfix + 5 avfärdade i HEAD; reconcile 2026-06-18 stängde G#67/U#43 (PR #142), G#75/U#11/U#12 + U#6/U#79 (PR #143), G#58/U#80 (copy verifierad) och G#55 (docs-städ). 26 kvar = Edge/BLOCKER (UI-race utan repro, degraded-state-policy, breda refaktorer, live-infra-verifiering). |

### Fast Edit Lane uppföljningar (PR #220, 2026-06-23)

Öppna icke-blockerande fynd från review (Codex/Bugbot) på Fast Edit Lane. Funktionen är flag-gated (`NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT`, `SAJTMASKIN_PREVIEW_PATCH_LANE`). De korruptions-/no-restart-fynden fixades i PR:en; nedan är medvetet deprioriterade rester.

> **Uppdatering 2026-06-23 (`fix/fast-edit-lane-hardening`):** FEL-1, FEL-3, FEL-4, FEL-5 och FEL-6 är **fixade** i den branchen (klienten trådar `engineLatestKnownVersionId`; hosten re-checkar expected-base i låset + rullar tillbaka sessionen vid patch-fail; `booting` tar restart-vägen; env-flaggorna i `serverSchema`). Dessutom #4-härdning: `.env*`/secrets/lockfiles blockas nu i quick-edit-lanen. **FEL-2 löstes senare** i `chore/merge-222-223` (composer `baseVersionRef`-chaining i undo/redo/drop, speglar kodvyns mönster).

- [ ] **FEL-1 (medium): quick-edit saknar concurrency-gate client-side.** `quickEditChatFiles`/`patchEngineChatFile` ([src/lib/builder/engine-files-patch.ts](src/lib/builder/engine-files-patch.ts)) skickar aldrig `engineLatestKnownVersionId`, så den server-sidiga stale-base-409-grinden i [quick-edit/route.ts](src/app/api/engine/chats/[chatId]/quick-edit/route.ts) aktiveras aldrig från buildern. Konsekvens: om chat-headen avancerar i en annan flik/generation forkar en quick-edit från den valda (äldre) versionen i stället för att returnera `stale_base_version`. By-design-tolerabelt för en manuell edit av det man ser; trådda `latestKnownVersionId` för full paritet med follow-up-streamen.
- [ ] **FEL-2 (medium): composer rapid-action kan forka från stale base.** Kodvyn (`usePreviewPanelCodeFiles`) chainas nu via `baseVersionRef`, men composer-handlers (drop/undo/redo) i [PreviewPanel.tsx](src/components/builder/preview-panel/PreviewPanel.tsx) använder fortfarande `versionId`-propen direkt. Två composer-actions före parent-re-render kan forka två minor-versioner från samma major och tappa den första. Lägre frekvens (drag/klick med UI-feedback) än Ctrl+S; samma `ref`-mönster kan appliceras vid behov.

**Ologgade Codex-fynd från senare review-rundor på #220 (loggade i efterhand 2026-06-23 per `pr-merge-review-gate.mdc` — host-side race conditions, flag-gated, flaggorna PÅ i prod):**

> **Plan: produkt** — alla rader nedan rör Sajtmaskins preview-/quick-edit-runtime som betjänar användarsajter (inte meta/bygg-verktygen Cursor/Codex).

- [ ] **FEL-3 (medium): host re-verifierar inte base-version under låset.** Den app-sidiga base-guarden (`expectedBaseVersionId` i [preview-session.ts](src/lib/gen/preview/preview-session.ts)) fixades, men [preview-host/src/server.js](preview-host/src/server.js):523 serialiserar två patch-writes från samma base under host-låset utan att kontrollera att den låsta sessionen fortfarande servar förväntad base innan `versionId` byts. Två quick-edits från samma base som båda passerar app-prechecken → version B kan börja preview:a en workspace som även innehåller version A:s filer. Skicka med expected base i patch-payloaden och avvisa/falla tillbaka vid mismatch inne i låset.
- [ ] **FEL-4 (medium): hot-patch under pågående restart-boot.** [preview-host/src/runtime.js](preview-host/src/runtime.js):789 — när en patch anländer under en in-flight restart medan den gamla dev-processen lever (`running=true` men `booting=true`) skriver hosten den partiella patchen och returnerar `patched`, men restarten kan ha snapshotat pre-patch `filesJson` och skriver om workspacen från den stale bilden → ny quick-edit-version servar gamla filer. Cold-boot-fallet (runtime.js:787) fixades; detta booting+running-fall lämnades. Behandla `booting` som not-running-vägen eller köa en andra restart.
- [ ] **FEL-5 (medium): host avancerar sessionen före patchen landat.** [preview-host/src/server.js](preview-host/src/server.js):523 — om patch-writen failar efter store-mutationen (t.ex. ENOSPC i `patchWorkspaceFiles`) returnerar routen fel men den persisterade sessionen annonserar redan nytt `versionId`/`filesJson`. App-side-fallbacken (`startPreviewSession`) ser en matchande aktiv session via status och återupptar den gamla körande workspacen → quick-edit-versionen får stale preview. Applicera workspace-patchen först, eller rulla tillbaka/markera sessionen oanvändbar vid patch-fail.
- [ ] **FEL-6 (low): nya app-flaggor saknas i `serverSchema`.** `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT` + `SAJTMASKIN_PREVIEW_PATCH_LANE` läses i runtime men finns bara i `config/env-policy.json` (`extraKnownKeys`), inte i [src/lib/env.ts](src/lib/env.ts) `serverSchema` som påstår sig vara single source of truth. Lägg till båda i `serverSchema` så typad onboarding/docs ser dem.

### Modellbump GPT-5.5 + Opus 4.8 (PR #221, 2026-06-23)

Ohanterade Codex P2-fynd på #221 (loggade per `pr-merge-review-gate.mdc` före merge — alla bedömda låg/conditional impact, inget P1/säkerhet).

> **Plan: produkt** — alla rader nedan rör motormodellerna som betjänar användarsajter (own-engine/prompt-assist/Deep Brief), inte meta/bygg-verktygen (Cursor/Codex).

> **Uppdatering 2026-06-23 (`fix/fast-edit-lane-hardening`):** MB-1 och MB-2 är **fixade** (gamla prompt-assist-id återställda i allowlistan; `getTemperatureConfig` strippar nu temperature för `claude-opus`). MB-3 är **dokumenterad** i `manifest.json` (`phaseRouting.notes`) — att faktiskt routa generator-fasen via `resolvePhaseModel` kräver en koordinerad pipeline-ändring över flera call-sites (`create-chat-stream-post`, `chat-message-stream-post`, `generate-site-from-prompt`), inte en enradsfix; lämnas som spårat spår.

- [ ] **MB-1 (medium, bakåtkompatibilitet): prompt-assist-allowlistan ersattes i stället för utökades.** `config/ai_models/manifest.json` → `promptAssist.allowed.{gatewayClassModels,anthropicDirectModels,models}` tog bort `openai/gpt-5.4`, `anthropic/claude-opus-4.6`, `anthropic-direct/claude-opus-4-6`. Ett explicit request med `model: openai/gpt-5.4` faller då på `isPromptAssistModelAllowed` ([prompt-assist/models.ts](src/lib/builder/prompt-assist/models.ts):49) och `/api/ai/chat`/`brief` svarar 400. **Reell men i praktiken låg:** defaulten är nu `openai/gpt-5.5`, värdet persisteras inte client-side (`useBuilderState.ts:61` initierar från default) och `SAJTMASKIN_ASSIST_MODEL` är inte satt. **Icke-trivial fix:** `ASSIST_MODELS` driver BÅDE validering OCH picker-dropdownen (`PROMPT_ASSIST_MODEL_OPTIONS` i [defaults.ts](src/lib/builder/defaults.ts):116) — att bara återinföra de gamla id:na får gpt-5.4 att dyka upp i UI igen. Korrekt fix = separera validerings-allowlist från picker-lista.
- [ ] **MB-2 (medium, conditional): Opus 4.8-brief avvisar temperature.** När `anthropic/claude-opus-4.8` (nu i allowlistan) väljs för Deep Brief postar [useInitBrief.ts](src/lib/hooks/useInitBrief.ts) `temperature: 0.2` som `generateSiteBriefObject()` vidarebefordrar; `getTemperatureConfig()` strippar bara temp för OpenAI-reasoning-namn → Anthropic Opus avvisar non-default sampling → briefen failar före generering. Fix: strippa temp/top-p/top-k för `claude-opus`-modeller, eller exponera inte Opus på brief-vägen.
- [ ] **MB-3 (medium, pre-existing): Anthropic generator-fas-modell är inert i normal generering.** Manifestet sätter anthropic planner/generator till `claude-opus-4.8`, men de vanliga builder-streamsen skickar `pipeline.model = engineModel = resolveEngineModelId(tier)` = `buildProfiles.defaults.anthropic` (`claude-sonnet-4.6`), så Opus-4.8-generatorn aktiveras aldrig vid val av Anthropic-tier. OBS: gapet (phase-routing vs `pipeline.model`) fanns redan före #221 (gällde 4.6 likadant); #221 bumpar bara id:t. Tråda in `resolvePhaseModel(..., "generator")` i generation-pipen eller matcha build-profil-defaulten.

### Triage-svärm 2026-06-22 (orchestrator äger nu — parallell bugg-agent avslutad)

7 read-only composer-agenter verifierade öppna rader mot master `c2ccd7efd`. `%` = sannolikhet reell kvarvarande bugg.

**Reella, ej bara policy (kandidater för fix):**

| ID | % | Vad | Ankare |
| --- | --- | --- | --- |
| G#40 | 90% → app-side **FIXAD #196** | **SÄKERHET** — DNS→privat IP. App-guard (`src/lib/ssrf-guard.ts`, delad av fetch-html/media-upload/webscraper) nu DNS-resolv+blockad. Worker-kopian kvar men ej deployad i prod | `services/inspector-worker/server.mjs:106,450` (kvar) · `src/lib/ssrf-guard.ts` (fixad) |
| G#20 | 88% | F3 build-plan från `preGenerationContracts`, ej version-filer (drift) | `session-contracts.ts:159` vs `finalize-design/route.ts:87` |
| G#26 | 76% | init vs follow-up olika capability-universum | `follow-up-orchestration-input.ts:103` |
| G#25 | 68% | capability multi-source; snapshot-fix hjälpte bara finalize-design | `orchestrate.ts:1314-1342` |
| G#21 | 52% | F3 `ready:true` när `detectIntegrationsFromVersionFiles` ger `[]` på läsbara filer | `finalize-design/route.ts:190-201` |
| B05 | 90% → **FIXAD #211** | `refuseDossierStubs` matchade HELA registret → false-RED-risk i prod. Fix: `checkCrossFileImports` tar nu `selectedDossierIds` (trådas från `mergeGeneratedProjectFiles`); refuse sker bara när matchad dossier var **vald** för genereringen. Okänd/tom selektion → ingen refuse. Stability-test utökat. | `cross-file-import-checker.ts` · `finalize-merge.ts` |
| B13 | 78% | clear-redesign delta-brief tappas vid contract-gate-retry (NEEDS_REPRO) | `chat-message-stream-post.ts:419` |
| B12 | 72% | F3 auto-kick kringgår stale-base-409 (NEEDS_REPRO) | `useSendMessage.ts:276` |

Full B-serie-detalj (arkiverad): [`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

**Dina policybeslut (höga % men medvetna val, ej fix):** G#10 88% (F2-gate default-off), G#13 90% (brief-fallback), N#1 85% (dossier-stub) — kopplade till B05/B07/B08 + default-off-flaggor.

**NOT_A_BUG / cheap cleanup:** G#56 — vestigial död drift-kod (`variantNomination` produceras ej av schemat → drift alltid null; `orchestrate.ts:1464`). Kan raderas.

**Bekräftat LÖST (grandmaster):** N#6 (Område 6 event-bus-cutover) → flippad till `[x]` nedan.

### Inspect-bridge (#164) review-fynd (2026-06-22)

Bot-fynd från PR #164 (Vercel VADE + Codex). Loggade här per `pr-merge-review-gate.mdc` så inget tappas. `[x]` = fixad i `fix/inspect-bridge-p2`; `[ ]` = öppen P2.

| Klar | Prio | Fynd | Fil/ankare |
| --- | --- | --- | --- |
| [x] | P1 | chunked + Content-Length → ogiltigt HTTP-svar (bröt chunkad preview) | `preview-host/src/runtime.js` (drop transfer-encoding) |
| [x] | P2 | Spoof-skydd: kräv `source:"sajtmaskin-inspect"`-markör + aktivt `liveRef` för hover/pick | `usePreviewInspectBridge.ts:131` |
| [x] | P2 | Identity-encoding: be uppströms om okomprimerad HTML annars hoppas injektion över | `preview-host/src/runtime.js:1517` |
| [x] | P2 | Bevara `?inspect=1` vid imperativ iframe-reload/route-nav (`withInspectParam`) | `PreviewPanel.tsx:620,654` |
| [x] | P2 | **#203** Origin-validering tyst avstängd när `originForUrl` → null (`if (allowed && …)` kortsluts) + `postMode` till `"*"`. Fix: window-identitet hård gräns, origin krävs (ej tyst accept), aldrig `"*"` | `usePreviewInspectBridge.ts:90,124,129` |
| [x] | P2 | **#203** Inspektorn fastnar på vid pick utan registry-match (`if (!match) return` före `setInspectMode(false)`) trots att punkten lagts. Fix: lämna alltid inspect-läget | `PreviewPanel.tsx:341` |
| [ ] | P2 | Fallback till `map`/`ai` när bridge inte kan injiceras (flagga ON men ingen `ready`) → inspektor inert | `PreviewPanel.tsx:170` |
| [ ] | P2 | `config/env-policy.json`-regel för `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE` (env-sync defaultar okända `NEXT_PUBLIC_*` till preview+prod) | `src/lib/env.ts:209`, `scripts/env/manage_env.py:get_rule` |
| [ ] | P2 | Bevara faktisk klick-punkt för bridge-captures (skickar element-center, ej klick-koord) | `usePreviewInspectBridge.ts:164` |
| [ ] | P2 | Läck inte `?inspect=1` in i preview-appen (genererad sida kan läsa `searchParams.inspect`) | `PreviewPanel.tsx:withInspectParam` |

### Control-plane registry (#202) review-fynd (2026-06-22)

Bot-fynd från PR #202 (Codex). Loggat per `pr-merge-review-gate.mdc`. #202 mergad till master; cockpit + env-readiness landade via #207 (konsoliderad efter att stacken tappade base vid squash). `[ ]` = öppen P2.

| Klar | Prio | Fynd | Fil/ankare |
| --- | --- | --- | --- |
| [ ] | P2 | `#fragment`-källreferenser valideras inte: validatorn strippar allt efter `#` och kollar bara att filen finns, inte att den refererade top-level-nyckeln/sökvägen existerar. En framtida typo/borttagning av `repairPolicies`/`perTier*` håller kartan grön men pekar på en obefintlig auktoritet (false-green i själva self-validating-kartan). Fix: resolva JSON-fragment och faila när nyckeln saknas. | `scripts/control-plane/check-registry.mjs:114` |

### Post-review-svärm (#196–#203) triage (2026-06-22)

Granskning av nyligen mergade PR:er. De tre säkra+självklara fixades; säkerhets-/omdömesfynd deprioriterade per ägarbeslut (inte aggressiv säkerhetshärdning i detta skede).

| Klar | Prio | Fynd | Fil/ankare |
| --- | --- | --- | --- |
| [x] | P2 | **#190** `company_profiles` orphanas vid `deleteProject` — kommentaren påstod FK CASCADE men `project_id TEXT` saknar `references()`. Fix: explicit `tx.delete(companyProfiles)` i transaktionen + rättad kommentar. | `src/lib/db/services/projects.ts:251` · `schema.ts:375` |
| [x] | P2 | **#201** TS2304-fixer `cn` self-/circular-import: kunde lägga `import { cn } from "@/lib/utils"` i `lib/utils.ts` självt. Fix: `fileDeclaresSymbol`-guard (lokal deklaration vinner över registry) + `moduleMatchesFile`-guard (importera aldrig modul som resolvar till samma fil) + 2 tester. | `src/lib/gen/autofix/rules/ts2304-known-import-fixer.ts` |
| [x] | P2 | **#198** `physics-3d` kunde bli kvar utan `visual-3d` (Three-shell saknas → dependency-kollision). Fix: invariant i `filterDossierCapabilitiesForPrompt` droppar `physics-3d` när `visual-3d` gateats bort + 3 tester. | `src/lib/gen/orchestrate.ts:329` |
| [ ] | P2 | **#197 SÄKERHET (deprio)** inspect-bridge spoof-skydd svagt: `source:"sajtmaskin-inspect"`-markören är publik och förfalskbar av generated code i samma iframe. Kräver nonce/token-kanal. | `usePreviewInspectBridge.ts` |
| [ ] | P3 | **#197 (deprio)** `?inspect=1` kan nå genererad apps `searchParams`/`window.location.search` — instrumentering mer app-synlig än nödvändigt. | `PreviewPanel.tsx:withInspectParam` |
| [ ] | P2 | **#196 SÄKERHET (deprio)** SSRF connect-time TOCTOU / DNS-rebinding: `safeFetch` resolvar+blockar privat IP statiskt, men faktisk fetch kan re-resolva. Kräver IP-pinning. | `src/lib/ssrf-guard.ts` |
| [ ] | P3 | **#198 (omdöme)** `visual-3d`-heuristik bred: `canvas`/`mesh`/`scene`/`particle`/`tilt` kan släppa igenom 3D. Heuristik-tuning, kräver regression mot `follow-up-clarification.test.ts` — ej enrad-fix. | `capability-inference.ts:95` |
| [ ] | P3 | **#199 (omdöme)** watchdog mäter timeout från `version.created_at`, inte från verify-start → kan ge falsk timeout. Felcopy redan fixad; kräver ny signal (`verification_started_at`). | `readiness/route.ts:36` |
| [ ] | P3 | **#200/#201 (omdöme)** bred registry-vs-lokal kvar i `detectMissingImports`/ts2304 (cross-file lokal export borde vinna). Same-file-fallet löst i #201; cross-file kräver projekt-export-index. | `import-validator.ts:471` |

### Naming-debt: `v0ChatId` — kräver migrationsplan, ej quick-removal (2026-06-22)

Verifierat under live-test-städningen (Fas 5): `v0ChatId` är **inte** ett dött null-fält. Det är en **live DB-kolumn** (`chats.v0_chat_id`, notNull/unique, bär faktiskt chat-id) + en **load-bearing konsument** — `src/app/builder/useBuilderVmPreview.ts` (`isLegacyMappedChatRecord`, rad 22–25/210) gatar VM-preview-bootstrap för legacy-mappade chattar. Full borttagning = tyst regression och bryter DB/payload-nyckel → per `docs/architecture/repository-and-platform.md` krävs **migrationsplan** (byt internt symbolnamn, behåll DB/payload-kompat). Säker delmängd finns om man vill (död `|| data.v0ChatId`-läsning i `useCreateChat.ts:274` + okonsumerat duplikatfält i `/api/projects/[id]/chat`), men huvudfältet i `/api/engine/chats/[chatId]` + DB-kolumnen lämnas orörda tills migrationsplan finns.

**Behöver repro (kan ej avgöras statiskt):** E#1 (eval), R#9 (scaffold-export), G#53 (font), U#29 (media-URL från preview-VM), U#56 (analytics före cookie-consent — integritet), U#77.

Resten (~25 P2/P3) = policy/edge, låg-%, lämnas öppna som beslut-/verifieringsrader.

### Avskrivet / inte bug

| Källa | Fynd | Bedömning |
| --- | --- | --- |
| G#6 | Dep-completer missar CSS/`require()`/dynamic import | Inte bug / fixad; test täcker fallen. |
| G#23 | `feature-runtime` env keys blockerar inte F3 | Inte bug / beslutad arkitektur; bara `build`-enforcement blockerar. |
| G#41, G#42 | `/api/v0/*` finns kvar | Inte bug; API-version/naming debt. |
| G#43, U#40 | `TemplateCatalogSource = "v0"` | Inte bug; naming debt. |
| G#44 | `ModelProviderFamily` innehåller `v0` | Inte bug; naming debt. |
| G#45, U#76 | `demoUrl`, `webhook:v0`, `v0-catalog` kvar | Inte bug; terminologistäd senare. |
| G#69, U#25 | Unsplash `placehold.co` fallback | Inte bug / fallback. |
| G#72, U#67, U#68 | Date formatting locale/timezone varierar | Inte bug; rapportpolicy. |
| U#8 | F3PlaceholderToggle saknar skeleton | Inte bug; UX debt/polish. |
| U#22 | Transcribe accepterar `video/mp4` | Inte bug; Whisper hanterar video-containers. |
| U#26 | Unsplash POST gör upp till 3 externa sökningar | Inte bug; redan hårt cappad. |
| U#48 | OpenClaw tips kräver modul-restart | Inte bug; modul-init-beteende. |
| U#74 | Shadcn category emojis enterprise | Inte bug; copy/brand-städ. |

### Öppen men inte akut bug

| Källa | Fynd | Typ |
| --- | --- | --- |
| G#18 | Dubbla env-docs och genererad `.env.local`-sanning | Docs-städ. |
| U#23 | Transcribe språkfallback bara sv/en | Produkt-gap. |
| U#63 | Backoffice domain-map / manuella paths | Backoffice-städ. |
| U#66 | `console.info` hot paths brus | Logg-städ. |

## Defensiv nytriage 2026-05-01

Inkommande rapporten pekar främst på falskt gröna states. Raderna nedan är inte en ny separat backlogg; de mappar till huvudlistans källor och anger om fyndet ska bekräftas, hållas som edge-verifiering eller kasseras.

| Källa | Inkommande fynd | Backlogg-koppling | Defensiv koll | Beslut |
| --- | --- | --- | --- | --- |
| N#1 | Autofix-stubbar / tomma ersättningsfiler | Ny P1-rad | Bekräfta | `cross-file-import-checker.ts` har fortfarande PascalCase null-render fallback och TODO för dossier-exposed path-stubbar. Inte kassera: vägra dossier-stubbar eller markera dem blocker/degraded. |
| N#2 | Capability/dossier single source | G#25, G#26 | Bekräfta | Dossier-pipen är default-on, men init/follow-up och capability-bridge ska verifieras mot en canonical källa. |
| N#3 | Follow-up context-budget | Ny P2-rad | Bekräfta som regression-gate | `eval:followup` och budgetering finns, men backloggen behöver en gate så budgeten inte växer igen. |
| N#4 | Tysta verify-skips | G#10, G#31, G#32 | Bekräfta | R2-guard hjälper, men warm/cold cache och runtime/UI-gap är fortfarande falskt-grönt-risker. |
| N#5 | Recurring verifier-fynd in i nästa prompt | Ny P2-rad | Bekräfta | Finns kvar som E3 i `Kvarvarande-uppgifter.md`; inte duplicerat i huvudlistan förrän nu. |
| N#6 | Event-bus UI-flip | Ny P2-rad | Bekräfta | `selectVersionStatus(events)` finns, men builder-UI importerar fortfarande äldre DB-statusresolver på centrala ytor. |
| N#H1 | Full testsvit / stale `domain-map.json` | G#3 | Bekräfta tills testsvit passerar | Håll P0 tills full suite visar om fixture-driften är borta; om pass: stäng som fixad. |
| N#H2 | F3 readiness truth | G#20, G#21 | Bekräfta | `/finalize-design` har `ready: true` när inga requirements detekteras; edge är om follow-up missar integrationkrav. |
| N#H3 | Product Postcheck default i preview/staging | G#10 | Bekräfta | Product Postcheck är flaggstyrd default-off och fail-open; produktifiering hör till runtime/UI-gaten. |
| N#H4 | Placeholder/degraded-state policy | G#17, G#22, G#35, G#51, U#29 | Bekräfta som policyspår | Dubblett över flera rader, men behåll som sammanhållande policy: placeholder får inte signalera success. |
| N#H5 | UI race cleanup | U#4, U#5, U#6, U#7, U#9 | Edge | Håll som P3-verifieringar. Kassera enskild rad om kodläsning visar abort/token redan finns eller repro saknas efter smal test. |

### Äldre rapportöverlapp 2026-05-01

Den här rapporten var delvis äldre än nuvarande HEAD. Raderna nedan är kritiskt mappade: redan fixade saker blir inte nya aktiva buggar.

| Källa | Inkommande fynd | Backlogg-koppling | Defensiv koll | Beslut |
| --- | --- | --- | --- | --- |
| R#1 | `/api/domains/save` owner-check | G#2 | Avfärda som aktiv bug | Redan fixad i HEAD via scoped deployment-helper + test. |
| R#2 | `/api/company-profile?companyName=` scope | G#4 | Avfärda som aktiv bug | Redan fixad: `companyName` går via `getCompanyProfileByNameForOwner(...)` med user/session-scope. |
| R#3 | `/api/download` legacy owner-scope | G#1 | Avfärda som aktiv bug | Redan fixad: legacy-routen använder `getEngineVersionForChatByIdForRequest(...)`. |
| R#4 | Engine download-route | Ingen aktiv rad | Avfärda | Ej bugg; route använder redan tenant-scoped helper. |
| R#5 | Preview update + `.env.local` | G#8, G#9 | Avfärda som aktiv bug | Redan markerad fixad: update-path bygger om `.env.local` innan preview-host update. |
| R#6 | F2 "grön" men runtime/UI-problem | G#10, N#4, N#H3 | Bekräfta | Fortfarande design-risk: F2 behöver runtime smoke/Product Postcheck som inte är default blockerande. |
| R#7 | F3 env resolver överkrav/stale snapshot | G#20, G#21, G#25 | Edge | Resolvern är inte längre ren hard-registry; fokusera på snapshot-färskhet och follow-up-detektion. |
| R#8 | Dep-completer missar css/require/dynamic import | G#6 | Avfärda | Test täcker side-effect CSS, CommonJS och dynamic imports. |
| R#9 | Scaffold required files tappas | Ny P3-rad | Edge | Inga hårda bevis i denna pass; lägg som deterministisk preflight/export-verifiering om repro finns. |
| R#10 | Game/interactive-canvas capability-gap | G#12, G#30 | Avfärda som aktiv bug | `needsGame` finns nu, räknas heavy och har tester/prompt-hint. Behåll bara framtida produktbatch om spelpolicyn ska höjas. |
| R#11 | `/api/transcribe` utan auth | Fixad 2026-05-01 | Bekräfta/fixad | Routen kräver nu befintlig user eller guest-session innan OpenAI-anrop. |
| R#12 | `/api/text/extract` utan auth | G#38, U#27, U#28 | Delvis fixad | Auth/session-guard, PDF-fallback och Unicode-bevarande är fixade; 10MB/CPU-policy ligger kvar på G#38. |
| R#13 | Media upload MIME/tags | G#37, U#17 + project-upload-rad | Fixad 2026-05-01 | `/api/media/upload` hade redan blockat SVG/HTML och tags shape-validerats; `/api/projects/[id]/upload` blockar nu också `image/svg+xml`. |

### Rekommenderad körordning efter nytriage

| Ordning | Agent-jobb | Effekt |
| --- | --- | --- |
| 1 | Fixa full testsvit / stale `domain-map.json` | Gör master pålitlig innan fler agent-run. |
| 2 | Stoppa dossier-stubbar från att bli tyst success | Höjer faktisk output-kvalitet och minskar falskt grönt. |
| 3 | Återstående PDF-policy (`text-extract` fallback/i18n) | Auth är fixad; kvar är CPU-/parse-kvalitet och Unicode-bevarande. |
| 4 | Aktivera/produktifiera Product Postcheck | Fångar UI/runtime som typecheck missar. |
| 5 | F3 readiness truth | Stoppar falsk "redo att bygga". |
| 6 | Capability-universum init/follow-up | Minskar drift och bättre follow-ups. |
| 7 | Recurring verifier patterns | Billig promptkvalitetsvinst. |
| 8 | Event-bus UI-flip | Minskar status-mismatch i buildern. |

## Lista

| Klar | Status | Prio | Fynd | Källa | Beslut / nästa steg |
| --- | --- | --- | --- | --- | --- |
| [x] | Fixad i HEAD | P0 | `/api/download` owner-scope för ZIP | G#1, R#3 | Fixad i senaste commit: routen använder scoped version-helper och har test. |
| [x] | Fixad i HEAD | P0 | `/api/domains/save` deployment utan owner-scope | G#2, R#1 | Fixad i senaste commit via `setDeploymentDomainForRequest` och test. |
| [x] | Fixad / verifierad riktat | P0 | Full testsvit failar pga stale `domain-map.json` | G#3, N#H1 | Stale fixture-spåret verifierat med `npx vitest run 'src/lib/config/dashboard-domain-map.parity.test.ts'` (2/2 gröna). |
| [x] | Fixad i HEAD | P1 | `companyProfile?companyName` global lookup | G#4, R#2 | Fixad i senaste commit med owner/session-scope och test. |
| [x] | Fixad i HEAD | P1 | Domain link/verify accepterar arbitrary `projectId` | G#5 | Fixad i senaste commit med projekt-scope och test. |
| [x] | Inte bug / fixad | P1 | Dep-completer missar CSS/`require()`/dynamic import | G#6, R#8 | Avskriven: test täcker side-effect CSS, CommonJS och dynamic imports. |
| [x] | Fixad i HEAD | P1 | `/api/text/analyze` auth ignorerad | G#7 | Fixad i senaste commit och testad. |
| [x] | Fixad nu | P1 | Same-sandbox preview update skickar inte om `.env.local` | G#8, R#5 | Fixad: update-path bygger om `.env.local` via `buildPreviewEnvLocalContents()` innan `updatePreviewHostSession`. |
| [x] | Fixad nu | P1 | Env merge kan skippas vid preview update | G#9, R#5 | Fixad med samma update-path som G#8; täckt av `preview-session.test.ts`. |
| [ ] | Öppen design-risk | P1 | F2 quality gate fångar inte runtime/UI-fel | G#10, N#4, N#H3, R#6 | BLOCKER (triage 2026-06-18): Bekräftad — `product-postcheck.ts` finns men är flagg-styrd default-off + fail-open (`productPostcheckSkipReasonFromError`). Att produktifiera till default-blockerande runtime smoke/postcheck är ett pipeline-/kvalitetsgate-beslut med flera rimliga implementationer (kan flippa version-status). Eskaleras, fixas inte i triagen. |
| [x] | Fixad nu | P1 | Ingen runtime smoke för WebGL/3D | G#11 | Fixad med statisk WebGL/R3F-readiness smoke: verifier blockerar R3F Canvas utan `"use client"` och Visual QA rapporterar `webgl-readiness`. |
| [x] | Fixad nu | P1 | Ingen tydlig game/interactive capability | G#12, R#10 | Fixad: `needsGame` infereras för spel/playable canvas, ger egen prompt-hint och räknas som heavy. |
| [ ] | Öppen kvalitet-risk | P1 | Simplified brief fallback sänker premium/3D | G#13 | BLOCKER (triage 2026-06-18): Att begränsa fallback eller införa degraded-mode-signal i generationen är ett kvalitets-/pipeline-policy-beslut (påverkar brief-compose + capability-threading, flera rimliga implementationer). Eskaleras, fixas inte i triagen. |
| [ ] | Öppen bug | P1 | Autofix null-render/dossier stubs kan bli tyst success | N#1 | BLOCKER (triage 2026-06-18): Bekräftad men inte "tyst" — `cross-file-import-checker.ts` loggar `console.warn` för dossier_exposed_path och `generation-stream-post-finalize.ts` persisterar en `warning`-rad (`merge:cross-file-stub` med `dossierId`/`capability` i meta). Att vägra/blocka/degradera dossier-stubbar är flag-gated P5+ pipeline-policy (TODO `FEATURES.refuseDossierStubs`); kan flippa version-status röd och bryta generering. Eskaleras, fixas inte i triagen. |
| [x] | Fixad nu | P1 | Rate limit faller tillbaka till per-instance memory utan Redis | G#14, U#45 | Fixad: produktion failar stängt utan Upstash REST om inte `SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD` sätts explicit. |
| [x] | Fixad nu | P1 | `default-seed` kan ge predikterbara slug-lösen | G#15 | Fixad: lösen kräver `KOSTNADSFRI_PASSWORD_SEED`, `KOSTNADSFRI_API_KEY` eller explicit secret. |
| [ ] | Öppen städ | P2 | `process.env` drift utanför `env.ts` | G#16 | EDGE (triage 2026-06-18): `process.env.*` används direkt i ~100 filer (API-routes, lib, providers). Migrering till canonical `env.ts`-accessor är en bred refaktor utan ett enskilt säkert/smalt fix — kräver dedikerad städ-pass + env-policy-mappning. Lämnas öppen. |
| [ ] | Öppen design-risk | P2 | `allowPlaceholdersInF3` kan släppa stub secrets | G#17, N#H4 | BLOCKER (triage 2026-06-18): `readAllowPlaceholdersInF3` är redan en explicit opt-in toggle som `finalize-design` läser per projekt. Att snäva in den till dev/test-lägen eller koppla degraded/publicera-ändå-UX är ett policyspårsbeslut (säkerhet vs UX, flera rimliga implementationer). Eskaleras. |
| [ ] | Öppen docs-städ | P2 | Dubbla env-docs och genererad `.env.local`-sanning | G#18 | EDGE (triage 2026-06-18): Docs-konsolidering kräver beslut om canonical källa (`docs/ENV.md` vs `config/env-policy.json` vs genererad sanning) och risk att ta bort reell info; ej verifierbart via vitest. Lämnas öppen för dedikerad docs-pass. |
| [ ] | Öppen drift-risk | P2 | Generated `.env.local` kan vinna över user env | G#19 | BLOCKER (triage 2026-06-18): Precedence mellan genererad `.env.local` och user-env är ett medvetet env-build-beslut i preview-env-byggaren; ändrad ordning kan tysta bryta preview/integrationer. Kräver pipeline-/env-beslut. Eskaleras. |
| [ ] | Öppen bug | P2 | F3 Build Plan saknas när follow-up inte återinfererar integration | G#20, N#H2, R#7 | BLOCKER (F3-batch 2026-06-18, fördjupad): Bekräftad rot — `renderTier3IntegrationBlock` (`system-prompt/sections/session-contracts.ts`) härleder F3-build-planen från `preGenerationContracts.contracts` (brief-/orchestrate-härledd), INTE från parent-versionens faktiska filer. `/finalize-design` återinfererar däremot från version-filer (`detectIntegrationsFromVersionFiles`). Drift: om follow-up-briefen inte återinfererar integrationer blir build-plan-blocket tomt fast koden har integrationer. Att tråda fil-härledda integrationer in i F3-prompten är en pipeline-/signal-ägar-ändring i orchestrate/contract-derivering. Eskaleras. |
| [ ] | Delvis fixad / BLOCKER | P2 | `/finalize-design` kan säga ready utan integrationkrav | G#21, N#H2, R#7 | DELVIS FIXAD (F3-batch 2026-06-18): Tätade en konkret false-green — `deriveTier3BuildSpecForVersion` returnerade `{requirements:[]}` när versionens filer var tomma/oläsbara (`getVersionFiles` → `[]`/`null`), vilket gav `ready: true` ("inga integrationer") på en version vi aldrig inspekterat. Returnerar nu `null` → route svarar `409 version_files_unavailable` i stället för falsk grön. Regressionstest + uppdaterad happy-path i `route.test.ts`. KVAR (BLOCKER): den bredare detektionsfullständigheten (regex i `detect-integrations.ts` kan missa en integration på filer som FINNS) är ett öppet-ändat kvalitets-/pipeline-spår. Eskaleras. |
| [ ] | Öppen bug | P2 | Hard dossiers ger placeholder UI i stället för blocker | G#22, N#H4 | BLOCKER (F3-batch 2026-06-18, omverifierad): Att flippa hard-dossier-saknad från placeholder-UI till blocker/degraded är degraded-state-policy (samma spår som G#17/G#35/G#51, N#H4) — påverkar codegen-status och kan bryta generering. Hör ihop med samma policy-beslut som G#51/G#35. Eskaleras. |
| [x] | Inte bug / beslutad | P2 | `feature-runtime` env keys blockerar inte F3 | G#23 | Avsiktligt: bara `build`-enforcement blockerar F3; `feature-runtime` surfacas som warning/info. Ändra dossier-enforcement till `build` om en nyckel ska blocka. |
| [x] | Fixad nu | P2 | Dossier verbatim-missing bara warning | G#24 | Fixad: selected dossier med saknad verbatim-fil failar prompt-compose i stället för att bara varna och fortsätta. |
| [ ] | Öppen kvalitet-risk | P2 | Dossier/capability-threading svagt vissa paths | G#25, N#2, R#7 | BLOCKER (triage 2026-06-18): Canonical-källa-konsolidering över init/follow-up/dossier-bridge (`capability-dossier-bridge.ts` → `orchestrate.ts`) är arkitektur/ägarmatris-arbete, inte ett smalt fix. Eskaleras (ihop med G#26). |
| [ ] | Öppen bug | P2 | Init och follow-up har olika capability-universum | G#26, N#2 | BLOCKER (triage 2026-06-18): Konsolidering av capability-universum init vs follow-up är samma single-source-arkitekturspår som G#25 (signal-ägarmatris). Flera rimliga implementationer. Eskaleras. |
| [x] | Fixad i HEAD | P2 | `canvas` triggar 3D för 2D/dekorativa canvas | G#27 | Fixad i tidigare commit: dekorativ 3D och physics delas, med tester. |
| [x] | Fixad nu | P2 | `needsPhysics` triggar inte heavy budget | G#28 | Fixad: `needsPhysics` ingår i canonical `HEAVY_CAPABILITY_KEYS`. |
| [x] | Fixad nu | P2 | Forms/auth/payments/parallax räknas inte som heavy | G#29 | Fixad: `needsForms`, `needsAuth`, `needsPayments` och `needsParallax` ingår i canonical heavy-listan. |
| [x] | Fixad nu | P2 | Kort prompt med spel/game/shadcn missar capability-kontext | G#30, R#10 | Fixad via `needsGame` + heavy context/prompt-hint för korta spelprompter. |
| [ ] | Öppen eval-bug | P1 | `arcade-with-klarna` failar med merge-syntax | E#1, R#10 | EDGE (triage 2026-06-18): Kräver `npm run eval:weird-smoke:dump` som kör skarp generering mot LLM-providers (`eval/cli.ts` laddar nycklar ur env och anropar modellen). Ej reproducerbart i triage-VM:n utan API-nycklar + nätverk + kostnad. Lämnas öppen; repro-krav = eval-run med giltiga provider-nycklar, jämför sedan raw/fixed/merged/canonical. |
| [ ] | Öppen verifier-risk | P2 | Warm tsc/eslint fail-open vid kall cache | G#31, N#4 | BLOCKER (triage 2026-06-18): `warm-typecheck.ts` är dokumenterat avsiktligt fail-open med explicit `skipped: "cache_cold"`-reason (cache-provisionering out of scope). Att göra cold-cache default-blockerande är ett infra-/pipeline-beslut (skulle blockera generering i miljöer utan warm cache). Eskaleras. |
| [ ] | Öppen design-risk | P2 | Preview kan visas trots verifier-blocked draft | G#32, N#4 | BLOCKER (triage 2026-06-18): Att i UI skilja preview-materialisering från verifierad version är en runtime/UI-gate-ändring över flera builder-ytor (kopplad till N#6 event-bus-status). Eskaleras. |
| [ ] | Öppen kvalitet-risk | P2 | LLM-verifier ser snippets, inte hela filer | G#33 | BLOCKER (triage 2026-06-18): Att ge verifieraren hela filkontext (vs snippets) ändrar verifier-arkitektur + token-budget; alternativt begränsa claimen = prompt-/role-beslut. Flera rimliga implementationer. Eskaleras. |
| [x] | Fixad nu | P2 | Partial-file repair capped vid 1 attempt | G#34 | Fixad: `partialFileRepairMaxAttempts` höjt från 1 till 2 i `config/ai_models/manifest.json`; arkitektur-/LLM-docs uppdaterade. |
| [ ] | Öppen prompt-risk | P2 | Recurring verifier-fynd saknas i nästa codegen-prompt | N#5 | BLOCKER (triage 2026-06-18): Att mata 3-5 senaste verifier-fynd in i nästa codegen-prompt är ett nytt prompt-composition-steg (system-prompt-section + verifier-historik-hämtning) — pipeline-beslut per `pipeline-rules.mdc` (statisk prompt vs nytt steg). Eskaleras. |
| [ ] | Öppen UX-risk | P2 | Placeholder-bild maskerar trasigt original | G#35, U#72, N#H4 | BLOCKER (triage 2026-06-18): Degraded-state-policy (samma spår som G#22/G#51, N#H4) — kräver beslut om hur placeholder-bild signaleras som degraded vs success över image-materializer/validator + UI. Eskaleras. |
| [ ] | Öppen regression-risk | P2 | Follow-up context-budget saknar hård regression-gate | N#3 | BLOCKER (triage 2026-06-18): `eval:followup` finns; att göra den till en hård PR/CI-regression-gate är ett process-/CI-beslut (var gaten körs, tröskelvärden, baseline). Inte ett kodfix i triage-scope. Eskaleras. |
| [x] | Fixad (Område 6) | P2 | Event-bus statusprojektion inte fullt inkopplad i builder-UI | N#6 | LÖST 2026-06-22 (triage-svärm, 4% kvar): Område 6 #159–163 kopplade in `useVersionStatus`/`busStatus` i `BuilderShellContent`/`VersionHistory`; legacy `resolveEngineVersionDisplayStatus` raderad; S3 single-writer-grep-invariant vaktar mot återinförande. |
| [x] | Fixad nu | P2 | `upload-from-url` läser body före size-check | G#36, U#20 | Fixad: content-length precheck + streamad läsning med 4MB stopp. |
| [x] | Fixad nu | P2 | SVG/HTML tillåts i media-upload | G#37, U#15, U#16, R#13 | Fixad för `/api/media/upload`: `image/svg+xml` och `text/html` tas bort ur upload-allowlist. Se separat project-upload-rad för kvarvarande edge. |
| [x] | Fixad nu | P2 | Project image upload tillåter SVG trots media-upload-policy | R#13 | Fixad: `/api/projects/[id]/upload` speglar nu media-upload allowlist och nekar `image/svg+xml`; regressionstest tillagt. |
| [ ] | Öppen policy-fråga | P2 | Publik PDF-parse-yta / 10MB input | G#38, R#12 | EDGE (triage 2026-06-18): Auth-delen är fixad (kräver user/guest-session). Kvar är ren CPU-/storleks-policy (är 10MB rätt cap?) — produktbeslut, inte buggfix. Lämnas öppen som policy-fråga. |
| [x] | Fixad nu | P2 | Transcribe loggar första 80 chars | G#39, U#21 | Fixad: loggar bara transcript-längd. |
| [x] | Fixad nu | P2 | `/api/transcribe` saknar auth men kör kostnadsdrivet OpenAI-anrop | R#11 | Fixad: kräver user eller befintlig guest-session innan Whisper-anrop; regressionstest tillagt. |
| [ ] | Öppen säkerhetsrisk | P2 | Inspector SSRF-edge publik DNS -> privat IP | G#40, U#50 | EDGE (triage 2026-06-18): `services/inspector-worker/server.mjs` har `isDisallowedHost` som blockar literala privata IPv4/IPv6, men returnerar `false` för icke-IP-hostnamn (rad ~106) → publik DNS som resolvar till privat IP släpps igenom före `page.goto`. Robust fix kräver request-nivå-interception (TOCTOU mot Playwrights egen DNS) = säkerhetsarkitektur; workern saknar vitest-harness. **App-side-varianten FIXAD i #196:** den delade `src/lib/ssrf-guard.ts` (`safeFetch`, används av `fetch-html`/`media-upload`/`webscraper`) DNS-resolvar nu hostnamn + blockar privat/intern IP (inkl. IPv4-mappad IPv6), på initial + varje redirect-hopp. Workerns egen `isDisallowedHost`-kopia kvar men **ej deployad i prod** (`INSPECTOR_CAPTURE_WORKER_URL` bara i Development) + ersätts av inspect-bridge (#164). Residual i båda: connect-tid TOCTOU (rebinding) → kräver IP-pinning. |
| [x] | Inte bug | P3 | `/api/v0/*` finns kvar | G#41, G#42 | Avsiktlig API-version/naming debt, inte runtime-bugg. |
| [x] | Inte bug / naming debt | P3 | `TemplateCatalogSource = "v0"` | G#43, U#40 | Inte bug; kan städas separat om glossary/legacy-plan kräver. |
| [x] | Inte bug / naming debt | P3 | `ModelProviderFamily` innehåller `v0` | G#44 | Inte bug; naming debt. |
| [x] | Inte bug / naming debt | P3 | `demoUrl`, `webhook:v0`, `v0-catalog` kvar | G#45, U#76 | Inte bug; terminologistäd senare. |
| [x] | Inte bug / föråldrad premiss | P3 | Root lockfile saknas | G#46 | Avskriven: repo använder npm + `package-lock.json`; CI kör `npm ci`. |
| [x] | Fixad i HEAD | P3 | ESLint-varningar / sync setState / unused | G#47 | `npm run lint` är grön i HEAD (0 errors, 0 warnings). Inga sync-setState/unused-varningar kvar att fixa. |
| [x] | Fixad nu | P3 | Placeholder copy kvar i scaffoldfiler | G#48 | Fixad (detektions-coverage): scaffolds använder bracket-placeholders by-design (LLM instrueras ersätta dem via `serialize.ts`). `no-bracket-placeholders`-checken (`eval/checks.ts` + `verify/visual-qa.ts`) saknade `[Roll]`/`[Företag]` som serialize.ts dokumenterar — nu tillagda i båda regexarna. Regressionstest i `checks.test.ts`. (Generiska fri-text-placeholders som `[Kort företagsbeskrivning…]` täcks medvetet inte pga false-positive-risk.) |
| [ ] | Öppen scaffold-risk | P3 | Dashboard `[Företagsnamn]` kan slinka igenom | G#49 | BLOCKER (triage 2026-06-18): `[Företagsnamn]` detekteras redan av `no-bracket-placeholders` i både `visual-qa.ts` och `eval/checks.ts` (poängsänks). Att göra det till en hård quality-gate-blocker (vs warning/score) är ett gate-policybeslut (samma degraded-state-spår som G#51/N#H4) — kan blockera generering. Eskaleras. |
| [ ] | Öppen scaffold-risk | P3 | Blog placeholder body | G#50 | EDGE (triage 2026-06-18): Att byta scaffold-defaulttext mot konkret innehåll motsäger template-designen (scaffolds är generiska startpunkter, LLM fyller innehåll). "Verifiera bort" sker delvis via `no-bracket-placeholders` när placeholdern matchar det namngivna settet. Fri-text-blogg-body utan bracket-token kan inte detekteras utan false-positive-risk. Lämnas öppen. |
| [ ] | Öppen scaffold-edge | P3 | Scaffold required files kan tappas i finalize/export-path | R#9 | EDGE (triage 2026-06-18): Fortfarande inga hårda bevis/repro att required scaffold-filer tappas efter merge/export. Lägg deterministiskt preflight-check + test först när repro finns. Lämnas öppen. |
| [ ] | Öppen UX-risk | P3 | Placeholder CTAs non-blocking | G#51, N#H4 | BLOCKER (triage 2026-06-18): Degraded-state-policy (samma spår som G#22/G#35/G#49, N#H4) — warning vs blocker per lane är ett quality-gate-policybeslut. Eskaleras. |
| [ ] | Öppen variant-risk | P3 | Variant pre-match keyword-only vs final logik | G#52 | EDGE (triage 2026-06-18): Att konsolidera pre-match-selector (keyword) mot slutlig embedding-logik är en refaktor i scaffold-variant-matchningen med flera rimliga utfall; kräver verifiering av drift mellan pre-match och final. Lämnas öppen. |
| [ ] | Öppen typography-risk | P3 | Font materializer träffar mest baseline Inter | G#53 | EDGE (triage 2026-06-18): Kräver verifiering av variant→font-parningar mot faktisk output (eval) för att avgöra om baseline-Inter-bias är en bugg eller korrekt fallback. Inte ett blint smalt fix. Lämnas öppen. |
| [ ] | Öppen typography-risk | P3 | Geist workaround kan sabotera variant-typografi | G#54 | EDGE (triage 2026-06-18): Att begränsa Geist-workaround till kända fall kräver kartläggning av vilka varianter som faktiskt påverkas (verifiering mot font-materializer-output). Risk att smalna fel. Lämnas öppen tills fallen är belagda. |
| [x] | Fixad nu | P3 | `/api/ai/spec` naming debt | G#55 | Fixad (copy-pass 2026-06-18): routen + spec-first-kedjan finns inte längre i koden (bara `brief`/`chat`/`model-trace` under `src/app/api/ai/`, inga symbolreferenser). Stale docs-rader som presenterade `/api/ai/spec`/`processPromptWithSpec` som levande borttagna ur `model-build-profiles.md` (Product lane) och `llm-role-matrix.md` (Spec-first helper). `glossary.md` behåller raden medvetet (namnskugge-tabell → Deep Brief); arkiverad plan bevaras som historik. |
| [ ] | Öppen schema-risk | P3 | `variantNomination` nämns men produceras inte av schema | G#56 | BLOCKER (triage 2026-06-18): Fältet typas (`system-prompt/types.ts`) och konsumeras i drift-detektion (`orchestrate.ts:879`), men om brief-strict-schemat/prompten inte producerar det blir drift-koden död (alltid null). Att synka kräver beslut: lägg till i brief-strict-schema + prompt ELLER ta bort drift-detektionen — schema-/pipeline-yta med flera rimliga utfall. Eskaleras. |
| [ ] | Öppen kvalitet-risk | P3 | Follow-up quality promotion svagare än init | G#57 | BLOCKER (triage 2026-06-18): Att jämka follow-up-quality-gate mot init-gate är ett pipeline-/gate-policybeslut (kopplat till F2/F3-skillnad och repair-gate); flera rimliga utfall. Eskaleras. |
| [x] | Verifierad i HEAD | P3 | Blandning av "Bygg nu", "F3", "Bygg integrationer" | G#58, U#80 | Verifierad (copy-pass 2026-06-18): F3-CTA:n är redan canonical `"Bygg integrationer"` överallt (`PreviewPanelF3Trigger.tsx`, `BuilderShellContent.tsx`, `VersionHistory.tsx` m.fl.); ingen kvarvarande `"Bygg nu"`-CTA i `src`. Rå `F2`/`F3` förekommer bara i kodkommentarer/interna fält, inte som primär user-facing CTA. Den rapporterade blandningen finns inte längre i HEAD. |
| [ ] | Öppen storage-risk | P3 | Builder localStorage keys utan versionsprefix | G#59, U#54 | EDGE (triage 2026-06-18): Builder-nycklarna är redan namespace-prefixade (`sajtmaskin:designTheme`/`lastProjectId`/`lastChatId`). Att lägga ett schema-versions-segment + migration spänner över flera inline call-sites med lågt värde (värdena är primitiva strängar) och risk att orphan:a befintliga sparade värden. Lämnas öppen för ev. centraliserad storage-helper. |
| [ ] | Öppen observability-städ | P3 | Silent catches i dev/log readers | G#60, U#64 | EDGE (triage 2026-06-18): Bred observability-städ över flera dev/log-readers; "låg brusnivå vs explicit degraded state" är en logg-policy som bör göras sammanhållet, inte som spridda punktfix. Lämnas öppen. |
| [x] | Fixad nu | P3 | Shadcn registry cache saknar maxstorlek | G#61, U#33 | Fixad: in-memory-cachen i `registry-service.ts` extraherad till `registry-memory-cache.ts` med `MAX_CACHE_ENTRIES=256` + oldest-first-eviction (TTL kvar 5 min). Regressionstest i `registry-memory-cache.test.ts`. |
| [x] | Fixad nu | P3 | Shadcn cache key casing/whitespace dubletter | G#62, U#34 | Fixad: `buildRegistryCacheKey` normaliserar style/name/source (trim + lowercase) så `"New York"`/`"new york "`/`"new-york"` inte längre ger dubbletter. Alla 4 cache-key-sites i `registry-service.ts` använder helpern. Test täcker dedup. |
| [ ] | Öppen registry-risk | P3 | Docs-only block godkänns som usable | G#63, U#36 | EDGE (triage 2026-06-18): `isUsableRegistryItem` räknar avsiktligt docs-only/markdown-payload som "fanns" (explicit kommentar). Att kräva renderbar `files`-source ändrar fallback-semantiken (legit doc-only-entries skulle behandlas som saknade och trigga fallback-kedjan/fel). Flera rimliga tolkningar → produktbeslut. Lämnas öppen. |
| [x] | Fixad i HEAD | P3 | Template embedding cache kräver restart/invalidate | G#64, U#37 | Avfärdad/redan hanterad: `invalidateEmbeddingsCache()` finns i `template-search.ts` och anropas av `regenerateTemplateEmbeddings` efter persist (`template-embeddings-refresh.ts:51`). Dessutom `retryIfTemplateEmbeddingLoadFailed` vid misslyckad load. Explicit invalidation finns och är inkopplad. |
| [x] | Inte bug / data saknar fält | P3 | Template keyword fallback söker inte description | G#65, U#38 | Avfärdad: v0-katalogen (`TemplateCatalogItem`/`Template`) exponerar inga `description`/`tags`-fält; `slug` är ett slumpmässigt ID (t.ex. `0brPGNpjNkt`, ej beskrivande). `keywordSimilarity` söker redan båda beskrivande textfälten (`title` + `category`). Att lägga till description kräver att datakällan (extern template-pipeline) får fältet, inte ett sökfix. |
| [ ] | Öppen scraper-risk | P3 | Webscraper `MAX_PAGES=4` missar viktig info | G#66, U#41 | EDGE (triage 2026-06-18): Länkar prioriteras redan via `scoreLink` + richness-ranking. Att göra `MAX_PAGES` adaptiv är en token-budget-/produkt-avvägning (fler sidor = mer kostnad/latens), inte ett självklart smalt fix. Lämnas öppen för produktbeslut. |
| [x] | Fixad nu | P3 | Footer/contact/legal kapas av word caps | G#67, U#43 | Fixad (PR #142): `webscraper.ts` extraherar nu kontakt-/legal-signaler (mailto/tel/sociala/org.nr) via `extractContactSignals`/`mergeContactSignals`/`formatContactSummary` och prependar ett kompakt kontakt/legal-block före body-orden innan `AGGREGATE_WORD_LIMIT`-capen — datan överlever truncering och når previewn. Regressionstest i `webscraper-contact.test.ts`. |
| [x] | Fixad nu | P3 | Unsplash GET saknar hård cap på `count` | G#68, U#24 | Fixad: `count` clampas till 1-12 för GET och POST/fallback. |
| [x] | Inte bug / fallback | P3 | Unsplash `placehold.co` fallback | G#69, U#25 | Avsiktlig dev/fallback; kan bytas senare som produktbeslut. |
| [ ] | Öppen inspector-risk | P3 | Element crop kan missa små element vid DPI/zoom | G#70, U#52 | EDGE (triage 2026-06-18): Kräver reproduktion i inspector-worker (Playwright DPI/zoom) som inte finns i triage-VM:n. Lämnas öppen med repro-krav. |
| [ ] | Öppen PDF-UX | P3 | PDF report `window.open` + `document.write` | G#71, U#13 | EDGE (triage 2026-06-18): Print-to-PDF-flödet är avsiktligt (ger A4 `@page`-formatering + sidnumrering via `@bottom-center`). Migrering till blob/download eller server-renderad fil är en feature-rework med flera rimliga designval (förlorad @page-styling vid naiv blob). Lämnas öppen som UX-beslut. (XSS-härdningen för SVG-text gjord separat i U#14/U#73.) |
| [x] | Inte bug / låg risk | P3 | Date formatting locale/timezone varierar | G#72, U#67, U#68 | Inte bug utan rapportpolicy; öppna ny produktfråga om determinism krävs. |
| [x] | Fixad nu | P3 | `generateUniqueFilename` använder `Math.random` | G#73, U#30 | Fixad: använder `crypto.randomUUID`. |
| [x] | Fixad i HEAD | P3 | Image validator HEAD-fallback missar CDNs | G#74, U#71 | Avskriven/fixad: HEAD 405/501 har GET fallback med byte-range och tester. |
| [x] | Fixad nu | P3 | Domain manager polling/save-fail döljs | G#75, U#11, U#12 | Fixad (PR #143): `DomainManager.tsx` surfar nu sök- och save/link-fel som synliga banners (sökfel → felbanner i stället för "Inga resultat hittades"; save-fail efter link → non-blocking `saveWarning`). Stale bakgrunds-save guardas via `saveGenerationRef` och out-of-order sökresultat via `searchGenerationRef`. UI-tester i `DomainManager.test.tsx`. |
| [x] | Fixad nu | P3 | ThinkingOverlay nested `setTimeout` rensas inte vid unmount | U#1 | Fixad: nested fade-timeout sparas och rensas i effect-cleanup. |
| [x] | Fixad nu | P3 | ThinkingOverlay säger "visuell QA" fast default kan vara av | U#2 | Fixad: copy säger syntax- och kvalitetskontroller utan att lova visuell QA. |
| [x] | Inte bug / fixad | P3 | MessageList elapsed interval kan trigga render-loop | U#3 | Avskriven: `RepairProgressIndicator` cappar vid 300s och clearar interval i cleanup. |
| [x] | Fixad i HEAD | P3 | PreviewPanelFrame debounce + hard-cap vid snabb URL-switch | U#4, N#H5 | Avskriven/fixad: debounce + 6s hard-cap finns och timers rensas i cleanup. |
| [x] | Fixad i HEAD | P3 | `usePreviewIframe` timers/refs race tier2/shim | U#5, N#H5 | Avskriven/fixad: preview-ready timers rensas vid URL-/identity-byte innan nya timers sätts. |
| [x] | Fixad nu | P3 | ProjectEnvVarsPanel parallella fetches utan gemensam abort | U#6, U#79, N#H5 | Fixad (PR #143): gemensam request-token (`loaderGenerationRef`) delas av alla parallella loaders i `ProjectEnvVarsPanel.tsx`; sena svar dröppas när token invaliderats (collapse/dep-byte/unmount) och spinner-flaggorna nollas både i effect-cleanup och i loaderns early-returns. (N#H5 är en bredare policy-grupp; U#6/U#79 är åtgärdade.) |
| [x] | Fixad i HEAD | P3 | SeoOptInPanel prefs-fetch stale vid snabb open/close | U#7, N#H5 | Avskriven/fixad: prefs-effect använder cancelled-guard i cleanup och undviker stale writes. |
| [x] | Inte bug / UX debt | P3 | F3PlaceholderToggle saknar skeleton | U#8 | Inte bug; ren polish. |
| [x] | Fixad nu | P3 | VersionHistory actions före mutate synkad | U#9, N#H5 | Fixad: pin/restore/accept-repair väntar nu in `mutate()` innan in-flight state släpps. |
| [ ] | Öppen collaboration-risk | P3 | VersionCollaboration saknar optimistic conflict | U#10 | EDGE (triage 2026-06-18): Optimistic-conflict-hantering (etag/version-guard + conflict-UI) kräver både server- och klientändring + kontraktbeslut; flera rimliga designval. Inte ett smalt fix. Lämnas öppen. |
| [x] | Fixad nu | P3 | Audit PDF inline SVG escaping | U#14, U#73 | Fixad: `generateRadarChartSVG`/`generateBarChartSVG` i `AuditPdfReport.tsx` injicerade rå score-kategori-`key` (utan LABELS-träff) i SVG `<text>` ovan `document.write` — nu via `escapeHtml`. Regressionstest i `AuditPdfReport.test.ts` (malicious key → `&lt;script&gt;`). Numeriska värden var redan typfiltrerade. |
| [x] | Fixad nu | P3 | Media upload tags JSON saknar shape-validering | U#17 | Fixad: endast array av strings sparas, max 20 tags. |
| [x] | Fixad nu | P3 | `upload-from-url` kan skapa konstig `svg+xml`-filändelse | U#19 | Fixad via allowlist + explicit extension map. |
| [x] | Inte bug | P3 | Transcribe accepterar `video/mp4` upp till 25MB | U#22 | Avsiktligt: Whisper hanterar video-containers. |
| [ ] | Öppen produkt-gap | P3 | Transcribe språkfallback bara sv/en | U#23 | EDGE (triage 2026-06-18): Produkt-gap — att lägga fler språk eller göra valet explicit är ett produktbeslut (vilka språk, UX för val), inte en bugg. Lämnas öppen. |
| [x] | Inte bug | P3 | Unsplash POST gör upp till 3 externa sökningar | U#26 | Redan hårt capad till max 3 termer. |
| [x] | Fixad nu | P3 | PDF extract fallback regex nonsens | U#27, R#12 | Fixad: `pdf-parse`-fel returnerar tydligt unsupported (`422`) i stället för ad hoc stream-/BT/ET-regex. |
| [x] | Fixad nu | P3 | PDF extract strippar icke-Latin-1 | U#28, R#12 | Fixad: cleanup tar bara bort kontrolltecken och bevarar Unicode-text från parsern. |
| [ ] | Öppen preview-risk | P3 | Media local fallback `/api/uploads/media` kanske ej nås av VM | U#29, N#H4 | EDGE (triage 2026-06-18): Kräver verifiering mot preview-VM:n (om `/api/uploads/media` nås från VM-kontexten) — kan inte göras i triage-VM:n. Att kräva Blob eller visa degraded state är degraded-state-policy (N#H4). Lämnas öppen med VM-repro-krav. |
| [x] | Fixad nu | P3 | Originalfiländelse / dubbeländelse okontrollerad | U#31 | Fixad delvis vid blob-namn: path-segment saneras och extensionless filer defaultar till `.bin`, inte `.png`. |
| [x] | Fixad nu | P3 | Blob path använder rå `projectId` | U#32 | Fixad: blob path-segment för user/project/filename saneras innan upload. |
| [x] | Fixad i HEAD | P3 | Registry async refresh stale vid misslyckad fetch | U#35 | Avfärdad/redan hanterad: `getRegistryIndexWithCache` i `registry-cache.ts` triggar bakgrundsrefresh med `.catch(log)` vid stale och returnerar last-good (DB-raden med `fetched_at` + `stale`-flagga); misslyckad fetch skriver inte över raden. Last-good med timestamp/status bevaras redan. |
| [x] | Fixad nu | P3 | Template search apps/games hint vs saknad game capability | U#39 | Fixad ihop med G#12/G#30: spel/prompts får `needsGame` i canonical capability-inference. |
| [x] | Fixad nu | P3 | `svävande`/`hovrande` ensamma triggar `needs3D` (false positive) i `capability-inference.ts:127`; `platformerspel` matchar inte `needsGame`-regex (false negative). Verifierat med `inferCapabilities` 2026-05-01 mot prompt-set från `3d-motion-stub-fix`-planen. | N#7 | Fixad: `svävande`/`hovrande`/`flygande` ensamma ger `needsMotion`, inte `needs3D`; explicit `3D`/`WebGL` fortsätter ge `visual-3d`. `platformer-?spel`, `pac-?man-?spel`, `snake-?spel`, `tetris-?spel`, `quiz-?spel`, `arkadspel`, `minispel` matchar nu `needsGame`. |
| [ ] | Öppen scraper-risk | P3 | Webscraper prioriterar about/services/product/blog | U#42 | EDGE (triage 2026-06-18): `scoreLink` har en fast heuristik-ranking. Att domän-/site-type-anpassa den är heuristik-/produkttuning (kopplad till domain-inference) med flera rimliga utfall — ingen entydig korrekt vikt. Lämnas öppen. |
| [x] | Fixad nu | P3 | Webscraper strips `www.` jämförelse | U#44 | Fixad: ny `isSameSiteHost(a,b)` (strippar `www.` + lowercase) ersätter rå `hostname`-jämförelse på de tre crawl-ställena (canonical/og, internlänkar, sitemap-host) i `webscraper.ts`, konsekvent med `getCanonicalUrlKey`. Tidigare klassades `www.`↔apex-länkar fel som externa och crawlades inte. Regressionstest i `webscraper-url.test.ts`. |
| [x] | Fixad nu | P3 | `x-forwarded-for` första IP används som client-id | U#46 | Fixad: produktion ignorerar `x-forwarded-for` om inte `SAJTMASKIN_TRUST_X_FORWARDED_FOR` är explicit satt; `x-real-ip` prioriteras. |
| [ ] | Öppen prompt-budget-risk | P3 | OpenClaw chat 180k code context | U#47 | EDGE (triage 2026-06-18): Sammanfattning/chunking av 180k code-context är ett prompt-budget-/pipeline-designval (vad summeras, chunk-strategi) med kvalitetsavvägningar. Inte ett smalt fix. Lämnas öppen. |
| [x] | Inte bug / dev ergonomics | P3 | OpenClaw tips kräver modul-restart | U#48 | Avsiktligt modul-init-beteende; kan dokumenteras. |
| [ ] | Öppen session-risk | P3 | D-ID avatar ny `sessionId` om saknas | U#49 | EDGE (triage 2026-06-18): Sessionen hanteras av D-ID:s agent-manager-SDK (`use-did-avatar.ts`) + `/api/did/chat` genererar `avatar-${randomUUID}` när saknas. Persist/återanvändning kräver förståelse av D-ID:s session-/billing-modell — designfråga, inte tydlig bugg. Lämnas öppen. |
| [x] | Fixad nu | P3 | Inspector Playwright fallback rate bucket | U#51 | Fixad: inspector capture, element-map och AI-match har separata rate-limit buckets och kräver user eller befintlig guest-session. |
| [ ] | Öppen observability-risk | P3 | ErrorBoundary frontlog fire-and-forget | U#53 | EDGE (triage 2026-06-18): Användaren ser redan ett synligt degraded state (boundary-fallback "Något gick fel" + reload-knapp). Den fire-and-forget frontlog-POSTen är best-effort-telemetri; att lägga retry på en error-rapporterings-call är en medveten policy (loop-/brus-risk) — inte ett självklart smalt fix. Lämnas öppen. |
| [x] | Inte bug / UI-state | P3 | `admin-auth` i localStorage UI-state | U#55 | Avskriven: admin-API:er kräver server-side admin session; localStorage är bara UI-minne. |
| [ ] | Öppen consent-risk | P3 | cookie-banner mini-game consent | U#56 | EDGE (triage 2026-06-18): `cookie-banner.tsx` hanterar bara consent-flaggan (`localStorage["cookie-consent"]`) + visar banner; den laddar ingen tracking själv. Att verifiera "ingen tracking före consent" kräver app-bred audit av var analytics initieras och om de gate:ar på flaggan — verifieringsspår, inte ett smalt fix i bannern. Lämnas öppen. |
| [x] | Fixad nu | P3 | VoiceRecorder/VideoRecorder exhaustive-deps av | U#57 | Fixad: onstop-handlers använder latest-callback refs och eslint-disable för deps är borttagen. |
| [x] | Fixad nu | P3 | LocationPicker exhaustive-deps av | U#58 | Fixad (dokumenterat): `location-picker.tsx`-effekten är en avsiktlig run-once geo-IP-bootstrap; att lägga deps skulle åter-trigga `/api/geo`-fetchen och skriva över användarens pin. Ersatte bara `eslint-disable`-raden med en tydlig motivering (stabila deps via `onChangeRef`). Ingen beteendeändring. Verifiering: typecheck + lint gröna. |
| [x] | Inte bug / fixad | P3 | ModelTraceOverlay URL/localStorage state | U#59 | Avskriven: localStorage-nyckeln är redan prefixad `sajtmaskin:model-trace-overlay`. |
| [x] | Fixad nu | P3 | `decodeStoragePathname` malformed `%` | U#61 | Fixad: malformed percent-encoding ger tydligt storage-fel i stället för rå `URIError`. |
| [x] | Fixad nu | P3 | Local storage delete false utan UI | U#62 | Fixad delvis i media drawer: gamla delete-fel rensas innan nytt delete-försök så stale error inte ligger kvar. |
| [ ] | Öppen backoffice-städ | P3 | Backoffice domain-map / manuella paths | U#63 | EDGE (triage 2026-06-18): Backoffice-städ (Streamlit/`backoffice/shared.py`) — relevant först när domain-map-ytan faktiskt rörs. Ingen runtime-bugg; lämnas öppen som städpunkt. |
| [x] | Fixad nu | P3 | Metrics route token blind | U#65 | Fixad: 401 loggar token-miss utan att logga tokenvärdet; route hade redan rätt status. |
| [ ] | Öppen logg-städ | P3 | `console.info` hot paths brus | U#66 | EDGE (triage 2026-06-18): Bred logg-städ — "hot path" är en bedömning och `console.info`→debug-log-med-sampling spänner över många call-sites. Bör göras som en sammanhållen logg-pass med sampling-policy, inte spridda punktfix. Lämnas öppen. |
| [x] | Fixad nu | P3 | nanoid/Date fallback deploy-namn | U#69 | Fixad: `sanitizeVercelProjectName` fallback bytt från `sajtmaskin-${Date.now()}` (kolliderar inom samma ms) till `sajtmaskin-${randomUUID 8 hex}` — collision-safe. Regressionstest i `vercelDeploy.test.ts`. (Deployment-record-`id` använde redan `nanoid()` = collision-safe.) |
| [x] | Fixad i HEAD | P3 | `getExtension` default `.png` | U#70 | Avskriven/fixad: blob-service defaultar redan ogiltig/saknad extension till `.bin`, inte `.png`. |
| [x] | Inte bug / copy debt | P3 | Shadcn category emojis enterprise | U#74 | Inte bug; copy/brand-städ. |
| [x] | Fixad i HEAD | P3 | Template-search diakritik strip | U#75 | Avfärdad/redan hanterad: `normalizeForSearch` i `template-search.ts` gör NFD + strip av combining marks (`[\u0300-\u036f]`) på både query och haystack, så `Malmö`↔`malmo`/`café`↔`cafe` matchar redan. Unicode-aware folding finns. (Residual: shadcn `searchBlocks` använder bara `toLowerCase()` — separat komponent-sök, inte template-search.) |
| [ ] | Öppen preview-risk | P3 | `previewUrlHint` base path + chatId | U#77 | EDGE (triage 2026-06-18): Verifieringsrad — `previewUrlHint` byggs i `generation-stream-post-finalize.ts` och täcks redan av tester (`generation-stream-post-finalize.test.ts`, `stream-handlers.test.ts`). Full verifiering kräver jämförelse mot live preview-host (ej tillgänglig i triage-VM). Lämnas öppen. |
| [x] | Inte bug / ej bekräftad | P3 | SSE ping `Date.now` var 15s loggar | U#78 | Avskriven: backend skickar ping med timestamp men grep visar ingen `console.*`-logg kopplad till SSE-pingen. |

## Grandmaster-arkivering 2026-06-22 — överförda öppna spår

Grandmaster-stabiliseringsplanen arkiverades till `docs/plans/avklarat/grandmaster/` (scope 100 % klart). Den parallella bugg-letar-agenten är avvecklad. Dess **öppna** spår flyttas hit så denna fil förblir **enda backlog-/buggsanningen**. Historik-källor: `docs/plans/avklarat/grandmaster/_backlog-deferrad.md`, `.../bug-swarm-koppling.md`, `docs/plans/avklarat/bug-swarm/README.md`, `docs/handoffs/2026-06-21-grandmaster-closing-handoff.md`.

### Bugg-agentens öppna bana (orphan — agenten avvecklad, ägs nu här)

| Klar | Prio | Fynd | Källa | Kod-ankare / minsta åtgärd |
| --- | --- | --- | --- | --- |
| [ ] | P1 | B01-klient: vit/blank iframe — `fetchPreviewHostStatus` versionId-blind polling (re-pin saknas) | B01 | `preview-host-client.ts:134` kollar bara `running`, aldrig `versionId`; polling i `useBuilderVmPreview.ts:204-246`. Server skickar redan `versionId`. **Kräver live-verifiering mot preview-host (separat repo).** branch `fix/preview-version-mismatch-polling` |
| [ ] | P2 | B12: F3 auto-kick `onF3Ready` kringgår stale-base-409-gaten | B12 | `chat-message-stream-post.ts:361-388` + `PreviewPanelF3Trigger.tsx:138-199` + `useSendMessage.ts:261-281`. Servergate: jämför `parentVersionId` mot preferred F2-version → 409. branch `fix/f3-stale-base-gate` |
| [ ] | P2 | B13: clear-redesign delta-brief tappas vid contract-gate-retry (tur 2) | B13 | `chat-message-stream-post.ts:416-422,492-551` + `follow-up-orchestration-input.ts:85-87`. Persistera delta-brief i chat-meta vid contract-gate, återläs tur 2. branch `fix/clear-redesign-contract-gate-retry` |

### Deferrad härdning / arkitektur (ej buggar — medvetet uppskjutet, kräver scope/beslut)

| Klar | Allvar | Post | Vad | Beslut / blockare |
| --- | --- | --- | --- | --- |
| [ ] | Medel–hög (korrekthet) | B3 / E2 | Event-bus in-memory/efemär → multi-instans kan splittra status/finalize | **Enda kvarvarande korrekthetsrisken.** Ofarlig på single-instance Render; risk på serverless/multi-instans. Deploy-topologi-beslut, ej cleanup-PR. |
| [ ] | Låg–medel | B1 | S3 single-writer-status warn-only-lane → blockerande `test:ci` | Lane-arkitekturbeslut (bryter "hela stability-lanen är warn-only"). Testet är deterministiskt → flyttbart men kräver rename/include-undantag. |
| [ ] | Låg (hygien) | B4 | Canvas auto-PR via `GITHUB_TOKEN` → ingen CI på den PR:en | Dedikerad `CANVAS_PR_TOKEN` (secret-beslut, protected path `.github/workflows/**`). Artefakten är `.txt` → minimal risk. |
| [ ] | — | F4 / F5 | Odefinierade bus-emits / manifest `perTier*`-Zod-validering | Se closing-handoff Appendix C. |
| [ ] | Hög (säkerhet) | B7 / #140 | DB+Blob-gate-PR bot-fynd: Codex P1 (PR-kontrollerad kod kör med prod-Postgres/Blob-secrets på `pull_request`) + Bugbot High (EMPTY-check ignorerar failed counts → kan PASS:a tom tabell) | Annans infra-spår; lever i öppen PR #140. |

### Appendix A — dina policybeslut (systemet funkar som det är)

| Post | Vad | Status |
| --- | --- | --- |
| B05 / A7-2 | `refuseDossierStubs` kod-default OFF (env redan satt i Vercel; env-doc finns i `docs/ENV.md`) | Ditt beslut: flippa kod-default eller ej. |
| B07 | publik vs privat media | Du valde **öppet**; säkerhet som eget senare pass. |
| B08 | quality-gate fail-open | Du valde **släpp igenom**; felet loggas redan (DB-oberoende `console.warn`). |

### Observationer (repo-städ-pass 2026-06-22)

| Klar | Prio | Fynd | Beslut |
| --- | --- | --- | --- |
| [ ] | Låg | `error_log_events` (Postgres RAG-historik) är append-only **utan auto-gallring** — enda obegränsade DB-tillväxten (läses bara senaste ~5000 rader vid TF-IDF-reindex; `engine_version_error_logs`/`generation_telemetry` CASCADE-raderas med chat/version) | Gallrings-/TTL-policy som eget scope:at pass; härdning utanför stabiliseringsfasen. |
| [ ] | Låg | Test-läckage: route-/golden-tester med versionId `ver_1`/`ver_golden_1`/`ver_test_1` får event-bus `emit()` att skriva `data/runs/<id>/` mot riktig `cwd` i st.f. temp-dir | Lokal-only (gitignorad), ingen runtime-effekt. Test-hygien: isolera event-bus-`cwd` i berörda tester (bred → eget test-pass). |
| [ ] | Låg | `config/dashboard/` namnskuld (`dashboard/` är legacy-namn men **load-bearing**: backoffice + canvas-script + paritetstest läser `domain-map.json`) | Samma spår som U#63; bred ref-diff + paritetstest-omskrivning → eget pass, ingen quick-win. |
| [x] | P3 (data-hygien) | **`company_profiles` orphan vid projekt-radering** — FIXAD #190 (alt b): `deleteProject()` raderar nu `company_profiles` explicit i transaktionen (`tx.delete(companyProfiles)`) och kod-kommentaren är rättad (ingen FK CASCADE finns). FK-migration (alt a, `ON DELETE CASCADE`) ej gjord — kräver prod-orphan-audit först; `cleanup-test-projects.mjs`-kommentaren kvarstår som städpunkt. | Fixad #190; se "Post-review-svärm (#196–#203)"-sektionen ovan. |
