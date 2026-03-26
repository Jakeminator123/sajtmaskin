# External review remediation — progress

Source material: `.j_to_agent/1.txt` (landing + integrationer), `2.txt` (own-engine pack), `3.txt` (scaffolds, scripts, orchestrator). **Agent-uppdelning (W1–W5, historik):** [stub](./orchestrator-workloads-external-review.md) → [full snapshot](../avklarat/orchestrator-workloads-external-review.md).

**Genomförande (historik):** fullständig execution-mapp → [`docs/plans/avklarat/external-review-execution/`](../avklarat/external-review-execution/) (MASTER-ROADMAP, CONTINUATION, track-filer). Kort stub → [`external-review-execution/README.md`](./external-review-execution/README.md).

**Vad du ska följa i praktiken:** execution-lagret ovan + denna fil (%, Done, commit-rutin) och vid behov [kritik-consolidated-open-items.md](./kritik-consolidated-open-items.md). **`1.txt`–`3.txt`** under `.j_to_agent/` är **grundmaterialet för granskningen** (vad som en gång granskats och vilka spår det skapat). De är **inte** en automatisk backlog-radlista — operativ prioritering och “vad som är klart” styrs av denna fil + [execution README](../avklarat/external-review-execution/README.md) § *Dokumenthierarki*. § *Kartläggning* nedan kopplar teman till `1.txt`/`2.txt`/`3.txt`.

**Kritikindex (parallell granskning):** [KRITIK-OVERVIEW.md](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md) · åtgärdade kritik-snapshots: [kritik-addressed/](../../../.j_to_agent/archive/kritik-addressed/README.md). *Separat agent kan samtidigt åtgärda kritikfiler och arkivera till `.j_to_agent/archive/` — undvik att samma session ändrar både `src/`‑remediation och kritikmappen utan koordinering.*

**Commit-uppföljning (second opinion):** [reviews/README.md](./reviews/README.md) — t.ex. arkiverad genomgång av orchestrator-commits efter brytpunkt `39fef25e` ([detaljer](../avklarat/orchestrator-followup-from-39fef25e.md)).

Last code touch: **Orchestrator-run `2026-03-27-k018-master-backlog` (2026-03-26)** — K-018 Fas 2: `sandbox-session-store` + `touchSandboxSession` vid lyckad `startSandboxPreview` (`chatId`); Vitest store. K-019 delmoment: `AgentLogCard` hopfälld som standard; plan `queue/PLAN-K019-PROMPT-SNAPSHOT.md`. Nya scope-/spike-planer: `PLAN-K007-K009-SCOPE.md`, `PLAN-K018-FAS3-INTEGRATION-SPIKE.md`. **Tidigare K-018:** efter `.env.local`-merge: **`npm run build`** i sandbox (`verifyBuild`, `startSandboxPreview`), SSE `prodBuildVerified` + `PreviewPanel`. **Orchestrator-run — remediation exit** — [`REMEDIATION-EXIT.md`](../avklarat/external-review-execution/REMEDIATION-EXIT.md). **valfri** deploy-smoke: [`e2e/README.md`](../../../e2e/README.md) § *TL;DR*. **K-007 / K-018 / K-009 / K-019** öppna (K-019 snapshot kvar); **K-014 [x]**, **K-008 [x]**.

**Tidigare batch:** Tailwind v4 `bg-linear-to-*` (Lanyard + BudgetEstimate); tidigare Lanyard/ParticleOrb/HowItWorks.

**Tidigare (längre bak):** sitemap-regressionstest; K-008 blogg + `e2e/README`; orchestrator-hygien; K-014/K-007 delmoment; K-016 stängd.

**Final sweep / handoff (2026-03-28):** `npm run typecheck` och `npx vitest run` (88 filer, **387** tester) ska vara gröna efter varje kodbatch. Valfritt: `npm run test:deploy-smoke:e2e` (skippas utan env). Otrackade kataloger som `data/`, `logs/`, `.cursor/orchestrator/archive/` lämnas utanför commit (se `.gitignore` + [`docs/architecture/repo-hygiene.md`](../architecture/repo-hygiene.md) § *Git versus Cursor*). **Handoff efter remediation-exit:** [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md) + [kritik-consolidated-open-items.md](./kritik-consolidated-open-items.md) för produktbacklog.

**Siffror (snabb):** **100%** *whole vision* = **remediation execution complete** (se [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md)). Segment-% (integration ~83%, own-engine ~81%, landning ~96%) beskriver **kvarvarande produkt/scope**, inte ofärdiga W-spår.

## Kartläggning mot källfiler (1.txt, 2.txt, 3.txt)

Extern granskning och remediation spårades ursprungligen mot tre exportfiler under `.j_to_agent/`. Procentsiffrorna är **bedömningar** (inte matematik): de ska hjälpa prioritering, inte ersätta `git log` eller faktisk scope-lista.

