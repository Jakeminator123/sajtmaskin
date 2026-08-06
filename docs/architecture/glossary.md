# Glossary — Sajtmaskin

Kort ordlista för termer som lätt blandas ihop. Bara begrepp som återkommer i flera docs/kodytor hör hemma här.

## Kärntermer

| Term | Kort |
|---|---|
| own-engine | Sajtmaskins egna codegen-flöde för buildern. |
| Init | Första riktiga genereringen i en chat. Väljer grund. |
| Byggval | Init-reglagen i preview-panelens välkomstläge (typ av sajt, antal sidor max 3, komplexitet, stil, ton, tema, färgläge). UI-copy på svenska; kodidentifierare engelska (`InitBuildChoices`, `PreviewPanelInitControls`). Helt strukturerad wiring — skriver ALDRIG i chattens input: sajttyp → `meta.scaffoldMode/scaffoldId`, sidantal → `meta.pageCountHint` (route-planen föredrar den framför sidantal-regexen), stil/färgläge → `meta.styleKeywordsHint` (variantmatchning), komplexitet → `meta.complexityHint` in i `deriveBuildSpec` (`complex` golvar qualityTarget på premium + heavy context-bias; `simple` bias:ar lättare, demotar aldrig) + sektionsdirektiv, färgläge/ton → svenska direktiv i custom-instructions-kanalen (`body.system`), tema → befintliga `designTheme`/`themeColors` (flyttad från Avancerat 2026-07-31). Init-only — follow-ups fryser scaffold/variant/routes som vanligt. Ingen global hård sidgräns på servern (medvetet: explicit prompt-text respekteras). |
| Follow-up | Delta på befintlig version. Ska bevara grund om inte användaren ändrar den. |
| Deep Brief | Init-brief: strukturerad sajtbrief före orkestrering. |
| Snapshot-Brief | Kompakt follow-up-brief från tidigare orchestration snapshot. |
| Scaffold | Runtime-startpunkt för projektet. |
| Scaffold Variant | Visuellt uttryck inom scaffold: typografi, theme, motif, prompt hints. |
| Variant-Lock | Follow-up återanvänder tidigare variant för att undvika design drift. |
| Capability | Intentnyckel ("funktion") som mappas till dossier, t.ex. `auth`, `payments`, `map-display`, `site-search`. Styr selektionen — förväxla inte med Dossier-grupp, som bara är en UI-rubrik ovanpå capability. En capability täcker BÅDA klasserna: den kan ha en fristående (soft) default och kopplade (hard) leverantörssyskon. Sedan 2026-07-22 finns EN auth-capability (`auth`; clerk-auth default, supabase-auth leverantörssyskon — legacy-id:t `supabase-auth` alias-normaliseras med dossier-pin) och `command-search` heter `command-palette`. Parkerade sektions-capabilities (faq/pricing/testimonials/logo-cloud/stats/cta/feature-grid/stepper/marquee/parallax) är vanligt frihandsinnehåll, inte capabilities. |
| Capability source | Delad signal i init/follow-up: breda `InferredCapabilities` kompletteras med `detectFollowUpCapabilities` för named dossier-capabilities; båda når `requestedDossierCapabilities` före selection. |
| Dossier | En konkret, återanvändbar implementation av en capability: manifest + LLM-instruktioner + eventuella filer, dependencies, env-kontrakt och exports (`data/dossiers/{hard,soft}/`). **Capability är behovet; dossiern är byggblocket/provider-implementationen.** Inte en galleri-mall. UI-label: **Byggblock** — kodidentifierare och routes behåller `dossier`. `summarySv` är UI-copy; engelska `summary` äger prompten. |
| Kopplad / Fristående dossier | `hard` = **Kopplad**: beroende av en extern provider/tjänst eller dess runtime-kontrakt; kan ha nycklar, SDK och serverkod. `soft` = **Fristående**: fungerar i projektet utan extern provider/secret (npm-paket är tillåtna). Klassen säger inte ensam om F3 krävs. |
| Dossier-grupp | UI-/presentationskategori (10 st) som buckar dossiers per capability i backoffice och builderns Byggblock-panel, t.ex. "Betalning & handel", "Interaktivt & 3D". Kanonisk mappning i `src/lib/builder/dossier-groups.ts` (`resolveDossierGroup`). Styr **aldrig** selektion — rent presentations-lager ovanpå Capability, inget nytt manifestfält. En grupp har heller ingen **egen kod, demo eller data**: dess enda visuella innehåll är rubriken som raderna sorteras under (Byggblock-panelens båda flikar + backoffice-listans gruppvy). Demoläget hör till den valda leverantörsdossiern, aldrig till gruppen. |
| Kräver F3 (dossier) | Tredje, oberoende axeln: måste den riktiga integrationen byggas i ett eget steg ("Bygg integrationer")? Kanonisk källa är `dossierRequiresF3()` (`src/lib/gen/dossiers/types.ts`) — sann vid en `enforcement: "build"`-envVar **eller** en `role: "server"`-fil. Följer **inte** av Kopplad/Fristående eller av demoläget: en Kopplad dossier med bara `feature-runtime`-nycklar och klientfiler är klar redan i designläget. Visas som badge i Byggblock-panelen och som kolumn i backoffice-listan (Python-spegling `requires_f3`, paritetsgrindad). |
| Version-presence | Filbevis för dossiers: en dossier "finns i versionen" när dess server-filer (och minst en särskiljande fil) ligger i versionens `files_json` (`version-presence.ts`). Snapshot ∪ presence är den kanoniska "valda dossiers"-signalen för panel, readiness, finalize-design, F3-gate och deploy. |
| F3 capability-scope | F3-filter i orchestrate (`scopeF3DossierCapabilities`): bygget wirar bara capabilities från aktuellt meddelande ∪ godkända providers (durabelt via `f3ApprovedCapabilities` i snapshoten) ∪ filbevis. Golvet (can-only-grow) körs fortfarande — scopet FILTRERAR efteråt, enbart i F3. Spekulativa brief-/golv-capabilities droppas (`f3_capability_scope_dropped`). |
| Parkerad dossier-identitet | F2 sparar både `mutedCapabilities` (behovet) och `mutedDossierIds` (exakt provider-syskon, t.ex. `mongodb-atlas`). `Bygg integrationer` godkänner dessa identiteter durabelt innan F3, så ett generiskt knappmeddelande aldrig får byta MongoDB mot capabilityns standardval Postgres. |
| Capability removal | Explicit follow-up-signal för att ta bort ett befintligt Byggblock/integration. `removedCapabilities` överstyr can-only-grow, brief, filbevis och F3-godkännanden; `removedDossierIds` låter finalize radera manifestägda filer utan att ta shared paths som fortfarande ägs av aktiva Byggblock. |
| F3 build plan | Strukturerad `Tier3BuildSpec` för F3-codegen. Parent-versionens filhärledda readiness-spec är bas; planerade exakta dossier-id:n och explicit godkända providers läggs till eftersom de ännu saknar filbevis. Övriga `preGenerationContracts` används bara när filspec saknas eller är tom. |
| Mock mode (dossier) | Deklarativt `mock`-fält ("demoläge": `canned`/`seed`/`success`/`visual`/`none`) på hard-dossiers som beskriver hur den visuella ytan fungerar i F2/preview utan riktig nyckel. `visual` (nytt 2026-07-22): den interaktiva ytan renderas fullt ut och handlingen öppnar en ärlig demo-notis/modal — aldrig fejkade sessioner/debiteringar/transport (betalning, inloggning, prenumeration, realtid). Driver dossierns egen degraderingskod + en promptrad (`describeMockMode`). F2-only, aldrig persisterat/deployat. Utelämnat = `none`. Fallback-principen: demo-*mönstret* är gemensamt per capability, men runtime läser alltid den **valda** dossierns eget `mock`-fält — garantin gäller per dossier, inte bara defaulten. **CI-tvingat** (`dossiers:validate-all` via `findMissingMockFallbacks`): **varje** hard-dossier måste ha `mock ≠ none` (per-dossier sedan 2026-07-12), annars måste capabilityn stå på undantagslistan `MOCKLESS_CAPABILITY_EXCEPTIONS` (numera bara `analytics`). |
| Template (v0-mall) | Färdig v0-mall i galleriet (`/templates`, builderns Mallar-tab). "Templates" och "v0-mallar" är samma sak. Blob är enda källan i prod; importeras verbatim, ingen LLM vid init. Inte scaffold, inte dossier. |
| Variant-template-addendum | SHA-bunden, granskningsbar cache av de högst tre frontendutdrag som en vald Template kan ge own-engine som variantinspiration. `config/variant-template-addenda.json` används före ZIP-fallbacken; den godkänner inte i sig en template för urval. |
| Template-referens | Klonat upstream-repo under `data/template-references/` — input till **dossier**-kuration (AI-utkast), hör inte till template-galleriet trots namnet. |
| BuildSpec | Runtime-policy för generationens scope, kvalitet, preview, verifiering och budget. |
| Dynamic Context | Request-specifik promptdel. |
| Core Rules | Statiska produktregler i `config/prompt-core/`. |
| System Prompt | Core Rules + Dynamic Context. |
| F2 / fidelity2 | Design/preview-läge. |
| F3 / fidelity3 | Integration/build/deploybarhetsläge. Explicit steg. Om det finns en planerad men obyggd dossier som kräver F3 körs LLM och bygger den även när nycklarna är `feature-runtime`/`warn-only`. Bara när ingen integration återstår att bygga och inga build-krav kräver codegen skapas en exakt F2-fork och ReleaseGate körs utan LLM. |
| `setupUrl` / `sourceRepoUrl` | `envVars[].setupUrl` är användarhjälp: officiell provider-sida för att hämta just värdet. `sourceRepoUrl` är kurator-proveniens för dossierns källimplementation. En GitHub-länk till Clerk SDK:n ersätter alltså inte länken till Clerk-nycklarna. |
| Dossier-verifiering | `verificationStatus: "unverified"` betyder uttryckligen att `lastVerified` bara är import-/källdatum och **inte** acceptansbevis. `config/dossier-verification-policy.json` äger maxåldern (kortare för Kopplade/provider-beroende dossiers); `dossiers:check-freshness` blockerar unverified, stale, ogiltiga och framtida bevis i den dedikerade schemalagda underhållslanen. Status/datum får bara ändras efter checklistan i dossierkontraktet, inklusive verkligt provider-/webhookprov där det är relevant. |
| dossierEnvScope | Preflight-scope som gör både `env.example` och den pipeline-ägda `.env.local`-artefakten dossier-scopade: bara valda dossiers env-nycklar (+ relevanta projektlager i `env.example`) används i stället för hela placeholder-katalogen. Skickas alltid från `preflight-phase.ts`. |
| pipeline-authored `.env.local` | Placeholder-`.env.local` som Sajtmaskins scaffold-merge kan injicera i genererade projekt, identifierad via markörraden `PIPELINE_ENV_LOCAL_MARKER` (`env-local.ts`). Vid finalize är den scoped till valda Byggblock (och utelämnas när scopet saknar tillåtna placeholdervärden); äldre versioner kan ha hela katalogen. Räknas ALDRIG som modell-emitterat "generated"-lager, så pipelinevärden inte skuggar `projectEnvVars` i preview. |
| buildBlockingKeys | Env-nycklar vars dossier-`enforcement` är `build` och som saknar både riktigt värde och kataloggodkänd placeholder — den enda uppsättningen som hård-blockerar F3-publicering (deploy-409 / readiness). Efter #468 i praktiken bara `clerk-auth`s nycklar. `feature-runtime`/`warn-only`/placeholder blockerar aldrig. |
| Preview / VM / preview_host | Live-runtime för iteration. Inte samma sak som deploy. |
| Preview-förvärmning | Default-av latensoptimering som kan väcka preview-hosten och överlappa installationen med en ny chats första riktiga codegen. Skelettets `package.json` är scaffold-medveten: byggs från den redan orkestrerings-valda scaffoldens egna filer (samma `mergePackageJsonWithBaseline`/dep-completer-mekanism som finalize) i stället för den fasta baslinjen — högre chans att hostens dependency-fingerprint matchar och slipper ominstallation vid finalize; okänd scaffold-id faller tillbaka till baslinjen. En API-keyed aktiv-subject-lease begränsar arbete före kreditsettlement och behåller cooldown vid bootfel; skelettet är icke-publikt och riktig version måste passera readiness. Publicerar ingen preview-URL. Host måste deployas före app/aktivering. Kod: `preview-prewarm.ts`, `preview-host/src/prewarm-leases.js`; env: `SAJTMASKIN_PREVIEW_PREWARM`. |
| Normalize | Mekanisk kodstädning före LLM: URL-expansion, deterministiska fixers och diagnostikdriven import-repair. |
| RepairGate | Den enda LLM-repair-porten i finalize när Normalize och statiska kontroller lämnar residual. |
| RenderGate | F2-gate som bevisar att preview bootar/renderar; typecheck är Advisory utom render-risk-koder. |
| ReleaseGate | F3-gate för explicit integration/build/deploybarhet: lease-skyddad VM-kontroll i ordningen typecheck → build (lint togs bort ur den blockerande lanen 2026-07-22 — stilregler blockerade byggbara sajter). Env-krav täcks av placeholders (alltid tillåtna, demoläge); Product Postcheck-krav blockerar. Kör alltid på en `integrations`-version. |
| Advisory | Synlig varning/degradation som inte blockerar promote/preview. |
| Blocker | Fel som stoppar promote, preview eller F3-release tills det är åtgärdat. |
| CapabilitySmoke | Capability-specifik DOM/render-smoke, t.ex. F2-kontroll av navigation, CTA, formulär och runtime-krasch. |
| Safe/risky autofix | Riskklass för Normalize-fixar: `safe` = smal hygienfix, `risky` = struktur-, cross-file-, dependency- eller LLM-mutation som behåller verifier-behov. |
| Finalize | Steget som gör LLM-output körbar, reparerad, verifierbar och sparbar. |
| Preflight | Teknisk kontroll före preview/persist/promote. |
| EngineEvent | Append-only runtime-händelse för versionens livscykel. |
| VersionStatus | UI-/API-projektion av EngineEvents och terminal DB-state. |
| Superseded ("Ersatt") | Terminal-neutralt `verification_state` (2026-07): en nyare version tog över medan denna verifierades. Aldrig rött `failed`, startar aldrig repair, väljs aldrig som preferred; F2 förblir deploybar, F3 kräver fortfarande grön ReleaseGate. |
| Fast Edit Lane | Exakt deterministisk filändring utan LLM, sparad som minor-version. |
| Minor-version | Quick-edit-version under en major, t.ex. `v3.1`. |
| False-green | Systemet visar grönt trots blocker/degradation. Ska undvikas. |
| Innehållsrevision (`files_revision`) | Innehållsidentiteten för en `engine_versions`-rad: DB-genererad `md5(files_json)`. `versionId` räcker inte — samma rad skrivs om av user-edit, server-repair och autofix. Ett verdikt/kvitto stämplas med den revision det bedömde (`generation_telemetry.files_revision`) och läsaren jämför: `current` = svar, `stale` = **känd mismatch** (behandlas som overifierat, blockerar retrybart), `unknown` = ingen revision att jämföra → fail-open, aldrig blockerande. Jämförelsen är flaggad (`SAJTMASKIN_CONTENT_REVISION_GATE`, default av). **Inte** samma sak som `hashFilesJson` (sha256), som äger repair-revisionsbindningen (`baseFilesHash`) — två mekanismer för två jobb, olika värden. Kod: `src/lib/gen/verify/content-revision.ts`. |
| Error-log RAG | TF-IDF-retriever över historiska fault/fix-events. Init och follow-up injicerar `### Lessons from similar past builds` i system-prompten via cosine similarity på term-frekvenser. **Inte** embeddings/pgvector. I prod är indexet cross-tenant (rå `faultText` redakteras i renderingen). Styrs av `FEATURES.useErrorLogRag` (`NODE_ENV !== 'test'`). |
| Internt `@sajtmaskin`-register | Sajtmaskins kuraterade, självbärande shadcn-kompatibla registry-källa. Serveras av appen från `/r/{name}.json`, refereras som `@sajtmaskin/<name>` och måste hålla posterna schema-valida med täckta `dependencies`/`registryDependencies`. |
| Registry Discovery | Läs-only sökning över shadcn-register (officiella + community) via HTTP (`registry-service`), inte program-API:t. Sökmotorn (deterministisk fuzzy-match) bor i `src/lib/shadcn/registry-search.ts` och delas av Beskriv-flödet och UI Recipe-resolvern (Fas 4: `resolveShadcnUiRecipes` söker registry-indexet i stället för hårdkodade kandidatlistor, flagga `SAJTMASKIN_SHADCN_RESOLVER_SEARCH`, default på, legacy-fallback vid indexfel). Skriver aldrig till användarsajten. |
| Beskriv-flöde | Fritext → LLM-genererade registry-sökfrågor → Registry Discovery → LLM-rankning av 5–10 **verkliga** träffar → kandidater (`{name, registry, description, previewLight/Dark, dependencies, registryDependencies, addCommand}`). Backend: `POST /api/shadcn/describe` (`src/lib/shadcn/describe.ts`); UI: "Beskriv"-fliken i insättningsytan (`PreviewPanelDescribeTab.tsx`), som öppnas med knappen **`Lägg till block`** i chatpanelens verktygsrad (`Stäng block` i öppet läge; ägarbeslut B3 2026-07-26 — den hette tidigare bara "+ Lägg till", vilket inte sa vad som lades till). Flagg-gated bakom `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE` (default av → 404 + platshållar-flik). LLM-stegen har deterministisk heuristik-fallback. Discovery skriver aldrig till användarsajten — insättning av vald kandidat går via insättnings-lane v1 (`src/lib/builder/shadcn-insert.ts`, promptSourceKind `shadcn-item`): kandidatens metadata + best-effort-hämtad registry-kod blir ett prompt-meddelande genom **befintliga** sendMessage/own-engine-vägen, så generering + verify (RenderGate) gör blocket funktionellt. Aldrig rå filpatch. |

