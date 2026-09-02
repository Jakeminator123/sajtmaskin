# Glossary — Sajtmaskin

Kort semantik för återkommande termer som lätt blandas ihop. Slå upp en term
riktat; läs inte hela filen som generell startkontext.

## Så används ordlistan

Detta är den enda mänskliga semantikägaren. Exekverbart beteende ägs av
respektive kod, manifest eller policy. Aktuella inventarier finns i
`docs/generated/`; detaljerade körflöden finns i relevanta arkitekturdocs.

## Kärntermer

| Term | Kort |
|---|---|
| own-engine | Sajtmaskins egna codegen-flöde för buildern. |
| Init | Första riktiga genereringen i en chat; får välja projektets grund. |
| Byggval | Strukturerade init-reglage; hårda val vinner över promptens tolkning. |
| Follow-up | Delta på befintlig version. Ska bevara grund om inte användaren ändrar den. |
| Briefing | Lagret före kodgeneratorn; ett produktlager, inte en modell. |
| Deep Brief | LLM-läge i Briefing som strukturerar fritext före Orkestrering. |
| Snapshot-Brief | LLM-fri återanvändning av föregående orchestration-snapshot vid vanlig Follow-up. |
| Orkestrering | Deterministisk kod som väljer scaffold, ruttplan, kontrakt och BuildSpec; inte en modell eller agent. |
| Scaffold | Registrerad runtime-startpunkt: manifest + baseline-filer som registret kan välja. |
| Scaffold Variant | Visuellt uttryck **inom** en Scaffold (font, theme tokens, motif, prompt hints, `sourceTemplateIds`). |
| Variant-Lock | Follow-up återanvänder persisterad scaffold/variant mot design-drift. |
| `sourceTemplateIds` | Ordnad kandidatpool av riktiga v0-Blob-id:n på en variant. |
| Variant-template inspiration | Style-only lager ovanpå Scaffold + variant: stillbild + SHA-validerade addendum-utdrag. |
| Build profile | Produktprofil som resolvas till en default build-modell; aktuell lista ägs av modellmanifestet. |
| `phaseRouting` | Produktens modellval per runtimefas; ägs av `config/ai_models/manifest.json`. |
| Prompt-assist | Knappen bredvid **Plan** som förbättrar ett utkast i chattfältet; inte Deep Brief eller Orkestrering. |
| Klargörande frågor | Canned follow-up-frågor från `resolveFollowUpClarification` efter regex/keyword-klassning (`classifyFollowUpIntent`). |
| Capability | Intentnyckel för en förmåga, till exempel `auth`, `payments` eller `site-search`; capability styr valet, inte Dossier-gruppen. |
| Capability source | Delad signal i init/follow-up: breda `InferredCapabilities` kompletteras med `detectFollowUpCapabilities` för named dossier-capabilities; båda når `requestedDossierCapabilities` före selection. |
| Dossier | En konkret, återanvändbar implementation av en capability: manifest + LLM-instruktioner + eventuella filer, dependencies, env-kontrakt och exports (`data/dossiers/{hard,soft}/`). |
| Kopplad / Fristående dossier | **Kopplad** deklarerar extern provider-/runtimekoppling; **Fristående** gör det inte. Separat axel från om integrationsbygge krävs. |
| Dossier-grupp | UI-kategori för att presentera dossiers; den fattar inte capability- eller selection-beslut. |
| Kräver integrationsbygge (dossier) | Tredje, oberoende axeln: måste den riktiga integrationen byggas i ett eget steg ("Bygg integrationer")? |
| Version-presence | Filbevis för dossiers: en dossier "finns i versionen" när dess server-filer (och minst en särskiljande fil) ligger i versionens `files_json` (`version-presence.ts`). |
| F3 capability-scope | Filter i orchestrate (`scopeF3DossierCapabilities`): integrationsbygget wirar bara capabilities från aktuellt meddelande ∪ godkända providers (durabelt via `f3ApprovedCapabilities` i snapshoten) ∪ filbevis. |
| Parkerad dossier-identitet | Designläget sparar både behovet i `mutedCapabilities` och exakt provider-dossier i `mutedDossierIds` för senare integrationsbygge. |
| Capability removal | Explicit follow-up-signal för att ta bort ett befintligt Byggblock/integration. |
| F3 build plan | Strukturerad `Tier3BuildSpec` för integrations-codegen. |
| Mock mode (dossier) | Deklarativt `mock`-fält ("demoläge": `canned`/`seed`/`success`/`visual`/`none`) på hard-dossiers som beskriver hur den visuella ytan fungerar i designläge/preview utan livekonfiguration. |
| Template (v0-mall) | Färdigt helprojekt i galleriet (`/templates`, builderns Mallar-tab). |
| Importerat repo-läge | Runtimeläge för kompletta Template-/ZIP-/GitHub-importer; saknar Scaffold och är inte `Scaffold: Av`. |
| Variant-template-addendum | Intern teknisk term för den SHA-bundna cachen av en v0-template som redan kan vara kandidat via `sourceTemplateIds`. |
| Källpaket | Samlingen av valbara ingredienser före kodgeneratorn: variantreferens, UI Recipes, dossiers och media. |
| Template-referens | Klonat upstream-repo under `data/template-references/` — input till **dossier**-kuration (AI-utkast), hör inte till template-galleriet trots namnet. |
| BuildSpec | Runtime-policy för generationens scope, kvalitet, preview, verifiering och budget. |
| Dynamic Context | Request-specifik promptdel. |
| Core Rules | Statiska produktregler i `config/prompt-core/`. |
| System Prompt | Core Rules + Dynamic Context. |
| Designläge / designversion | Design- och previewläge; legacy-alias F2. |
| Integrationsbygge / integrationsversion | Explicit integration-, build- och deploybarhetsläge; legacy-alias F3. |
| `setupUrl` / `sourceRepoUrl` | `envVars[].setupUrl` är användarhjälp: officiell provider-sida för att hämta just värdet. `sourceRepoUrl` är kurator-proveniens för dossierns källimplementation, inte provider-setup. |
| Dossier-verifiering | `verificationStatus: "unverified"` betyder uttryckligen att `lastVerified` bara är import-/källdatum och **inte** acceptansbevis. |
| dossierEnvScope | Preflight-scope som begränsar `env.example` och pipeline-skapad `.env.local` till valda dossiers relevanta env-nycklar. |
| pipeline-authored `.env.local` | Placeholder-`.env.local` som Sajtmaskins scaffold-merge kan injicera i genererade projekt, identifierad via markörraden `PIPELINE_ENV_LOCAL_MARKER` (`env-local.ts`). |
| buildBlockingKeys | Dossiernycklar med `enforcement: "build"` som saknar både riktigt värde och godkänd placeholder; de blockerar integrationspublicering. |
| Preview / VM / preview_host | Live-runtime för **användarsajten** (preview-host). Inte samma sak som deploy, `preview`-grenen eller Preview-ytan. |
| Preview-yta / PreviewPanel | Builderns högra yta där användarsajten visas i en iframe (`PreviewPanel` / `PreviewPanelFrame`). Jakob kan säga «preview-ytan» eller «iframen». |
| preview-gren | Långlivad git-gren `preview` (samma namn Vercel redan trackar). Staging för **produkten** Sajtmaskin: `preview.sajtmaskin.se`. Inte användarsajter, inte Preview-ytan, inte trunk. BRA-restorepunkten hör i `archive/` eller `*BRA*`, inte här. Force-pusha den inte utan eget mandat. Promovera till `master` när något ska till produktion. |
| Preview-förvärmning | Default-av latensoptimering som kan väcka preview-hosten och överlappa installationen med en ny chats första riktiga codegen. |
| Normalize | Mekanisk kodstädning före LLM: URL-expansion, deterministiska fixers och diagnostikdriven import-repair. |
| RepairGate | Den enda LLM-repair-porten i finalize när Normalize och statiska kontroller lämnar residual. |
| Verifier | Produktens LLM-granskning efter codegen; inte en GitHub-/IDE-reviewbot. |
| RenderGate | Designlägets gate som bevisar att preview bootar/renderar; typecheck är Advisory utom render-risk-koder. |
| ReleaseGate | Integrationsbyggets gate för explicit integration, build och deploybarhet. |
| Advisory | Synlig varning/degradation som inte blockerar promote/preview. |
| Blocker | Fel som stoppar promote, preview eller integrationsrelease tills det är åtgärdat. |
| CapabilitySmoke | Capability-specifik DOM-/renderkontroll, exempelvis för navigation, CTA, formulär eller runtimekrasch. |
| Defektsignatur | Stabil nyckel per felklass i `engine_version_error_logs`, skriven som `meta.defect.{kind,signature}`. |
| Safe/risky autofix | Riskklass för Normalize-fixar: `safe` = smal hygienfix, `risky` = struktur-, cross-file-, dependency- eller LLM-mutation som behåller verifier-behov. |
| Finalize | Steget som gör LLM-output körbar, reparerad, verifierbar och sparbar. |
| Preflight | Teknisk kontroll före preview/persist/promote. |
| EngineEvent | Append-only runtime-händelse för versionens livscykel. |
| VersionStatus | UI-/API-projektion av EngineEvents och terminal DB-state. |
| Superseded ("Ersatt") | Terminal-neutralt `verification_state`: en nyare version tog över medan denna verifierades. |
| Fast Edit Lane | Exakt deterministisk filändring utan LLM, sparad som minor-version. |
| Minor-version | Quick-edit-version under en major, exempelvis `v3.1`. |
| Sajtagenten / OpenClaw | Sajtagenten är den användarsynliga assistenten i chatten; OpenClaw är agentplattformen bakom (egen gateway-tjänst på Render, `infra/openclaw/`). |
| Extra befogenheter (OpenClaw) | UI-opt-in ovanpå env-grinden `OC_EDIT`: sköldknapp i Sajtagenten-chatten + vald befogenhet (`armed_autonomy` / `quick_edit`) krävs innan något utöver guide-beteendet händer. |
| Armerad autonomi | OpenClaw-läge där Sajtagenten efter uttrycklig armering får skicka ett begränsat antal follow-ups genom den ordinarie pipelinevägen. |
| Snabbändring (OpenClaw) | OpenClaw-befogenhet: `apply_quick_edit`-förslag med exakta filoperationer som körs genom Fast Edit Lane till en minor-version efter manuellt godkännande per förslag. |
| False-green | Systemet visar grönt trots blocker/degradation. |
| Innehållsrevision (`files_revision`) | Innehållsidentiteten för en `engine_versions`-rad: DB-genererad `md5(files_json)`. |
| Error-log RAG | TF-IDF-retriever över historiska fault/fix-events. |
| Internt `@sajtmaskin`-register | Sajtmaskins kuraterade, självbärande shadcn-kompatibla registry-källa. |
| Registry Discovery | Läs-only sökning över shadcn-register (officiella + community) via HTTP (`registry-service`), inte program-API:t. |
| Beskriv-flöde | Fritext blir registry-sökfrågor, verkliga Registry Discovery-träffar, LLM-rankning och valbara kandidater; modellen får inte hitta på registry-poster. |
| Scout (agentroll) | Opt-in: läser och föreslår. Gäller bara när Jakob nämner rollen. |
| Builder (agentroll) | Opt-in: skriver och lämnar PR. Inte default. |
| Steward (agentroll) | Opt-in: landar redo PR:er och städar (`tidy`). |