| Källa | Vad den i praktiken driver | Ungefärlig *done* | Kvar (typiskt) |
|--------|----------------------------|-------------------|----------------|
| **`1.txt`** — del A | **Landning** (hero, bakgrund, prestanda/copy, footer, tech stack vs verklighet) | **~96%** | **K-008 [x]** 2026-03-25 (landning fryst); **K-018** = användar-preview/`iframe`; K-016 stängd; K-014 stängd |
| **`1.txt`** — del B | **Integrationer + runtime-flöde** (registry, detektion, manifest, env, lansering, deploy-API) | **~83%** | HTTP-e2e runt deploy (auth); K-007 produkt (`deploy-precheck.md` § framtida); `e2e/README` + Vitest-kontrakt; fler providers vid nytta |
| **`2.txt`** | **Own-engine** (stream-routes tunna, session, finalize, golden tests, v0-gräns, **fas→modell** `B3-02`) | **~81%** | SSE/own-engine **utanför** avslutad W3-track (`K-009`), produktbeslut |
| **`3.txt`** | **Scaffolds/scripts/orchestrator-doc**, terminologi, **buglista del 3** (`B3-*`) | **~100%** | Underhåll vid **ny** extern granskning av `3.txt`; inga öppna B3-punkter |

**Whole vision (100% remediation-exit)** markerar att **W1–W5 execution** är levererad (se [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md)). Segment-raderna är **inte** medelvärde av samma sak — integration/own-engine kan ligga lägre i % medan remediation-spåret ändå är **stängt** tills ny extern våg.

*Jämförelse mot gamla antaganden:* `3.txt` nämnde att `phase-routing.ts` bara var “förberedelse” — **det stämmer inte längre**; **B3-02** ger riktig fasmodell för OpenAI-profiler (`pro`/`max`/`codex`). Uppdatera mentalt modellen där.

*Whole vision 100% (efter 2026-03-28):* avser **remediation-exit** enligt [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md), inte att alla framtida produktönskemål är levererade.

## Snabb ingång för nya agenter (remediation)

1. **Kanonsanning för % och kvar:** denna fil — § *Overall fill*, § *Kartläggning*, § *Återstår*, *Last code touch*, *Done*, commit-rutin; efter exit [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md) + samlad backlog **[REMAINING-WORK.md](./REMAINING-WORK.md)**.
2. **Hur batchar körs:** [CONTINUATION.md](../avklarat/external-review-execution/CONTINUATION.md) (halt, verifiering före commit).
3. **Spår och parallellisering:** [MASTER-ROADMAP.md](../avklarat/external-review-execution/MASTER-ROADMAP.md) + tabell *Orchestrator / verifiering*.
4. **W1–W5 (historisk snapshot):** [orchestrator-workloads-external-review.md](./orchestrator-workloads-external-review.md) → arkiv; **vad som gäller nu:** [REMAINING-WORK.md](./REMAINING-WORK.md).
5. **Öppna K-/C-rader (kompletterar %):** [kritik-consolidated-open-items.md](./kritik-consolidated-open-items.md) → [kritik-derived-backlog.md](./kritik-derived-backlog.md).
6. **Gren:** `master`; `git pull origin master` ( `main` kan ligga efter). Efter arbete: `npm run typecheck` && `npx vitest run` → commit med helhets-% i subject → **direkt före push:** `git fetch origin` && `git pull origin master` (se [CONTINUATION.md](../avklarat/external-review-execution/CONTINUATION.md) § *Principer*) → `git push origin master`. Uppdatera vid behov **MASTER-ROADMAP**-rad + [`.cursor/orchestrator/ORCHESTRATOR_LOG.md`](../../../.cursor/orchestrator/ORCHESTRATOR_LOG.md). **Större spår:** orchestrator-protokoll — [`.cursor/orchestrator/PROTOCOL.md`](../../../.cursor/orchestrator/PROTOCOL.md); färdiga körningar arkiveras med `archive-completed-runs.ps1` (lokal `archive/`, post i `run-summaries.md`).

*Om löptext och tabell skiljer sig: låt § **Overall fill** och § **Kartläggning** gå före — rätta sedan § **Återstår**.*

## Commit- och push-rutin (pågående körning)

Vid varje dokumenterad avstämning:

1. Uppdatera tabellen **Overall fill** / **Done** om något nytt levererats.
2. **Staging:** `git add <filer>` lägger ändringar i **index** (”staging area”) — bara staged filer följer med i nästa `git commit`. `git status` visar vad som är staged vs endast ändrat lokalt. Stagea endast reporelevanta filer (inte lokala `data/`, `logs/`, `.cursor/orchestrator/archive/`). **Undantag:** avsiktlig **kritik-/arkiv-hygien** under `.j_to_agent/archive/` och flytt av färdigställda `kritik/*.md` ska med när batchen är dokumenterad (se § *Done* + `KRITIK-OVERVIEW.md`).
3. **Commit-rad:** använd **helhets-%** (Whole vision), t.ex. `chore: remediation ~84pct — kort vad som ändrats`.
4. **Batch:** under pågående orchestrator-remediation, **samla gärna ~4–5 enheter** på Whole vision mellan commits när flera säkra punkter ryms i samma gröna `typecheck`+`vitest` (färre mikrocommits). Se [CONTINUATION.md](../avklarat/external-review-execution/CONTINUATION.md).
5. Valfritt i **commit body:** landnings-% eller spår (integrationer, own-engine) om det hjälper historiken.
6. `git push` till `master` (eller din arbetsbranch).