## Publicering och URL-nivåer

| Term | Kort |
|---|---|
| `previewUrl` | Nivå 1: VM-/preview_host-länken ("Öppna" under bygge). Delbar via Publik preview, men aldrig "publicerad sajt". |
| `liveUrl` | Nivå 2: aktuell publik produktions-URL. Resolveras till verifierad `customDomain`, annars verifierad Sajtmaskin-standardadress, annars `providerUrl`. Samma sajt/projekt består när URL-nivån uppgraderas. |
| `customDomain` | Nivå 3: kundens verifierade egna domän, kopplad till samma hosting-projekt och vald som `liveUrl` när DNS/TLS är korrekt. |
| `providerUrl` | Teknisk hosting-URL (t.ex. `*.vercel.app`) för status, felsökning och rollback. Visas bara som `liveUrl` när ingen verifierad varumärkt/kundägd adress finns. |
| Publicera | Deploy av aktuell version till produktion (skapar/uppdaterar `liveUrl`). Inte GitHub, inte domänköp. |
| Domänkoppling | Koppla + verifiera en domän mot kundprojektets hosting. Skilj från domänköp, som sker hos extern leverantör (Loopia m.fl.). |
| GitHubExport | Valfri export av en versions filer till användarens GitHub-repo (user eller org). Power-user-flöde, inte en del av Publicera. |
| SEO (release) | Release-feature: deterministisk SEO-injektion vid publicering via `applySeoToProjectFiles` (robots, sitemap, opengraph, layout-metadata) + brief-guidning. Tillhör F3/publicera-livscykeln. **Inte** en dossier/capability-modul. |