## Auktoritetsordning

1. uttryckliga användarkrav och låsta byggval,
2. scaffold, befintliga filer, rutter, kontrakt och protected paths,
3. Briefing,
4. Scaffold Variant och övriga valbara Källpaket,
5. Core Rules-defaults,
6. modellens komplettering inom ovanstående ramar.

## Publicering och URL-nivåer

| Term | Kort |
|---|---|
| `previewUrl` | Nivå 1: VM-/preview_host-länken ("Öppna" under bygge). Inte `preview.sajtmaskin.se`. |
| `preview.sajtmaskin.se` | Stabil Vercel-URL för git-grenen `preview`. Produktens egen staging, inte en användarsajt. |
| Vercel deploy-preview | Tillfällig `*.vercel.app`-deploy av en feature-PR eller annan oassignad branch. Inte `preview`-grenen och inte Preview-ytan. |
| `liveUrl` | Nivå 2: aktuell publik produktions-URL. |
| `customDomain` | Nivå 3: kundens verifierade egna domän, kopplad till samma hosting-projekt och vald som `liveUrl` när DNS/TLS är korrekt. |
| `providerUrl` | Teknisk hosting-URL (t.ex. `*.vercel.app`) för status, felsökning och rollback. |
| Publicera | Deploy av aktuell version till produktion (skapar/uppdaterar `liveUrl`). |
| Domänkoppling | Koppla + verifiera en domän mot kundprojektets hosting. |
| GitHubExport | Valfri export av en versions filer till användarens GitHub-repo (user eller org). |
| SEO (release) | Valfri release-feature: granskning och deterministisk SEO-injektion vid publicering via `applySeoToProjectFiles` när **Optimera för Google** är på. |