### Gren: `master` och `main` (för agenter som “inte ser” ändringar)

- **Remediation i den här körningen pushas till `origin/master`.** Efter push ska `master` och `origin/master` peka på samma commit (`git status -sb` visar `## master...origin/master` utan `[ahead …]` / `[behind …]`).
- Repot har också grenen **`main`** på GitHub. Den kan vara **långt efter** `master` (olika historik). Om du klonar och råkar arbeta på **`main`**, eller om GitHub **default branch** är `main`, syns inte builder-/remediation-commits förrän du byter gren.
- **Rätt koll:**  
  `git fetch origin && git checkout master && git pull origin master`  
  samt `git log -1 --oneline origin/master` — ska matcha senaste kända remediation-/chore-commit.
- **Organisation:** överväg att sätta **default branch** till `master` i GitHub om all aktiv utveckling ska ligga där, eller merga `master` → `main` i en avsiktlig release-rutin (produktbeslut).

### Språkpolicy: svenska i UI, engelska kvar där det är medvetet

- **Prioriterat på svenska:** synlig copy i **byggaren** (header, inställningar, lansering, tips där vi rört ytan), **byggprofilbeskrivningar** i `MODEL_TIER_OPTIONS`, och **agentterminologi** i `.cursor/rules/terminology.mdc` där den speglar användartext.
- **Medvetet kvar på engelska (eller blandat):** kodkommentarer och utvecklardokumentation på engelska där de redan är det; **AI-elementkatalog** (`ai-elements-catalog.ts`) och liknande **prompt-hints** till modellen; interna **API-/felsträngar** som konsumeras av kod eller loggar; **tekniska namn** (OpenAI, Anthropic, Vercel, Blob, ZIP); **mallen för egna instruktioner** i `defaults.ts` (kan vara engelska för att styra genererad kod). Ny svensk översättning där ska göras medvetet (risk att rubba modellbeteende).

### Arbetsyta: samma innehåll som Git sparar

- **Repots rot** (checkout av `sajtmaskin`) är den katalog där `git commit` skriver ändringar. Öppna **den mappen** i editorn, eller en **workspace-fil med endast den mappen** som root (JSON: `"path": "."` relativt workspace-filen).
- **`sajtmaskin.code-workspace`** finns som spårbar mall: **`sajtmaskin.code-workspace.example`** (kopiera till `sajtmaskin.code-workspace` lokalt). Själva `sajtmaskin.code-workspace` är **gitignorerad** — den checkas alltså inte in, men ska peka på **`.`** (en root). Se `.cursor/README.md` och `.cursor/rules/workspace-hygiene.mdc`.
- **Cursor-projektmappar** under t.ex. `%USERPROFILE%\.cursor\projects\…` är **redaktörens metadata** (historik, terminals), inte en separat klon. Filer du sparar ska ligga under **repots filträd** ovan — annars “finns” inte ändringen i Git.
- **Verifiera att du är rätt:** `git rev-parse --show-toplevel` ska visa repots rot; `git branch --show-current` ska vara **`master`** för remediation-spåret; `git status -sb` ska visa `## master...origin/master` (efter `git fetch`).

### Ska du synka mot `origin/master`?

- **Ja — regelbundet `pull` (hämta + integrera)** om du vill ha exakt samma commithistorik som fjärr:  
  `git fetch origin && git checkout master && git pull origin master`  
  Efter det ska `git rev-parse HEAD` och `git rev-parse origin/master` vara **identiska** tills någon pushar igen.
- **`push`** behöver du bara när **du** har egna commits som ska upp till GitHub. “Pusha en pull” är inte en Git-operation — men **Pull** / **Sync** i Cursor/VS Code motsvarar `git pull` när du står på `master` och remote är `origin`.

## Overall fill (approximate)

| Segment | Done | Remaining | Koppling `1.txt`–`3.txt` |
|--------|------|-----------|---------------------------|
| **Whole vision** (syntes av tre dokument + tvärgrepp) | **100%** *remediation-exit* | **produktbacklog** (K-007/K-018/K-009 + valfri deploy-e2e; K-008/K-014 stängda) | Se [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md) |
| **Landing slice** (steg 1–4 i `1.txt`, delvis) | **~96%** | **~4%** | **`1.txt` del A**; W1-track kryssat i MASTER |
| **Integrationer + deploy** (`1.txt` steg 5–7) | **~83%** | **~17%** | **`1.txt` del B**; manifest + 409 + Vitest; `deploy-precheck` (K-007); **preview/`iframe`** (K-018) |
| **Own-engine** (`2.txt`, W3 + `B3-02`) | **~81%** | **~19%** | **`2.txt`**; kärnspår klart, marginaler i kritik-tabellen |
| **Scripts / naming / B3** (`3.txt`, W4 + buglista) | **~100%** | **~0%** | **`3.txt`**; buglista del 3 komplett (B3-05 skript borttaget 2026-03-27) |

