# MASTER — allt kvarvarande arbete (Sajtmaskin)

**Det här är den enda fil du behöver öppna** för att se *vad som ska göras*, i vilken ordning, och hur du kör arbetet (agent vs orchestrator).  
Äldre uppdelning i `queue/KORFIL.md` + flera `PLAN-*.md` finns kvar som **detaljreferens** men är **inte** längre den primära ingången.

### Innehåller MASTER allt en nästa agent behöver?

- **Ja** för *prioritering, acceptans, produktintent och filpekare* — det ska räcka att planera och spåra K-rader här.
- **Nej** för *exakt kodmekanik* — det är **avsiktligt**. Du ska ändå läsa **[`INPUT_GPT.txt`](../../../INPUT_GPT.txt)** § 7–14 (env-merge, pseudokod, faser), **[`docs/architecture/preview-and-sandbox-flow.md`](../../architecture/preview-and-sandbox-flow.md)** där flödet utvecklas, och **faktiska källfiler** som listas i § 2. Utan dessa kan ingen agent «gissa» hela implementationen bara från MASTER.
- **Bilaga (canonical intent, engelska):** [`.j_to_agent/fidelity.txt`](../../../.j_to_agent/fidelity.txt) — samma innehåll som § 0 här i kondenserad svensk form.

---

## Varför finns det fortfarande andra filer?

- **[`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md)** — **kanonisk master-tabell** för K-ID och `[ ]` / `[x]`. **Uppdatera den alltid** när en rad stängs eller får delmoment.
- **[`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md)** — **kanonisk** för Plan 17-kryss (WS-5, deferred). **Uppdatera den** när kryss bockas.
- Den **här** filen samlar **berättelsen, prioritering, acceptans och startinstruktioner** så du slipper hoppa mellan fyra planer.

### Arkivering, `reviews/`, `queue/`, och dubbletter

- **`MASTER-ALLT-KVAR.md` ligger i `docs/plans/active/`** (samma nivå som `kritik-consolidated-open-items.md`) — **inte** i `active/reviews/`. Mappen **`reviews/`** ska bara innehålla second-opinion-saker (`reviews/README.md`). Om editorn ser ut att visa MASTER under `reviews` är det oftast **fel sortering** i trädet — kontrollera sökvägen i fliken.
- **`active/queue/`** ska **inte** massarkiveras än: tiotals länkar i repot pekar på `queue/PLAN-*.md`, `COMPLETION-ROADMAP.md`, `FRAGOR-SVAR-FAQ.md`. MASTER är **läs först**; kö-filerna är fortfarande **levande detalj + kanoniska kompletteringar**. Att flytta allt till arkiv kräver en **medveten länk-svep** (stor PR).
- **Post-exit-kö (historik):** Dublettmappar (`docs/plans/post-exit-queue-2026-03/`, m.fl.) var **identiska** med `active/queue/*` och ska **inte** återinföras med full filuppsättning. **Arkivnotis** (pekar till MASTER + `active/queue/`): [`../archived/post-exit-queue-2026-03/README.md`](../archived/post-exit-queue-2026-03/README.md).
- **Beslut som blockerar nästa större fas:** [`queue/BESLUT-INNAN-VI-GAR-VIDARE.md`](./queue/BESLUT-INNAN-VI-GAR-VIDARE.md) (K-007, K-009, K-018, K-019, Plan 17 WS-4/5).

---

## 0. Fidelity- och produktintent (speglar `.j_to_agent/fidelity.txt`)

**Fullständig källtext (engelska):** [`.j_to_agent/fidelity.txt`](../../../.j_to_agent/fidelity.txt).  
Nedan: **kanonisk svensk sammanfattning** som styr § 1–2 och K-018 / K-019. Uppdatera § 9 när detta ändras.

### Standard-UX kontra intern diagnostik

- **Mål:** Vanliga användare ska uppleva *skriv önskemål → systemet driver → körbar preview* utan att agera «intern orkestratör».
- **Behåll** klarifieringar, kontraktsfrågor, «svar krävs», Agentlogg, råtext och annan telemetri — de är **verkliga** felsökningsflöden. De ska **inte** dominera standardläget: flytta till **sekundär nivå**, debug/dev/admin, hopfällt eller dolt som default.
- **Regel:** Tonar ned i standard-UX; **inte** ta bort eller göra omöjligt att se vad buildern gör när något går fel.

### Preview-arkitektur (ordning)