## Kontrollbegrepp och kod-legacy

Kanoniska namn ovan styr docs och löptext. Kod-identifierare och telemetri-nycklar behåller legacy-namnen; mappa dem i text i stället för att döpa om dem.

| Kanoniskt | Betyder | Absorberar/mappas mot (kod-legacy, behålls i kod) |
|---|---|---|
| Normalize | Mekanisk kodstädning före LLM. | autofix, mekanisk autofix, url-expand, deterministisk import-repair |
| RepairGate | Enda LLM-repair-porten. | runLlmRepairGate/RepairLedger, LLM-fix, syntax-fixer, verifier-fixer, server-repair-LLM |
| RenderGate | F2: preview bootar/renderar; typecheck Advisory utom render-risk-koder. | quality gate (designPreview), preview-check |
| ReleaseGate | F3: typecheck → build, explicit; placeholders alltid OK för env (lint borttagen ur blockerande lane 2026-07-22). | quality gate (integrationsBuild), build gate, readiness |
| Advisory | Synligt men ej blockerande. | warning, soft fail, degraded/typecheck_advisory |
| Blocker | Stoppar promote/preview. | hard fail, blocking, preview-blocking |
| CapabilitySmoke | Capability-specifik DOM/render-smoke. | product postcheck |
| Defektsignatur | Stabil nyckel per **felklass** i `engine_version_error_logs`, skriven som `meta.defect.{kind,signature}` på den kanoniska skrivvägen. Två rader med samma signatur är samma fel även i olika chattar, vilket är det som gör "hur ofta händer det här" mätbart. Beskriver inte allvarlighet — vad som blockerar avgörs av gates. | `classifyVersionDefect`, `meta.defect` |