## Återstår (kort)

**Remediation execution (W1–W5) är avslutad** — [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md). **Lista över allt som medvetet återstår** (K-rader, plan 17, smoke, segment-förklaring): **[`MASTER-ALLT-KVAR.md`](./MASTER-ALLT-KVAR.md)** + hubb **[`REMAINING-WORK.md`](./REMAINING-WORK.md)** (`queue/KORFIL.md` pekar till MASTER) — undvik att duplicera långa tabeller här. **Autonoma anhalter** för *ny* arbetsvåg: [CONTINUATION.md](../avklarat/external-review-execution/CONTINUATION.md).

## Done (in repo)

- **Ägarprioritet preview + mall-distinktion (2026-03-25):** **K-018** ny (användarsidor: React som `npm run dev`, fidelity i **`iframe`**); **K-008 [x]** (landning fryst); **K-009** förtydligad (marknads-FAQ sekundärt); FAQ + `e2e/README` — **Vercel-templates = scaffolds** för OwnEngine, **V0-templates** separat; `PLAN-KRITIK-OPEN`, `COMPLETION-ROADMAP`, `KORFIL`, `REMAINING-WORK`, `kritik-consolidated`, progress, `ORCHESTRATOR_LOG`.
- **Ägarbeslut B–I (2026-03-26, doc-batch):** **K-014 [x]** (juridik/cookies/om oss OK oförändrat); `queue/FRAGOR-SVAR-FAQ.md` (B1/C1/D1/I1, `e2e/` vs v0); Plan 17 — F1 v0 separerat, G1b ENV låg prio, H1c research + H2c `docs/old` → `avklarat/2026-03-docs-old-archive/`; `e2e/README.md` § *TL;DR*; synk `KORFIL`, `COMPLETION-ROADMAP`, `PLAN-KRITIK-OPEN`, `PLAN-REPO-SEPARATION-OPEN`, `kritik-consolidated`, `REMAINING-WORK`, `ORCHESTRATOR_LOG`.
- **Doc sweep (2026-03-28):** `orchestrator-workloads-external-review.md` — fulltext → `docs/plans/avklarat/`; **stub** i `active/` (samma filnamn, inga brutna länkar); `REMAINING-WORK.md` utökad; progress § *Återstår* / *Next* / *Uncertainties* förkortade till pekare; `REMEDIATION-EXIT`, execution `README`, handoff-mall, `docs/plans/README`, `docs/README`, `agent-workflows` uppdaterade.
- **Plan-docs (2026-03-28):** `orchestrator-followup-from-39fef25e.md` → `docs/plans/avklarat/` (punkt-i-tid second opinion; länkar uppdaterade); `docs/plans/active/README.md` — kartläggning *100%* vs Plan 17; `external-review-execution/` = **stub** i `active/`, innehåll i `avklarat/`; Plan **17** — WS-5/6/deferred kvar → **inte** arkiverad.
- **Repo hygiene closeout (2026-03-28):** `.gitignore` — ett sammanslaget automation/cursor-gpt-block, bort med dubblett-`node_modules/` och redundant `.env*.local`; `docs/plans/README.md` pekar på arkiverad `orchestrator-run-2026-03-26-external-review.md`; `orchestrator-run-…-external-review.md` — arkiveringsnotis + BOM bort; `.cursorignore` — valfri exkludering av `.j_to_agent/archive/kritik-addressed/` (kommenterad).
- **Remediation exit (2026-03-28, orchestrator-run):** [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md); valfri Playwright-smoke `e2e/deploy/deploy-api-precheck.smoke.spec.ts`; `playwright.deploy-smoke.config.ts`; `npm run test:deploy-smoke:e2e`; `e2e/README.md` + progress/MASTER/ORCHESTRATOR_LOG/kritik-batch. *Run arkiverad lokalt:* `2026-03-28-external-review-remediation-exit`.
- **W1 + audit / Tailwind v4 (2026-03-27, orchestrator-run):** `lanyard-badge.tsx` — `bg-linear-to-br`; `BudgetEstimate.tsx` — `bg-linear-to-r`. **`track-w1-landing-followups.md`** (Lanyard-rad). *Run arkiverad lokalt:* `2026-03-27-tailwind-v4-gradient-hygiene` (se `run-summaries.md`).
- **W1 / K-008 delmoment (2026-03-27, orchestrator-run 2):** `lanyard-badge.tsx` — in-view innan fysik; reduced-motion → statiskt kort; `particle-orb.tsx` — `dpr` tak. **`track-w1-landing-followups.md`** uppdaterad. *Run arkiverad lokalt:* `2026-03-27-landing-3d-balance` (se `run-summaries.md`).
- **W1 / K-008 delmoment (2026-03-27, orchestrator-run):** `landing-how-it-works-lazy.tsx` — WebGL först vid in-view; reduced-motion → statisk fallback; `chat-area.tsx` terminalmarkör respekterar reduce. **`deploy-precheck.md`** § *Framtida fördjupning (K-007 / produkt)*. **`sitemap.ts`** — JSDoc-checklista vid nya marknadssidor. *Lokal run:* `2026-03-27-external-review-final-pct` → arkiverad.
- **Gen / route-plan (2026-03-27):** `route-plan.ts` — promptmönster **om oss** → **`/om`** (`Om oss`); engelska **about** / **company** / **story** → **`/about`**; `route-plan.test.ts`. **Cursor-regel:** [`.cursor/rules/parallel-agent-collision-safety.mdc`](../../../.cursor/rules/parallel-agent-collision-safety.mdc) § *Before git push*.
- **Scaffold / route-konsekvens (2026-03-27):** `ecommerce/manifest.ts` — **Om oss** länkar **`/om`**; tillagd **`app/om/page.tsx`** i e-handelsstartern. **Agent-rutin:** [CONTINUATION.md](../avklarat/external-review-execution/CONTINUATION.md) — *fetch + pull före push*.
- **W1 / K-014 delmoment (2026-03-27, layout):** `src/components/layout/footer.tsx` — **Om oss** → **`/om`** (ersätter fel **`/about`**); **Juridiskt**: **Integritetspolicy**, **Användarvillkor**, **GDPR**, **Cookies** (samma ankare som `landing-footer.tsx`); `src/components/layout/footer.test.tsx`.
- **B3-05 / W4 (2026-03-27):** `scripts/extract-static-core.mjs` borttaget — monolitisk `STATIC_CORE` i `system-prompt.ts` finns inte; statisk kärna via `static-core-loader` + `config/prompt-static/`. Uppdaterat: `scripts/README.md`, `docs/architecture/prompt-tree.md`, `buglista-del-3.md`, `track-w4-scripts.md`.
- **SEO / marknads-rutter (2026-03-27):** `src/app/sitemap.ts` — `STATIC_SITEMAP_REL_PATHS` + `src/app/sitemap.test.ts` (blogg/om/juridik m.m. får inte tyst falla bort).
- **W1 + W2 / doc (2026-03-27):** `src/app/blogg/page.tsx` — planerade teman + *Mer att läsa*; `e2e/README.md` — § *Builder & deploy API* (Vitest `deployments/route.test.ts`, `deploy-precheck.md`, auth-krav för HTTP-e2e).
- **Orchestrator / doc (2026-03-26):** Arkiverade hängande `run/`-mappar (scaffold-sandbox-migration, tier2-continue) med explicit deferral i FINAL-rapporter; execution README § *Dokumenthierarki*; tydligare roll för `1.txt`–`3.txt` vs operativ styrning i denna fil.
- **W1 / K-014 delmoment (2026-03-26):** `landing-footer.tsx` — länkar **Cookies** och **GDPR** till `/privacy#cookies` respektive `/privacy#gdpr`; `src/app/privacy/page.tsx` — `id` på avsnitt 5–6 och `scroll-mt-24` för ankring.
- **W2 / deploy-kontrakt (2026-03-26, K-007 delmoment):** Vitest för **`precheckOnly` + `skipAutoFix`** i `src/app/api/v0/deployments/route.test.ts`; `docs/architecture/deploy-precheck.md` § **Kontraktstester** (lista över mockade scenarier + notis om att Playwright-e2e är separat).
- **W5 / kritik-hygien (2026-03-26):** Arkiverade handoff- och milstolpsfiler (`18–84pct-*`, m.fl.) under `.j_to_agent/archive/kritik-addressed/`; masterlista [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md); [`kritik-derived-backlog.md`](./kritik-derived-backlog.md) som pekare; [`KRITIK-OVERVIEW.md`](../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md) + execution README; [`repo-hygiene.md`](../architecture/repo-hygiene.md) § *Git versus Cursor* (ingen `.gitignore`-ändring krävd för orchestrator).
- **Buglista del 3 (2026-03-25 ff., komplett 2026-03-27):** **B3-01 … B3-08** inkl. **B3-05** (borttaget `extract-static-core.mjs`) — se `buglista-del-3.md`; historik: `agent-workflows.md`, terminology, sandbox-doc, `scaffold-pipeline.py` manuell path, Vercel-skill routing; **B3-02** `phase-routing.ts` + Vitest + `engine-status.md` + `model-build-profiles.md`.
- **W3 (slice, `2.txt`):** Döda konstanter `STREAM_RESOLVE_MAX_ATTEMPTS` / `STREAM_RESOLVE_DELAY_MS` borttagna från `POST /api/v0/chats/stream` och follow-up-stream-routen (användes inte). `createOwnEnginePlanModeResponse` tar inte längre `modelId` i params — planner-modell kommer enbart från `resolvePhaseModel(modelTier, "planner")` i SSE-meta (undviker vilseledande dubbel källa).
- **W3 (namngivning):** `createGenerationPipeline` flyttad till **`src/lib/gen/generation-pipeline.ts`**; `src/lib/gen/fallback.ts` re-exporterar för äldre importvägar. Stream-routes, MCP `generate-site`, Vitest-mocks och `run-eval` needles uppdaterade; `docs/architecture/v0-soft-deprecation.md` justerad.
- **W3 (contract gate):** `createPreGenerationContractGateReadableStream` i **`src/lib/providers/own-engine/pre-generation-contract-gate.ts`** — en SSE-sekvens för pre-generation contract clarification delas av nya chatten och follow-up (ny-chat lägger `chatPrivacy` / `scaffoldLabel` / `capabilities` i meta via explicita nycklar; follow-up utelämnar dem som tidigare).
- **W3 (finalize / orphans):** `finalizeAndSaveVersion` skriver assistant + draft-version **i en DB-transaktion** (`addAssistantMessageAndCreateDraftVersion`); vid tidigare två-stegs-flöde användes `deleteEngineMessage` om draft misslyckades — nu rollback via transaktion. Vitest: misslyckad persist + mocks via `@/lib/db/services`.
- **W3 (SSE golden):** `pre-generation-contract-gate.golden.test.ts` — avkodar SSE från `createPreGenerationContractGateReadableStream`, låser eventordning och skillnad follow-up vs new-chat-meta.
- **W3 (generation SSE golden):** `generation-stream.golden.test.ts` — `createOwnEngineGenerationStream` med inspelad pipeline-SSE; mockad `finalizeAndSaveVersion` + `db`/sandbox; låser `chatId` → `meta` → `content*` → `done` och att finalize får ackumulerat innehåll.
- **W3 (orphan-regression):** `finalize-version.test.ts` — vid lyckad finalize anropas inte `addMessage`; endast `addAssistantMessageAndCreateDraftVersion`.
- **W3 (v0-gräns):** `own-engine-v0-boundary.test.ts` — inga `@/lib/v0/*` eller `v0-sdk` i `src/lib/own-engine/**` eller `src/lib/providers/own-engine/**` (exkl. `*.test.*`); arkitekturnotis i `v0-soft-deprecation.md`.
- **W3 (session slice):** `own-engine-build-session.ts` — `buildOwnEngineGenerationStreamMeta` delas av `POST .../chats/stream` och `POST .../[chatId]/stream`; `own-engine-build-session.test.ts` låser att follow-up inte får `chatPrivacy`/`scaffoldLabel` i meta.
- **W3 (contract-gate params):** `buildPreGenerationContractGateParams` samlar parametrar till `createPreGenerationContractGateReadableStream`; samma två routes; tester för new-chat vs follow-up (`chatPrivacy` / `scaffoldLabel` / `capabilities` endast new-chat).
- **W3 (generation pipeline session):** `createOwnEnginePipelineAndGenerationStream` i **`own-engine-pipeline-generation.ts`** (separat från `own-engine-build-session.ts` så Vitest utan Postgres kan importera meta/contract-hjälpare) — gemensam `createGenerationPipeline` + `createOwnEngineGenerationStream` med `getAgentTools`; båda v0 chat-stream-routes.
- **W3 (plan-mode session):** **`own-engine-plan-mode.ts`** — planner system prompt + preamble, `resolvePlanModePlannerModelId`, `logPlanModeGenerationStart`, `createPlanModePipelineStream` (valfritt `chatHistory` / `referenceAttachments`); båda stream-routes tunnare; **`own-engine-plan-mode.test.ts`**.
- **W4 + process:** `scripts/README.md` § Lab/debug för `scripts/labs/testning_scarf` + npm-tabell; inventory uppdaterad; **`avklarat/external-review-execution/CONTINUATION.md`** beskriver batch-commits och fortsättning utan ping per checkbox.
- **Repo-städ / dokumentation (final sweep-uppföljning):** `config-dashboard/` + `docs/architecture/config-dashboard-sources.md` spårade; `docs/README.md` länkar dit. Uppdaterade `.cursor/rules/*`, `.cursor/settings.json`, `.cursorignore`. Borttagna duplicerade `.j_to_agent/.../deep-research-report (1|2).md`; kritik-filer under samma mapp trimmade/uppdaterade (inkl. nya anteckningar där de lades till lokalt).
- Landning: statisk copy/data i `landing-chat-data.ts`; delade hooks i `landing-hooks.ts`; state/build-flöde i `useLandingController` (`use-landing-controller.ts`).
- 3D tilt + tech/integration card glow + terminal glow: DOM / CSS-variabler, inte `setState` per rörelse.
- `prefers-reduced-motion` stoppar tilt-uppdateringar.
- Tech stack: Drizzle ORM, Vercel Analytics (stämmer med `@vercel/analytics` + Speed Insights i `src/app/layout.tsx`).
- Integrationer-rad: OpenAI; Sentry bort från listan.
- Zod-feature copy: Drizzle / server actions / API.
- Footer (landning v2): `/om`, `/blogg`, `/privacy`, `/terms`, `/faq`, `mailto:`; inga falska social-URL:er.
- Video-knapp: väljer Analyserad + toast.
- `integrationRegistry` + typer; `detectIntegrations()` läser namn/envVars/setupGuide därifrån via `DETECTION_PIPELINE` (regex kvar i `detect-integrations.ts`).
- **Builder UX (svenska copy, 2026-03-25):** `BuilderHeader` inställningar + modell-dropdowns; `defaults.ts` byggprofilbeskrivningar; agentterminologi (`terminology.mdc`) och routing-doc följer UI-strängar.
- **Builder UX (header Mer, 2026-03-25):** **Mer**-meny: import, sandbox, ZIP; **Ny chat**; svenska etiketter (**Djup brief**, **Resonemang**, **Anpassad** modell); OpenClaw **Mer-meny** / **mer-menyn** i tips-kontext.
- **Builder UX (tips/header, 2026-03-25):** **TipCard** utan duplicerad “var finns UI”-ruta; **tips-toggle** under **Inställningar**; header **Inställningar** + svenska menysektioner; instruktionsdialog **Klar**; OpenClaw-ytor inkl. **lansering**.
- **Builder UX (plotter, 2026-03-25):** ingen separat lanserings-**badge** i **BuilderHeader**; **`formatDeployReadinessStatusLabel`** / **`deployReadinessBadgeClassName`** i `src/lib/builder/deploy-readiness-copy.ts` + Vitest; **Lansering**-kort utan extra informationsruta när status är redo; kortare **Publicera**-tooltip (env) och **409**-hint i `useBuilderDeployActions`.
- **W2 (2026-03-25):** **Elasticsearch** i **`integrationRegistry`** + **`DETECTION_PIPELINE`**; `env-policy`; Vitest (`integration-manifest.test.ts`).
- **W2 (2026-03-26):** **Typesense** i registry + detektion + env-policy + Vitest.
- **W2 (2026-03-26):** **Meilisearch** i registry + detektion + env-policy + Vitest.
- **W2 (2026-03-26):** **Algolia** i registry + detektion + env-policy + Vitest.
- **Webscraper (2026-03-26):** enhets tester för **`validateAndNormalizeUrl`** / **`getCanonicalUrlKey`** (`src/lib/webscraper-url.test.ts`).
- **W2 (2026-03-26):** **Sanity**, **Contentful**, **Storyblok**, **MongoDB** i **`integrationRegistry`** + **`DETECTION_PIPELINE`**; kategori **`cms`**; `env-policy` uppdaterad; Vitest.
- W2 (2026-03-25): Clerk, NextAuth/Auth.js, Google OAuth, GA4, GTM, Vercel Analytics, Plausible, PostHog, Vercel KV och **Sentry** ligger i **`integrationRegistry`** med registry-styrda rader i `DETECTION_PIPELINE` (Prisma/SQLite förblir inline med särskild copy).
- W2 manifest + deploy (forts.): **`sajtmaskin.integration-manifest.json`** läggs in vid `finalizeAndSaveVersion` (efter preflight); `detectIntegrationsFromVersionFiles` + `resolveEnvRequirementsFromVersionFiles` använder manifest när `schemaVersion: 1` är giltig, annars heuristisk scan. **`deployReadiness`** (`buildDeployReadiness`) loggas på deploy-precheck och returneras i deploy-API-svaret.
- **W2 deploy Vitest (2026-03-25):** `deploy-readiness.test.ts` — `buildDeployReadiness` (ready / missing env / warnings). `deployments/route.test.ts` — `POST` med `precheckOnly: true` (minimal `package.json` → ready; Stripe i kod → `STRIPE_SECRET_KEY` i `missingEnv`); mocks inkl. `@/lib/db/client` så route-modulen inte kräver `POSTGRES_URL`.
- **W2 manifest + deploy (2026-03-26, 42pct-uppföljning):** `integration-manifest.test.ts` — tom fil-lista, ogiltig manifest → heuristik, fel `schemaVersion`, merge manifest + `custom-env`, ogiltig `filesJson` oförändrad, inject-idempotens. `invalidFiles` i `deployReadiness` vid ogiltig `package.json`; `deployments/route.test.ts` täcker `precheckOnly`-svaret.
- **W2 builder-UX (409):** `useBuilderDeployActions` — vid **`DEPLOY_MISSING_ENV`** visas saknade nycklar i användarfel + versions-`error-log` (`deploy`); `deploy-precheck.md` § Builder.
- W2 deploy-hårdning (2026-03-25): **`docs/architecture/deploy-precheck.md`** beskriver auto-fixar + **opt-out** (`skipAutoFix` / `SAJTMASKIN_DEPLOY_DISABLE_AUTO_FIX=1`); **`POST /api/v0/deployments`** ger **409** (`DEPLOY_MISSING_ENV`) om obligatoriska env saknas efter preflight; valfri body **`precheckOnly`** för torrkörning utan credits.
- `vitest.config.ts`: **`e2e/**` exkluderad** så Playwright-specar under `e2e/` inte körs av Vitest (samma idé som befintlig `vercel_templates_levels/**`-exkludering).
- `scripts/run-eval.ts` needle-checks uppdaterade (registry + pipeline).
- `landing-hero.tsx` / `landing-footer.tsx`: hero + footer JSX bort från monolitiska `chat-area.tsx`.
- `extract-landing-chat-data.mjs`: markörblock `SAJTMASKIN_LANDING_DATA_EXTRACT_*`, legacy-radslice om tillämpligt, annars **no-op exit 0** när `landing-chat-data.ts` redan bär `export const categories` (K-015).
- `registry-parity.test.ts`: unika `integrationRegistry`-nycklar och `provider ?? key` (K-017 / detektionskarta).
- `write-tier2-run.mjs`: valfritt run-id som CLI-arg (`node scripts/write-tier2-run.mjs <id>`).
- **K-016 (del 4 + stängd, 2026-03-26):** `landing-feature-blocks.tsx` — `FeatureCard`, `FeatureModal`, export `LandingFeatureItem`.
- **K-016 (del 3, 2026-03-26):** `landing-tech-integration-cards.tsx` (`TechStackCard`, `IntegrationCard`); `landing-how-it-works-fallback.tsx` — dynamic loading för HowItWorks.
- **K-016 (del 2, 2026-03-26):** `landing-comparison-radar.tsx`, `landing-lighthouse-gauges.tsx` — utdragna från `chat-area.tsx`; radar använder `useId` för unika SVG-gradientreferenser.
- **K-016 (del 1, 2026-03-26):** `landing-wireframe-shapes.tsx` — wireframe-meshes, `modalParticles`, `renderMiniShape`, `WireframeShape`; `chat-area.tsx` kortare.
- `chat-area.tsx`: borttagna oanvända Lucide-/data-imports; oanvända värden från `useLandingController` plockas inte längre ut; terminal ref-merge med tydlig eslint-avsiktskommentar.
- `landing-hero.tsx`: `headlineTilt` destruktureras så `eslint-plugin-react-hooks` ref-regler inte falskt larmar.
- `landing-background.tsx`: shader-orbs + grid + noise flyttade från `ChatArea`; `data-landing-bg` per kategori (`fritext`, `template`, `audit`, `analyserad`); `prefers-reduced-motion` via scoped CSS under `.landing-chat-bg` (lägre opacitet, inga orb-/grid-animationer).
- **Vercel Templates Playwright:** kanon **`e2e/vercel-templates/`** (tracked). Legacy `vercel_templates_levels/` kan ligga **lokalt** (gitignore + cursorignore). Kör → `raw-discovery/current/`; **inte** v0-mallar (`templates:*`). Docs: `vercel-templates-discovery.md`, `vercel-templates-playwright-scaffold-integration.txt`.
- `scripts/README.md` + `scripts-scaffolds-inventory.md`: rättade sökvägar (`scripts/hamta_sidor*`), `npm run template-library:verify-summary`, svenska i scaffold-pipeline-tabellen; **recovery**-skript dokumenterat som **saknat** i repot.
- **W4 (hamta + lab):** **`hamta_sidor_branch_emil.py`** kanon + **`--legacy-wide-use-cases`**; **`scripts/hamta_sidor.py` borttagen** (ersätts av flaggan). **`scripts/labs/testning_scarf/`** + `package.json` / ignore-filer. Uppdaterat: `scripts/README.md`, `scripts-scaffolds-inventory.md`, `research/external-templates/README.md`, `track-w4-scripts.md`, `scraped-scorefolds-pipeline.md`, `devtools/README.md`.
- **W1 (landning, del):** `ParticleOrb` in-view innan WebGL; reduced-motion → statisk orb; `IntegrationCard` + feature-modal partiklar utan `float-particle-kf` vid reduce (`usePrefersReducedMotion`). **W1 (footer/produkt):** sidor **`/om`**, **`/blogg`** + footer-länkar + sitemap. Se `track-w1-landing-followups.md`.
- **Terminologi / legacy:** `scripts/README.md` + `research/external-templates/README.md` — tydlig särskiljning: **15 = `EVAL_PROMPTS`**, **12+2 = skrap-kärna** (`USE_CASES_CORE`/`EXTENDED`), **5 = scorecard**; **icke-kanon** (`vercel_templates_levels/`, `--legacy-wide-use-cases`). *Lokala eval-rapporter under `eval-output/` (gitignorerad).*

## Next (recommended order)

**W1–W5 enligt `1.txt`–`3.txt`:** **klart** — se [REMEDIATION-EXIT.md](../avklarat/external-review-execution/REMEDIATION-EXIT.md). **Nästa arbete:** [REMAINING-WORK.md](./REMAINING-WORK.md) (K-rader, plan 17, valfri smoke). Historisk ordningslista fanns i [arkiverad workload-snapshot](../avklarat/orchestrator-workloads-external-review.md).

## Uncertainties / product follow-ups

Ingår i **produktbacklog** / [REMAINING-WORK.md](./REMAINING-WORK.md) (t.ex. `/blogg`-placeholder, social-copy utan URL:er).
