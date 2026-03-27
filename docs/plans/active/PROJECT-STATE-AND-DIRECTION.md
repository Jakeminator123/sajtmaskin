# Project state & backlog (kanonisk)

**En fil** = operativ sanning för *vad som är kvar*, *hur vi tänker*, och *var kod/docs finns*. Uppdatera här när du levererar eller stänger en rad.  
**Verifiering efter kod:** `npm run typecheck` && `npx vitest run` · valfritt deploy-smoke: `e2e/README.md`.

**Senast:** 2026-03-27 · **Gamla planhandoff:ar / %-historik:** `git log`, `docs/plans/avklarat/README.md`

---

## 1. Produktintent (kort)

- **Preview-kedja (operativt kördokument):** [`docs/architecture/preview-deploy.md`](../../architecture/preview-deploy.md) — inkl. § *Levererat* (vad som är implementerat och var i kod).
- **I korthet:** Användaren ska *skriva önskemål → få körbar preview* utan att bli intern orkestratör. **Sandbox** (`npm install` + `npm run dev`) är **primär** preview när runtime startar; **shim** är fallback; **`npm run build`** i sandbox är **egen** signal (deploy-paritet), inte samma som «preview känns levande». **Preflight/quality gate** är ett **tredje lager** — rivs inte.

---

## 2. Arkitektur (var sanningen finns)

| Behov | Fil / plats |
|--------|-------------|
| Var finns vad (rot-träd, `data/` vs codegen-data) | [`docs/architecture/repo-tree.md`](../../architecture/repo-tree.md) |
| System / builder | [`docs/architecture/system-overview.md`](../../architecture/system-overview.md) |
| Generation, SSE | [`docs/architecture/builder-generation.md`](../../architecture/builder-generation.md) |
| Preview, sandbox, deploy | [`docs/architecture/preview-deploy.md`](../../architecture/preview-deploy.md) |
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
| **Preview / sandbox** | Own-engine → finalize → tier-1 shim → tier-2 sandbox → iframe; HTTP; bootstrap; env-merge vid `startSandboxPreview` | **[x]** — se [`preview-deploy.md` § Levererat](../../architecture/preview-deploy.md#levererat-preview-kedjan); återstående spår i §5 nedan |
| **K-019** | Builder UX + **orchestration snapshot** / promptkedja (merge-policy, ev. UI, sync create-path) | **[ ]** öppen — DB + shallow merge + follow-up prepend m.m. levererat; se §6 |
| K-007 | Deploy auto-fix / preflight | **[x]** 2026-03-26 — policy oförändrad; `deploy-precheck` (arkiv) + Vitest |
| K-008 | Landning | **[x]** — fryst; fokus användarsidor |
| K-009 | SSE utanför W3 | **[x]/[N/A]** — `own-engine-sse-scope.md` (arkiv); nytt behov → ny rad |
| K-014 | Juridik/cookies | **[x]** — copy OK oförändrat |

---

## 5. Preview — återstående (ej samma som «core kedja»)

Kärnan preview/sandbox är **levererad** (se `preview-deploy.md`). Detta är **vidare** produkt/teknik:

| Spår | Status |
|------|--------|
| Adapters / «degraded preview» för vissa integrationer (mer än placeholders) | [ ] |
| GitHub-export som **sekundär** väg (persistens = fortfarande Postgres / `files_json`) | [ ] |
| Ev. kallstarts-heuristik för VM / session | delvis |

Tier-modell (preflight / dev / build) och förenklad fasöversikt finns i [`preview-deploy.md`](../../architecture/preview-deploy.md) under **Begrepp**.

---

## 6. K-019 — öppna delmoment

| # | Brist | Status |
|---|--------|--------|
| K19-1 | Merge-policy för `orchestration_snapshot` (ersätt/merge/tak) | delvis [x] shallow merge |
| K19-2 | Ev. UI för snapshot / debug | [ ] |
| K19-3 | Ev. sync create-path (ny chat) med samma kontinuitet | [ ] |
| K19-4 | Agentlogg hopfälld; DB-kolumn; follow-up prepend | delvis [x] |
| K19-5 | `buildIntent` i prepend | [x] |

---

## 7. Plan 17 — vad som återstår

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

## 8. Hög konfliktrisk (undvik tung preview-refaktor + deploy i samma PR)

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`
- `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kring env/409

**Rekommenderad ordning:** små PR:ar i konfliktzonen · K-019-polish när du redan rör stream/finalize · Plan 17 doc/repo när preview-kedjan är lugn.

---

## 9. External review & remediation (historik)

Extern granskning och remediation är **införlivad** i kod och i [`preview-deploy.md`](../../architecture/preview-deploy.md) (§ Levererat). Detaljerade %-tabeller, orchestrator-körningar och gamla handoff-filer återfinns i **git-historik** (`docs/plans/avklarat/`, äldre commits) — inga separata aktiva kördokument med gamla plan-ID:n.

---

## 10. Beslut att minnas

- **Own-engine** default; **v0 SDK / mall-API** medvetet **separata** spår.  
- **Vercel-templates** (research) ≠ **v0-templates** (builder gallery) — se `terminology.mdc`.  
- **ENV-städ** periodiskt när K-019 / Plan 17-punkter rör env-policy.

---

## 11. Git- och agentrutin

- Före `git push`: `git fetch` && `git pull` (rebase om ni kör så).  
- Om `.cursor/agent-intents/BOARD.md` finns: läs `active`-rader; stage:a bara din sessions filer.  
- Regel: [`.cursor/rules/session-git-docs.mdc`](../../../.cursor/rules/session-git-docs.mdc)

---

## 12. Relaterat

- Nav i `docs/`: [`docs/README.md`](../../README.md)  
- Preview / sandbox (kanon): [`docs/architecture/preview-deploy.md`](../../architecture/preview-deploy.md)  
- Agentflöden: [`docs/contributing/agent-workflows.md`](../../contributing/agent-workflows.md)