- **Huvudspår:** Riktig **sandbox-runtime** (samma riktning som repo redan beskriver för sandbox) — **inte** statisk/semi-statisk shim som primär upplevelse.
- **Vändning mot dagens tvåstegskänsla:** **Sandbox ska vara huvudpreview** när den kan startas; **shim** endast **fallback** när sandbox inte går att starta eller vid tydliga fallback-villkor.
- **Ephemeral norm:** **Ingen** permanent varm full runtime per **inaktivt** gammalt projekt. **Session-baserad** återanvändning inom aktiv användning (idle ~30 min, hard cap ~2 h — se § 2 Fas 2).

### Tre skilda lager (får inte kollapsas till ett)

1. **Preflight** — befintlig intern quality gate (reparation av genererad kod, sanity checks, SEO/route, m.m.). **Ska inte rivas** eller ersättas av bara `npm run dev` eller bara `npm run build`.
2. **Sandbox-preview** — i praktiken **`npm install` → `npm run dev`** för genererad sajt i sandbox: det är **huvudfidelity** för iteration och app-lik interaktion.
3. **`npm run build`** — **separat verifiering** (byggbarhet, senare deploy-paritet), **inte** den motor som ska definiera «preview funkar» för användaren.

**Produkt-/UX-nivåer:** Se **[`docs/architecture/preview-fidelity-tiers.md`](../../architecture/preview-fidelity-tiers.md)** för **Preview fidelity tier 1–3** — **tier 2 (sandbox `install`+`dev`)** är avsedd **primär iframe**; **tier 1 (shim)** är **fallback** med tydlig logg/toast om sandbox misslyckas; **tier 3** (deploy/build-check) kan komma senare. Inte samma numrering som **K-018 Fas 1–4** nedan.

### Integrationer i preview (policy i korthet)

- **Preview-säkra defaults:** Lazy init, adapters, degraded mode så UI och statiska routes lever när riktiga integrationer saknas; undvik att placeholders «räcker» om klienter **connectar vid import** och kraschar.
- **Persistence:** När behov misstänks — **SQLite som default i preview** (repo har redan spår i contracts); **utbytbart** mot Postgres/Supabase m.m. senare — inte «SQLite för alltid i prod», utan «SQLite när preview behöver riktig persistence utan extern provisionering».
- **E-post:** **Preview-mail-läge** (logga i sandbox, preview-inbox, lyckat UI utan skarp sändning) — inte implicit att alla demos skickar riktiga mail.
- **Auth:** **Demo-auth / stub** som default i preview; Clerk/Auth.js/Auth0 kvar som **riktiga** produktspår när användaren kopplar in dem.
- **Redis m.m.:** **Inte** hårt krav för vanlig preview; in-memory, lokala köer, SQLite-ersättare där det räcker. **Nivå 3** (sann distribuerad infra) först när kärnlogiken verkligen kräver det — **statisk shim sista nätet**, inte standardreaktion för saknad Redis.

### Miljö i sandbox

- **Auto `.env.local`** för genererad app: server-side merge **innan** sandbox startar — **projektspecifika** env när de finns → repo-placeholders → rimliga preview-defaults (se § 2 och `INPUT_GPT.txt` § 7).

### GitHub

- **Inte** primär lagring i detta steg: intern lagring av versioner/kod förblir sanning tills runtime-/preview-pipelinen är stabil; GitHub **export** senare (§ 2 Fas 4).

### Promptkedja (egen K-rad)

- Observation: kontext kan **tappas eller dubbleras** mellan närliggande steg (t.ex. första förberedda prompt vs follow-up). **Åtgärd:** persistera och återanvänd **kanonisk förberedd orchestration-kontext** (snapshot) över hela kedjan — se **K-019** i § 3.

---

## 1. Rekommenderad start (nuvarande prio: preview & användarsajt)

1. Läs **§ 0** (fidelity) + **§ 2** (K-018) + **[`INPUT_GPT.txt`](../../../INPUT_GPT.txt)** § 7, 10–14 (env-merge, faser, pseudokod). Vid behov: [`.j_to_agent/fidelity.txt`](../../../.j_to_agent/fidelity.txt) (full engelsk version).
2. Implementera **Fas 1**: placeholder-env + `projectEnvVars` → **`.env.local` i den genererade sajtens sandbox** → `npm install` → `npm run dev`; **`npm run build`** som **separat** status (inte samma som «preview funkar»). **Behåll preflight** som separat lager (§ 0).
3. Följ **UI-principen i § 2** + **§ 0**: användaren ser bara **sitt projekts** preview/integration; **intern** diagnostik (Agentlogg, råtext, klarifieringar) **sekundär** i standardläge — **K-019** för promptkedja + ev. stream-UX.
4. Kör **`npm run typecheck`** && **`npx vitest run`**. Uppdatera [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) (K-018, K-019), [`external-review-remediation-progress.md`](./external-review-remediation-progress.md), [`.cursor/orchestrator/ORCHESTRATOR_LOG.md`](../../../.cursor/orchestrator/ORCHESTRATOR_LOG.md).

