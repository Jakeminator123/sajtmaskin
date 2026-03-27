# Project state & backlog (kanonisk)

**En fil** = operativ sanning för *vad som är kvar*, *hur vi tänker*, och *var kod/docs finns*. Uppdatera här när du levererar eller stänger en rad.  
**Verifiering efter kod:** `npm run typecheck` && `npx vitest run` · valfritt deploy-smoke: `e2e/README.md`.

**Senast:** 2026-03-27 · **Gamla planhandoff:ar / %-historik:** `git log`, `docs/plans/avklarat/README.md`

---

## 1. Produktintent (kort)

- **Engelsk kanon:** [`.j_to_agent/fidelity.txt`](../../../.j_to_agent/fidelity.txt)
- **I korthet:** Användaren ska *skriva önskemål → få körbar preview* utan att bli intern orkestratör. **Sandbox** (`npm install` + `npm run dev`) är **primär** preview när runtime startar; **shim** är fallback; **`npm run build`** i sandbox är **egen** signal (deploy-paritet), inte samma som «preview känns levande». **Preflight/quality gate** är ett **tredje lager** — rivs inte.

---

## 2. Arkitektur (var sanningen finns)

| Behov | Fil / plats |
|--------|-------------|
| System / builder | [`docs/architecture/system-overview.md`](../../architecture/system-overview.md) |
| Generation, SSE | [`docs/architecture/builder-generation.md`](../../architecture/builder-generation.md) |
| Preview, sandbox, deploy | [`docs/architecture/preview-deploy.md`](../../architecture/preview-deploy.md) · arkiv: [`preview-and-sandbox-flow.md`](../../architecture/archive/pre-2026-03-consolidation/preview-and-sandbox-flow.md), [`preview-fidelity-tiers.md`](../../architecture/archive/pre-2026-03-consolidation/preview-fidelity-tiers.md) |
| Mappar, scaffold vs v0-templates | [`docs/architecture/repository-and-platform.md`](../../architecture/repository-and-platform.md) |
| Env | [`docs/ENV.md`](../../ENV.md), `config/env-policy.json` |
| Ordlista (agenter) | [`.cursor/rules/terminology.mdc`](../../../.cursor/rules/terminology.mdc) |

**Kod (preview/sandbox):** `src/lib/gen/sandbox-preview.ts`, `sandbox-env-local.ts`, `generation-stream.ts`, `finalize-version.ts`, `PreviewPanel.tsx`, `stream-handlers.ts`, `sandbox-session-store` (Redis om `REDIS_URL`).

---

## 3. Tre lager (får inte kollapsas)

1. **Preflight** — befintlig quality gate (reparation, sanity, SEO/route).  
2. **Sandbox `dev`** — huvudfidelity för «levande» preview.  
3. **`npm run build`** — separat verifiering / deploy-paritet.

---

## 4. K-rader — status (kort)

| ID | Innehåll | Status |
|----|-----------|--------|
| **K-018** | Preview/sandbox/`iframe` för **genererad** sajt — env-merge, session, shim↔sandbox, adapters, export | **[ ]** öppen — delmoment klara i kod; se §6–§8 |
| **K-019** | Builder UX + **orchestration snapshot** / promptkedja (merge-policy, ev. UI, sync create-path) | **[ ]** öppen — DB + shallow merge + follow-up prepend m.m. levererat; se §7 |
| K-007 | Deploy auto-fix / preflight | **[x]** 2026-03-26 — policy oförändrad; `deploy-precheck` (arkiv) + Vitest |
| K-008 | Landning | **[x]** — fryst; fokus användarsidor |
| K-009 | SSE utanför W3 | **[x]/[N/A]** — `own-engine-sse-scope.md` (arkiv); nytt behov → ny rad |
| K-014 | Juridik/cookies | **[x]** — copy OK oförändrat |

*Detaljerad kritik-historik och batch-loggar fanns i äldre `kritik-consolidated-*`; uppdatera **denna tabell** när något ändras.*

---

## 5. K-018 — öppna delmoment (spaltlista)

| # | Brist | Status |
|---|--------|--------|
| K18-1 | Env-merge → `.env.local`, placeholders, `projectEnvVars` | delvis [x] |
| K18-2 | Sandbox primär preview; shim fallback | delvis [x] |
| K18-3 | UI: tydlig shim ↔ runtime ↔ build utan intern plattformslista | delvis [x] |
| K18-4 | VM-återanvändning / plattforms-SDK / Redis session | delvis [x]; kvar: kall start-heuristik |
| K18-5 | Fas 3: adapters / degraded preview (SQLite, preview-mail, demo-auth, …) | [ ] |
| K18-6 | Fas 4: GitHub export (ej primär persistence) | [ ] |
| K18-7 | Övrigt klart (merge, build i sandbox, SSE, session store, warmup, …) | delvis [x]; rad [ ] tills produkt accepterar hela målbilden |