## Namnskuggor

| Säg inte bara | Skriv hellre |
|---|---|
| generatorn / v0-motorn | `own-engine` |
| brief | `Deep Brief` eller `Snapshot-Brief` |
| scaffold family / style direction | `Scaffold Variant` |
| kategori / grupp (om capability) | `Dossier-grupp` för UI-bucketen; `Capability` är det som styr selektionen |
| mock / mockup / fallback (om dossier-demo) | `Demoläge` (manifestfältet `mock`) |
| hård / mjuk dossier (i user-synlig copy) | `Kopplad` (hard) / `Fristående` (soft) |
| dossier (i user-synlig UI-copy) | `Byggblock` — kodidentifierare och routes behåller `dossier` |
| dashboard (om adminytan) | `backoffice/` eller `sajtmaskin_backoffice.py` |
| context | `Dynamic Context` när promptblocket avses |
| contracts | `Contract Plan` eller `Orchestration Contract` |
| quality gate | `RenderGate` för F2 eller `ReleaseGate` för F3 |
| autofix | `Normalize`; `RepairGate` när en LLM-repair avses |
| warning / soft fail / degraded | `Advisory` |
| blocking / hard fail | `Blocker` |
| product postcheck | `CapabilitySmoke` |
| sandbox | `preview`, `VM` eller `preview_host` |
| template-library | `Scaffold`, `Dossier` eller `Template (v0-mall)` beroende på kontext |
| mall / template (ospecificerat) | `Template (v0-mall)` för galleriet · `Scaffold` för runtime-startpunkt · `Dossier` för capability-modul · `Template-referens` för dossier-kurationsinput |
| shadcn | `shadcn primitive` eller `UI Recipe` |
| 3D/game | `visual-3d`, `physics-3d` eller `interactive-game` |
| preview (om Vercels deploy-previews) | `Vercel deploy-preview` — reservera "preview" för VM-previewn |
| publicerad | bara när `liveUrl` finns; en delad `previewUrl` är inte "publicerad" |
| Vercel i användar-copy | skriv leverantörsneutralt ("publicera", "hosting", "domän") — Sajtmaskin är varumärket; Vercel är infrastruktur |