**Parallellt med låg risk:** Plan 17 **endast dokumentation** (t.ex. sanning i `ENV.md`) — **inte** samma PR som tung `generation-stream.ts`-refaktor om du vill undvika konflikter.

**Om preview *inte* är prio:** Gå till **§ 3** (K-007 deploy-policy eller K-009 SSE-scope) först.

---

## 2. Preview, sandbox, `iframe`, integrationer i **genererad** sajt (K-018)

### Mål

Användargenererade sidor ska kunna visas med **hög trohet** som React: **samma klass som `npm run dev`** i en riktig Next-runtime, och **samma upplevelse i `iframe`**.  
Allt som handlar om `.env.local` / `dev` / `build` här avser **den genererade sajtens** filer i sandbox — **inte** Sajtmaskin-monorepots egna `.env*`.

### Previewordning: sandbox först, shim sist

- **Primär upplevelse:** Aktiv **sandbox** med `npm install` + `npm run dev` när runtime kan startas (jmf. § 0).
- **Fallback:** Snabb **shim** / statisk eller semi-statisk preview **endast** när sandbox inte startar eller vid uttryckliga fallback-villkor — **inte** normen bara för att en integration saknas om adapters/degraded mode kan lösa det.
- **Kostnadsmodell:** Återanvänd sandbox inom **samma aktiva session** (Fas 2); **undvik** permanent «alltid varm» runtime per inaktivt kundprojekt.

### Tre lager (samexisterar — riv inte ihop dem)

| Lager | Roll |
|-------|------|
| **Preflight** | Befintlig intern kedja: reparation, validering, sanity, SEO/route — **quality gate** före/parallellt med preview enligt nuvarande repo-design |
| **Sandbox `dev`** | **Huvudfidelity** för vad användaren ser som «levande preview» |
| **`npm run build`** | **Separat** signal: byggbarhet / deploy-paritet — **får inte** vara den enda definitionen av «preview OK» |

### UI-princip (obligatorisk riktning)

- **Problem:** Byggaren tenderar att visa **för många** och **blandade** signaler (plattform + användarens projekt på samma yta).
- **Regel:** Användaren ska bara se vad som rör **hennes/hans genererade sajt**: egna integrationer, egna env-behov, tydlig preview-status (shim / runtime / build).
- **Sajtmaskins interna integrationer** (`registry`, vilka providers *plattformen* använder, intern diagnostik) ska **inte** blandas in i samma vy som användarens «vad behöver min sajt».
- **Standard-UX (fidelity):** Byggaren ska **normalt inte stanna** i vänteläge för riktningsval — **rimliga antaganden** och preview-säkra defaults, **fortsätt**. Klarifierings-/«awaiting input»-grenar finns kvar för **debug, admin och sanna edge cases** (se § 0).
- **AgentLogCard, råtext, promptlängder, tool-signaler:** **kvar** i produkten men **sekundära** som default (hopfällda, dolda, eller debug-läge) så vardagsanvändaren inte möts av intern telemetri som huvudyta.

### Faser (jämför `INPUT_GPT.txt` § 12)

| Fas | Innehåll |
|-----|----------|
| **1** | Env-merge → `.env.local` i sandbox, `npm install`, `npm run dev`; `npm run build` som **separat** verifieringsstatus |
| **2** | Session-varm sandbox (`chatId`↔sandbox), idle ~30 min, hard cap ~2 h, heartbeat, cleanup |
| **3** | Adapters / degraded preview (SQLite eller fil-lager, **preview-mail**, **demo-auth**, **Redis-ersättare** / in-memory där möjligt) för integrationer som **inte** räcker med placeholders — **hög upplevd fidelity utan tung drift** (§ 0) |
| **4** | GitHub som **export** — **inte** primär persistence (se `INPUT_GPT.txt` § 9) |

### Integrationer — tre nivåer (sammanfattning av `INPUT_GPT.txt` § 5–6 + § 0)

| Nivå | Innebörd | Exempel |
|------|-----------|---------|
| **1 — Placeholder-safe** | Falska/testvärden räcker så appen startar | Resend, analytics, Stripe-liknande test, Supabase-URL+fake, Clerk/Auth placeholders |
| **2 — Projektbundna riktiga värden** | Använd `project_data.meta.projectEnvVars` när de finns; annars degraded | Kundens Supabase, Stripe, Resend |
| **3 — Kräver adapter** | Env-sträng räcker inte; lazy init / bypass i preview | Redis/DB som connectar vid import, OAuth med redirect, middleware som blockerar allt |