---

## 6. K-018 — faser (översikt)

| Fas | Innehåll |
|-----|----------|
| **1** | Env → `.env.local`, `npm install`, `npm run dev`; `npm run build` separat status |
| **2** | Session-varm sandbox, idle ~30 min, cap ~2 h, Redis när finns |
| **3** | Adapters / degraded preview för integrationer som behöver mer än placeholders |
| **4** | GitHub som export |

---

## 7. K-019 — öppna delmoment

| # | Brist | Status |
|---|--------|--------|
| K19-1 | Merge-policy för `orchestration_snapshot` (ersätt/merge/tak) | delvis [x] shallow merge |
| K19-2 | Ev. UI för snapshot / debug | [ ] |
| K19-3 | Ev. sync create-path (ny chat) med samma kontinuitet | [ ] |
| K19-4 | Agentlogg hopfälld; DB-kolumn; follow-up prepend | delvis [x] |
| K19-5 | `buildIntent` i prepend | [x] |

---

## 8. Plan 17 — vad som återstår

**Levererat:** WS-1–WS-4 kärna, **WS-6** beslutad (D-ID `/avatar`, OpenClaw; Brave/Loopia optional).  
**Kvar / deferred:**

| # | Punkt | Status |
|---|--------|--------|
| P17-1 | v0 SDK (`src/lib/v0.ts`) medvetet kvar | policy [ ] medvetet separat |
| P17-2 | `V0_API_KEY` i required env | samma |
| P17-3 | Rensa `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` ur schema när policy klar | [ ] |
| P17-4 | `ENV.md` + `env-policy.json` i synk | doc [ ] låg prio |
| P17-5 | Stora JSON → `.gitignore` / LFS / build-time | repo [ ] |
| P17-6 | `research/`-policy | delvis [x] — se `research/README.md` |
| P17-7 | `docs/old/` flytt | [x] |

**Skilj på:** *external-review remediation 100%* (historisk våg) vs *Plan 17* (arkitektur/städ) — båda kan vara «klara» i olika bemärkelser.

---

## 9. Hög konfliktrisk (undvik tung preview-refaktor + deploy i samma PR)

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`
- `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kring env/409

**Rekommenderad ordning:** en K-id per PR i konfliktzonen · K-019-polish när du redan rör stream/finalize · K-018 i små steg · Plan 17 doc/repo när preview-kedjan är lugn.

---

## 10. External review & remediation (historik)

Grundspåret W1–W5 byggde på exportfiler **`.j_to_agent/1.txt`–`3.txt`** (extern granskning). De kan vara **borttagna** i din arbetskopia — återställ med `git show <commit>:.j_to_agent/1.txt` m.m. om du behöver originaltext.

*Remediation exit* är levererad. Detaljerade %-tabeller, «Last code touch» och orchestrator-snapshots fanns i **`external-review-remediation-progress.md`** m.m. — **inte längre separata filer** i `active/`; återfinns i **git-historik** (`docs/plans/avklarat/`, äldre commits).

---

## 11. Beslut att minnas

- **Own-engine** default; **v0 SDK / mall-API** medvetet **separata** spår.  
- **Vercel-templates** (research) ≠ **v0-templates** (builder gallery) — se `terminology.mdc`.  
- **ENV-städ** efter att K-018/K-019 stabiliserats.

---

## 12. Git- och agentrutin

- Före `git push`: `git fetch` && `git pull` (rebase om ni kör så).  
- Om `.cursor/agent-intents/BOARD.md` finns: läs `active`-rader; stage:a bara din sessions filer.  
- Regel: [`.cursor/rules/session-git-docs.mdc`](../../../.cursor/rules/session-git-docs.mdc)

---

## 13. Relaterat (utan extra planfiler)

- Nav i `docs/`: [`docs/README.md`](../../README.md)  
- Kritikfiler / repro: [`.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md`](../../../.j_to_agent/structure_bugs_and_parralells/kritik/KRITIK-OVERVIEW.md)  
- Arkiverade kritik-snapshots: [`.j_to_agent/archive/kritik-addressed/`](../../../.j_to_agent/archive/kritik-addressed/README.md)
