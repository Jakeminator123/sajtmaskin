# MASTER — allt kvarvarande arbete (Sajtmaskin)

**Det här är den enda fil du behöver öppna** för att se *vad som ska göras*, i vilken ordning, och hur du kör arbetet (agent vs orchestrator).  
Äldre uppdelning i `queue/KORFIL.md` + flera `PLAN-*.md` finns kvar som **detaljreferens** men är **inte** längre den primära ingången.

---

## Varför finns det fortfarande andra filer?

- **[`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md)** — **kanonisk master-tabell** för K-ID och `[ ]` / `[x]`. **Uppdatera den alltid** när en rad stängs eller får delmoment.
- **[`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md)** — **kanonisk** för Plan 17-kryss (WS-5, deferred). **Uppdatera den** när kryss bockas.
- Den **här** filen samlar **berättelsen, prioritering, acceptans och startinstruktioner** så du slipper hoppa mellan fyra planer.

### Arkivering, `reviews/`, `queue/`, och dubbletter

- **`MASTER-ALLT-KVAR.md` ligger i `docs/plans/active/`** (samma nivå som `kritik-consolidated-open-items.md`) — **inte** i `active/reviews/`. Mappen **`reviews/`** ska bara innehålla second-opinion-saker (`reviews/README.md`). Om editorn ser ut att visa MASTER under `reviews` är det oftast **fel sortering** i trädet — kontrollera sökvägen i fliken.
- **`active/queue/`** ska **inte** massarkiveras än: tiotals länkar i repot pekar på `queue/PLAN-*.md`, `COMPLETION-ROADMAP.md`, `FRAGOR-SVAR-FAQ.md`. MASTER är **läs först**; kö-filerna är fortfarande **levande detalj + kanoniska kompletteringar**. Att flytta allt till arkiv kräver en **medveten länk-svep** (stor PR).
- **Post-exit-kö (historik):** Dublettmappar (`docs/plans/post-exit-queue-2026-03/`, m.fl.) var **identiska** med `active/queue/*` och ska **inte** återinföras med full filuppsättning. **Arkivnotis** (pekar till MASTER + `active/queue/`): [`../archived/post-exit-queue-2026-03/README.md`](../archived/post-exit-queue-2026-03/README.md).

---

## 0. Kommande tillägg (annan AI-agent — **fyll i här**)

*När du får resonemang om **iframe-fidelity** (t.ex. dev vs `build && start`, kvalitetsnivåer, vad som räcker som «tillräckligt bra») och **vilka integrationer** som ska ingå i produkten / visas i UI vs aldrig för slutanvändaren:*

1. Klistra in texten under denna punkt (eller länka till en bilaga och sammanfatta i 5–10 meningar här).
2. Uppdatera **§ 2** (preview) och ev. **§ 3** om scope ändras.
3. Notera datum i **§ 9**.

**Tom mall (ersätt):**

```text
[Infoga: fidelity-mål för iframe + ev. undantag]

[Infoga: integrationstaxonomi — ska med i MVP preview / senare / aldrig i användar-UI]
```

---

## 1. Rekommenderad start (nuvarande prio: preview & användarsajt)

1. Läs **§ 2** (K-018) och **[`INPUT_GPT.txt`](../../../INPUT_GPT.txt)** § 7, 10–14 (env-merge, faser, pseudokod).
2. Implementera **Fas 1**: placeholder-env + `projectEnvVars` → **`.env.local` i den genererade sajtens sandbox** → `npm install` → `npm run dev`; **`npm run build`** som **separat** status (inte samma som «preview funkar»).
3. Följ **UI-principen i § 2**: användaren ser bara **sitt projekts** preview/integration — **inte** Sajtmaskins interna plattformsbrus.
4. Kör **`npm run typecheck`** && **`npx vitest run`**. Uppdatera [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) (K-018), [`external-review-remediation-progress.md`](./external-review-remediation-progress.md), [`.cursor/orchestrator/ORCHESTRATOR_LOG.md`](../../../.cursor/orchestrator/ORCHESTRATOR_LOG.md).

**Parallellt med låg risk:** Plan 17 **endast dokumentation** (t.ex. sanning i `ENV.md`) — **inte** samma PR som tung `generation-stream.ts`-refaktor om du vill undvika konflikter.

**Om preview *inte* är prio:** Gå till **§ 3** (K-007 deploy-policy eller K-009 SSE-scope) först.

---

## 2. Preview, sandbox, `iframe`, integrationer i **genererad** sajt (K-018)

### Mål

Användargenererade sidor ska kunna visas med **hög trohet** som React: **samma klass som `npm run dev`** i en riktig Next-runtime, och **samma upplevelse i `iframe`**.  
Allt som handlar om `.env.local` / `dev` / `build` här avser **den genererade sajtens** filer i sandbox — **inte** Sajtmaskin-monorepots egna `.env*`.

### UI-princip (obligatorisk riktning)