**Praktiska preview-spår (Fas 3-riktning):** **Nivå 1** — preview-native (in-memory, no-op, fake keys). **Nivå 2** — adapter (t.ex. ORM SQLite nu → Postgres senare; demo-login nu → OAuth senare). **Nivå 3** — sann extern infra bara när appens kärnlogik kräver det; bygg **inte** upp nivå 3 i onödan.

**Merge-ordning för `.env.local` i sandbox:** bas-placeholders (`40-generated-site-integration-placeholders.env.txt` via `readGeneratedSitePlaceholdersEnvText()`) → projekt-env → ev. UI-override → preview-sentinels (`SAJTMASKIN_PREVIEW_MODE`, m.m.). **Riktiga projektvärden ska slå placeholders**; placeholders ska **aldrig** till produktion som «sanning».

### Acceptans efter Fas 1

- [x] `.env.local` skrivs i sandbox enligt merge-ordning.
- [ ] Fler previews startar när integrationer krävs.
- [ ] **Sandbox/runtime** är **primär** previewväg när start lyckas; shim **fallback**, inte default-upplevelse.
- [x] `npm run build`-resultat rapporteras **separat** från «dev körs»; **preflight** kvar som eget lager (ingen ersättning med bara dev eller bara build).
- [ ] UI: tydlig skillnad shim ↔ runtime ↔ build OK / build fail (dev kan ändå köra), **utan** intern plattformslista i samma vy. *(Build OK/fail i previewpanel: ja 2026-03-26.)*

### Primära kodfiler

`src/lib/gen/sandbox-preview.ts`, `src/lib/providers/own-engine/generation-stream.ts`, `src/lib/ai-models/load-generated-site-placeholders.ts`, ev. `src/lib/mcp/runtime-url.ts`, `src/lib/gen/pre-generation-contracts.ts`. **Nya:** t.ex. `src/lib/gen/build-generated-site-env.ts`, `src/lib/gen/sandbox-session-store.ts`.

**Djup handoff:** [`INPUT_GPT.txt`](../../../INPUT_GPT.txt) · arkitektur: [`docs/architecture/preview-and-sandbox-flow.md`](../../architecture/preview-and-sandbox-flow.md) · intent-bilaga: [`.j_to_agent/fidelity.txt`](../../../.j_to_agent/fidelity.txt).

---

## 3. Övrig kritik / produkt

| ID | Vad | Status / nästa steg |
|----|-----|---------------------|
| **K-007** | Deploy: auto-fix / hårdare validering före deploy — **produktbeslut** (`deploy-precheck.md`, Vitest) | `[ ]` — välj policy: stramare / oförändrat / tydligare opt-in |
| **K-009** | Own-engine **utanför** avslutad W3 (SSE). **Inte** samma som FAQ på Sajtmaskins marknadssajt (sekundärt) | `[ ]` — spika scope eller stäng med motivering |
| **K-019** | **Builder standard-UX + promptkedja** (§ 0): intern telemetri/klarifieringar **sekundära** i standardläge; **kanonisk förberedd prompt/orchestration-kontext** persisteras och återanvänds över follow-up och närliggande stream-steg så kontext inte tappas eller dupliceras | `[ ]` — **delmoment:** Agentlogg hopfälld som standard; **kvar:** snapshot över stream-steg — [`queue/PLAN-K019-PROMPT-SNAPSHOT.md`](./queue/PLAN-K019-PROMPT-SNAPSHOT.md); se `.j_to_agent/fidelity.txt` |
| **K-008** | Landning | `[x]` — material fryst; fokus K-018 |
| **K-014** | Juridik/cookies/om oss | `[x]` — OK oförändrat |