## Byggval: reglage → signal → mottagare

Semantiken för **Byggval** finns i raden ovan. Exakta fält och mottagare ska
läsas från `PreviewPanelInitControls`, request-meta och deras runtimekonsumenter;
ordlistan speglar inte den föränderliga matrisen.

### Färg och theme tokens (1:1 kod ↔ svenska)

Kodfält och paletter ägs av `src/lib/builder/theme-presets.ts` och
variantens `themeTokens`. Använd UI-etiketterna i buildern; döp inte om
persisterade token- eller kluster-id:n utifrån ordlistan.

## Aktuella runtime-kataloger — läs genererat

| Fråga | Läs här |
|---|---|
| Scaffolds | `docs/generated/scaffolds.generated.md` |
| Scaffold Variants | `docs/generated/variants.generated.md` |
| Produktmodeller/profiler | `docs/generated/models.generated.md` |
| Dossiers/Capabilities | `docs/generated/dossiers.generated.md` och `capabilities.generated.md` |
| Dossierrelationer | Backoffice **Systemkarta** |

## Namnskuggor och legacy

| Undvik eller precisera | Använd |
|---|---|
| generatorn / v0-motorn | `own-engine` |
| brief / AI-brief / strukturerad brief | `Briefing` för lagret; `Deep Brief` (LLM-steg) eller `Snapshot-Brief` (ingen LLM) för läget |
| Ändringsbrief | Deep Brief som delta vid `clear-redesign` — inte Snapshot-Brief. |
| saknad brief / ingen brief (om uppföljning) | Snapshot-Brief; LLM-delta bara vid `clear-redesign` |
| `StructuredBrief` | `Deep Brief`; kodschemat heter `siteBriefSchema` |
| scaffold family | `Scaffold Variant` |
| kategori / grupp (om capability) | `Dossier-grupp` för UI-bucketen; `Capability` är det som styr selektionen |
| mock / mockup / fallback (om dossier-demo) | `Demoläge` (manifestfältet `mock`) |
| hård / mjuk dossier (i user-synlig copy) | `Kopplad` (hard) / `Fristående` (soft) |
| dossier (i user-synlig UI-copy) | `Byggblock` — kodidentifierare och routes behåller `dossier` |
| dashboard (om adminytan) | `backoffice/` eller `sajtmaskin_backoffice.py` |
| context | `Dynamic Context` när promptblocket avses |
| contracts | `Contract Plan` eller `Orchestration Contract` |
| quality gate | `RenderGate` för designläge eller `ReleaseGate` för integrationsbygge |
| autofix / mekanisk autofix | `Normalize` |
| LLM-fix / syntax-fixer / verifier-fixer | `RepairGate` |
| warning / soft fail / degraded | `Advisory` |
| blocking / hard fail | `Blocker` |
| product postcheck | `CapabilitySmoke` |
| sandbox | `preview_host` när VM:en avses; inte preview-grenen och inte Preview-ytan |
| template-library | `Scaffold`, `Dossier` eller `Template (v0-mall)` beroende på kontext |
| mall / template (ospecificerat) | `Template (v0-mall)` för galleriet · `Scaffold` för runtime-startpunkt · `Dossier` för capability-modul · `Template-referens` för dossier-kurationsinput |
| shadcn | `shadcn primitive` eller `UI Recipe` |
| 3D/game | `visual-3d`, `physics-3d` eller `interactive-game` |
| preview (ospecificerat) | Fråga eller slå upp: `preview-gren`, `Preview-yta`, `preview_host`/`previewUrl`, eller `Vercel deploy-preview` |
| preview (om builder-iframe) | `Preview-yta` (`PreviewPanel`) |
| preview (om preview.sajtmaskin.se eller staging) | `preview-gren` |
| preview (om Vercels PR-deploys) | `Vercel deploy-preview` |
| iframe (om builder-previewn) | `Preview-yta` |
| publicerad | bara när `liveUrl` finns; en delad `previewUrl` är inte "publicerad" |
| Vercel i användar-copy | skriv leverantörsneutralt ("publicera", "hosting", "domän") — Sajtmaskin är varumärket; Vercel är infrastruktur |
| AI Gateway | Direkt provider / modellregistry |
| prompt-static | `Core Rules` |
| F2 / F3 (om produktläge) | designläge / designversion (`fidelity2`) · integrationsbygge / integrationsversion (`fidelity3`) — F2/F3 är legacy-alias, inte användarord |
| tier 2 / tier 3 (om produktläge) | designläge / designversion (`fidelity2`) · integrationsbygge / integrationsversion (`fidelity3`) |
| `command-search` | `command-palette` (capability-id sedan 2026-07-22) |
| `supabase-auth` som capability | `auth` — `supabase-auth` är dossier-/leverantörs-id under den |
| mallar / templates om runtime-startpunkter | `Scaffold` |
| "templates" om capability-moduler | `Dossier` — Template (v0-mall) är ett separat system |
| Vercel Sandbox som preview | VM / `preview_host` |
| `demoUrl` för own-engine preview | `previewUrl` |
| Spec-first-kedjan | Deep Brief + orchestration |
| Directive Cascade | Core Rules + Dynamic Context + signalägare |
| `serverVerify` som quality-gate-lane | `RenderGate` (`designPreview`) eller `ReleaseGate` (`integrationsBuild`) |
| orkestrator / orkestreringsagent | `Orkestrering` — deterministisk kod, inte en modell |
| Assist Model / assist-modell / `promptAssistModel` | Deep Brief-modellrutt (`briefing.defaults.assist`, `SAJTMASKIN_ASSIST_MODEL`). |
| Prompt-assist som Deep Brief / brief-lane / «Assist aktiv» | `Deep Brief` för LLM-steget, `Briefing` för lagret. |
| `SAJTMASKIN_ASSIST_MODEL` som knappens modell | **Fel variabel.** Den styr **Deep Brief** (`briefing.defaults.assist`). |
| Briefing-lagret som «halvfärdigt» / `promptAssist` som toppnyckel | Funktionen är komplett. Manifestets enda toppnyckel för lagret är `briefing`. |
| Polish / Skriv om / Förbättra / prompt rewrite | Död väg (borttagen 2026-04-21). Inte samma sak som `Prompt-assist` (2026-08-19): den rättar utkastet i rutan och behåller naturligt språk. |
| `deploy-assistant` som aktiv fas | Konfigurerad i `phaseRouting` och ModelTraceOverlay; ingen runtime-anropare |
| `Scaffold: Av` / scaffold off | `ScaffoldMode: "off"` → `projekt-bas-app` i vanlig own-engine-init; **inte** scaffold-löst Importerat repo-läge |
| syntetisk scaffold | Undvik som nulägesbegrepp. `projekt-bas-app` är en riktig registrerad Scaffold; variant-template inspiration är ett separat inspirationslager |
| addendum (ospecificerat) | `Källpaket` för samlingen av valbara ingredienser; `Variant-template-addendum` när `config/variant-template-addenda.json` avses |
| variant template / template snapshot | Precisera till `sourceTemplateIds`, `Variant-template inspiration` eller `Template (v0-mall)` beroende på om kandidatpool, inspiration eller helprojekt avses |
| modell (ospecificerat) | Precisera `Sajtmaskins produktmodell`, `Cursor/IDE-modell` eller `Codex agentprofil`; de delar inte automatiskt modell-id eller routing |
| fast (som aktuell build profile) | `premium`; `fast` får bara förekomma som dokumenterat legacy-/persistensalias. |
| `hasRealBuildIntegrations` som "har externa integrationer" | Kostnadssignal: `true` = «Bygg integrationer» tar LLM-vägen (planerad dossier saknas i versionen, eller integrationen har ett verkligt buildkrav). |
| `previewPending` som previewstatus | `/preview-status` äger previewstatusen. |
| `canPin` som versionsegenskap | Legacy v0-fält. Own-engine-versioner har `canPin: false` och pin-försök svarar 409 |
| `self-contained` som "fungerar utan externa tjänster" | «Inget separat integrationsbygge krävs». |
| `filesRevision` som versionsidentitet | `versionId` = radens identitet, `filesRevision` = innehållets. |
| Stewart / stewart | `Steward` (agentroll) |
| Herde / mergare / merge-agent | `Steward` (agentroll) |
| Explore-agent | `Scout` (agentroll) |
| Builder-agent / författare (PR-agent) | `Builder` (agentroll) — inte produktens Builder-UI |

## Agent- och modellplan

- **Cursor/IDE-agent:** arbetar i repot; regler i `.cursor/rules/`, skills i
  `.agents/skills/`.
- **Codex repo-agent:** arbetar i repot och läser `AGENTS.md` samt `.codex/`.
- **GitHub/Vercel-bot:** review- eller deploysignal, inte produktens Verifier.
- **Sajtmaskins produktmodell:** runtimeval i `config/ai_models/manifest.json`.
- **Extern coach/LLM:** har bara den kontext användaren uttryckligen ger den.

Dessa modellplan delar inte automatiskt sluggar eller routing.

## Förvaltning av ordlistan

Ändra termens korta semantik här och beteendet hos dess faktiska runtime-owner.
Struktur och ägarskap valideras av `npm run check:terms:contract`. Historiska
formuleringar finns i git; skapa inte parallella backupordlistor.