## Legacy / undvik i ny text

| Undvik | Använd |
|---|---|
| AI Gateway | Direkt provider / modellregistry |
| prompt-static | `Core Rules` |
| tier 2 / tier 3 (om produktläge) | F2 (`fidelity2`) / F3 (`fidelity3`) |
| `command-search` | `command-palette` (capability-id sedan 2026-07-22) |
| `supabase-auth` som capability | `auth` — `supabase-auth` är dossier-/leverantörs-id under den |
| mallar / templates om runtime-startpunkter | `Scaffold` |
| "templates" om capability-moduler | `Dossier` — Template (v0-mall) är ett separat system |
| Vercel Sandbox som preview | VM / `preview_host` |
| `demoUrl` för own-engine preview | `previewUrl` |
| Spec-first-kedjan | Deep Brief + orchestration |
| Directive Cascade | Core Rules + Dynamic Context + signalägare |
| `serverVerify` som quality-gate-lane | `RenderGate` (`designPreview`) eller `ReleaseGate` (`integrationsBuild`) |

## Fas-skillnad

- **Init** = ny artifact graph. Full Deep Brief, scaffold/variant/dossier/route-plan från scratch.
- **Follow-up** = delta på existerande graph. Snapshot-Brief, fryst scaffold/variant/routes utom `clear-redesign`.
- **F2** = design/preview. **F3** = integrationer/build, explicit användarval.