**Hög konfliktrisk vid ändringar:** `registry.ts`, `detect-integrations.ts`, `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kring env/409.

---

## 4. Plan 17 — öppet (spegla kryss här + i planfilen)

Uppdatera **både** denna lista och [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md).

**WS-2 deferred (F1 — v0 medvetet separat):**

- [ ] v0 SDK (`src/lib/v0.ts`)
- [ ] `V0_API_KEY` i required env

**WS-4 deferred (G1b — ENV låg prio, dokumentera sanning först):**

- [ ] `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` bort från env-schema när policy klar
- [ ] `ENV.md` + `config/env-policy.json` i synk

**WS-5:**

- [ ] Stora JSON: `.gitignore` (inte bara `.cursorignore`) om nya filer tillkommer
- [ ] Ev. git-lfs / build-time generation > 1 MB
- [ ] `research/` — policy enligt plan 17 (extern rådata, inte hårdkrav för `npm run dev`)
- [ ] `docs/old/` — aggressiv städ i **separata PR** med **inventering före radering**

**WS-6:** klar 2026-03-26 (D-ID, OpenClaw; Brave + Loopia optional).

---

## 5. Drift & verifiering (efter varje batch)

- `npm run typecheck` && `npx vitest run`
- Valfritt: `npm run test:deploy-smoke:e2e` (kräver `SAJTMASKIN_*` — **Sajtmaskins** deploy-API, **inte** genererad sajts sandbox; se [`e2e/README.md`](../../../e2e/README.md))
- Uppdatera [`external-review-remediation-progress.md`](./external-review-remediation-progress.md) vid behov

---

## 6. Beslut och kontext (kort)

- **Vercel-templates** → **scaffolds** för OwnEngine; **V0-templates** → separat plattformsspår (FAQ [`queue/FRAGOR-SVAR-FAQ.md`](./queue/FRAGOR-SVAR-FAQ.md) § I1).
- **Remediation W1–W5:** klart per [`../archived/external-review-execution/REMEDIATION-EXIT.md`](../archived/external-review-execution/REMEDIATION-EXIT.md).
- **Tidslinje fler beslut:** [`queue/COMPLETION-ROADMAP.md`](./queue/COMPLETION-ROADMAP.md).

---

## 7. Ska du använda Orchestrator Run, en vanlig agent, eller «annan AI»?

| Situation | Rekommendation |
|-----------|----------------|
| **En fokuserad leverans** (t.ex. bara K-018 Fas 1) | **En Cursor-agent** (eller du) med denna MASTER + `INPUT_GPT.txt` — minst overhead. |
| **Stor inkommen rapport** från annan AI som ska brytas i många steg, med logg och verifiering mellan steg | **`/orchestrator` / orchestrator-run** enligt [`.cursor/skills/orchestrator-run/SKILL.md`](../../../.cursor/skills/orchestrator-run/SKILL.md) och `.cursor/orchestrator/PROTOCOL.md` — sekventiella workloads, `FINAL_REPORT`. |
| **Second opinion / arkitekturgranskning** | Annan modell/agent **läser** repo + skriver utkast → du **infogar i § 0** här → implementation i Cursor som ovan. |

Orchestrator är **inte** magiskt snabbare; det är **tydligare spårbarhet** och **tvingad ordning** när arbetet är stort. För K-018 Fas 1 räcker ofta **en** agent och **en** PR.

---

## 8. Detaljdokument (valfritt)

| Fil | När |
|-----|-----|
| [`.j_to_agent/fidelity.txt`](../../../.j_to_agent/fidelity.txt) | Full **engelsk** byggagent-instruktion; speglas i § 0 |
| [`queue/PLAN-PREVIEW-SANDBOX.md`](./queue/PLAN-PREVIEW-SANDBOX.md) | K-018-detalj (samma innehåll som § 2 i korthet) |
| [`queue/PLAN-KRITIK-OPEN.md`](./queue/PLAN-KRITIK-OPEN.md) | K-007 / K-009 acceptansrader |
| [`queue/PLAN-REPO-SEPARATION-OPEN.md`](./queue/PLAN-REPO-SEPARATION-OPEN.md) | Plan 17 öppet (spegel av § 4) |
| [`queue/PLAN-DRIFT-VERIFICATION.md`](./queue/PLAN-DRIFT-VERIFICATION.md) | Smoke/progress-rutin |
| [`queue/PLAN-MULTIAGENT-PREVIEW-TRACKS.md`](./queue/PLAN-MULTIAGENT-PREVIEW-TRACKS.md) | Metaplan: flera tier-2-agenter → egna planfiler (K-018 / K-019 / integrationer / K-007·K-009) |

---

## 9. Revisionslogg (manuell)

| Datum | Vad |
|-------|-----|
| 2026-03-25 | MASTER skapad; KORFIL blir pekare; allt kvar samlat här. |
| 2026-03-25 | § 0 fylld från `.j_to_agent/fidelity.txt`; sandbox-före-shim; tre lager; standard-UX vs debug; **K-019** (promptkedja); fråga «räcker MASTER?» besvarad i inledningen. |
| 2026-03-26 | **K-018 delmoment:** `.env.local` i sandbox-upload (merge); pekare **§ 8** → `PLAN-MULTIAGENT-PREVIEW-TRACKS.md`. |
| 2026-03-26 | **K-018 delmoment:** separat `npm run build` i sandbox + SSE/UI (`verifyBuild`, previewpanel). |