- **Problem:** Byggaren tenderar att visa **för många** och **blandade** signaler (plattform + användarens projekt på samma yta).
- **Regel:** Användaren ska bara se vad som rör **hennes/hans genererade sajt**: egna integrationer, egna env-behov, tydlig preview-status (shim / runtime / build).
- **Sajtmaskins interna integrationer** (`registry`, vilka providers *plattformen* använder, intern diagnostik) ska **inte** blandas in i samma vy som användarens «vad behöver min sajt».

### Faser (jämför `INPUT_GPT.txt` § 12)

| Fas | Innehåll |
|-----|----------|
| **1** | Env-merge → `.env.local` i sandbox, `npm install`, `npm run dev`; `npm run build` som **separat** verifieringsstatus |
| **2** | Session-varm sandbox (`chatId`↔sandbox), idle ~30 min, hard cap ~2 h, heartbeat, cleanup |
| **3** | Adapters / degraded preview (SQLite eller fil-lager, no-op mail, optional Redis, auth preview-läge) för integrationer som **inte** räcker med placeholders |
| **4** | GitHub som **export** — **inte** primär persistence (se `INPUT_GPT.txt` § 9) |

### Integrationer — tre nivåer (sammanfattning av `INPUT_GPT.txt` § 5–6)

| Nivå | Innebörd | Exempel |
|------|-----------|---------|
| **1 — Placeholder-safe** | Falska/testvärden räcker så appen startar | Resend, analytics, Stripe-liknande test, Supabase-URL+fake, Clerk/Auth placeholders |
| **2 — Projektbundna riktiga värden** | Använd `project_data.meta.projectEnvVars` när de finns; annars degraded | Kundens Supabase, Stripe, Resend |
| **3 — Kräver adapter** | Env-sträng räcker inte; lazy init / bypass i preview | Redis/DB som connectar vid import, OAuth med redirect, middleware som blockerar allt |

**Merge-ordning för `.env.local` i sandbox:** bas-placeholders (`40-generated-site-integration-placeholders.env.txt` via `readGeneratedSitePlaceholdersEnvText()`) → projekt-env → ev. UI-override → preview-sentinels (`SAJTMASKIN_PREVIEW_MODE`, m.m.). **Riktiga projektvärden ska slå placeholders**; placeholders ska **aldrig** till produktion som «sanning».

### Acceptans efter Fas 1

- [ ] `.env.local` skrivs i sandbox enligt merge-ordning.
- [ ] Fler previews startar när integrationer krävs.
- [ ] `npm run build`-resultat rapporteras **separat** från «dev körs».
- [ ] UI: tydlig skillnad shim ↔ runtime ↔ build OK / build fail (dev kan ändå köra), **utan** intern plattformslista i samma vy.

### Primära kodfiler

`src/lib/gen/sandbox-preview.ts`, `src/lib/providers/own-engine/generation-stream.ts`, `src/lib/ai-models/load-generated-site-placeholders.ts`, ev. `src/lib/mcp/runtime-url.ts`, `src/lib/gen/pre-generation-contracts.ts`. **Nya:** t.ex. `src/lib/gen/build-generated-site-env.ts`, `src/lib/gen/sandbox-session-store.ts`.

**Djup handoff:** [`INPUT_GPT.txt`](../../../INPUT_GPT.txt) · arkitektur: [`docs/architecture/preview-and-sandbox-flow.md`](../../architecture/preview-and-sandbox-flow.md).

---

## 3. Övrig kritik / produkt

| ID | Vad | Status / nästa steg |
|----|-----|---------------------|
| **K-007** | Deploy: auto-fix / hårdare validering före deploy — **produktbeslut** (`deploy-precheck.md`, Vitest) | `[ ]` — välj policy: stramare / oförändrat / tydligare opt-in |
| **K-009** | Own-engine **utanför** avslutad W3 (SSE). **Inte** samma som FAQ på Sajtmaskins marknadssajt (sekundärt) | `[ ]` — spika scope eller stäng med motivering |
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
| [`queue/PLAN-PREVIEW-SANDBOX.md`](./queue/PLAN-PREVIEW-SANDBOX.md) | K-018-detalj (samma innehåll som § 2 i korthet) |
| [`queue/PLAN-KRITIK-OPEN.md`](./queue/PLAN-KRITIK-OPEN.md) | K-007 / K-009 acceptansrader |
| [`queue/PLAN-REPO-SEPARATION-OPEN.md`](./queue/PLAN-REPO-SEPARATION-OPEN.md) | Plan 17 öppet (spegel av § 4) |
| [`queue/PLAN-DRIFT-VERIFICATION.md`](./queue/PLAN-DRIFT-VERIFICATION.md) | Smoke/progress-rutin |

---

## 9. Revisionslogg (manuell)

| Datum | Vad |
|-------|-----|
| 2026-03-25 | MASTER skapad; KORFIL blir pekare; allt kvar samlat här. |
| | *Lägg rad när du klistrar in annan-AI-text i § 0.* |