## Agent- och modellplan

Fyra olika sorters "agent" och "modell" blandas lätt ihop:

| Aktör | Vad det är |
|---|---|
| Extern coach/LLM | Användarens externa ChatGPT/LLM-råd. Inte automatiskt en repo-aktör. |
| Cursor/IDE-agent | Bygger repot via `.cursor/**` + `Task`-subagenter. Modellnamn = Cursor-slug:ar. |
| GitHub/Vercel-botar | Codex-review, checks, Vercel deploy-preview. Codex-review ≠ Sajtmaskins `verifier`-fas; Vercel "Ready" = deploy-status, inte kodkvalitet. |
| Sajtmaskins produktmodeller | own-engine, prompt-assist, Deep Brief, verifier, embeddings. Styrs av `config/ai_models/manifest.json` + `src/lib/models/`; id-format `gpt-5.5`, `claude-opus-4.8`. |

Gissa aldrig slug, modell-id eller botstatus — fråga vid oklarhet. Användarens vardagsspråk ("agent", "modell", "review") är löst; tolka via kontext, lås inte ett casual ord till en exakt definition.

## Förvaltning av ordlistan

Den här filen är den enda kanoniska glossary-ytan. Den är en handskriven mental
modell, inte en alternativ runtime-implementation. Exakta enumvärden, owners och
policyfält ska fortsatt hämtas från kod, schemas, registries och genererade
referenser.

`config/naming-dictionary.json` är en liten maskinläsbar valideringsseed.
`npm run check:terms:contract` blockerar parallella glossary-paths, dubbla
termer och att kända legacyalias åter klassas som kanoniska. `npm run
check:terms` är rådgivande eftersom kodidentifierare och telemetrifält får
behålla dokumenterade legacy-namn.

Ändra en term i ordningen: faktisk owner och semantik → denna glossary →
dictionary-seed vid behov → agentregler och aktiva docs. Skapa inte ett andra
terminologiregistry för runtime.

**Signal-gate:** ny signal? Hitta canonical source först. Ändra ägaren, inte fem
konsumenter.

Kontrollbegreppen här styr hur agenter skriver i docs och PR-text. Befintliga
kodidentifierare, filnamn, telemetri-nycklar, event-typer, enum-värden och
DB-strängar behåller sina legacy-namn.
