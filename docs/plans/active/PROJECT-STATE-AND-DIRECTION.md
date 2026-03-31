# Project state & backlog (kanonisk)

**En fil** = operativ sanning för *vad som är kvar*, *hur vi tänker*, och *var kod/docs finns*. Uppdatera här när du levererar eller stänger en rad.  
**Verifiering efter kod:** `npm run typecheck` && `npx vitest run` · valfritt deploy-smoke: `e2e/README.md`.

**Senast:** 2026-03-30 · **Gamla planhandoff:ar / %-historik:** `git log`, `docs/plans/avklarat/README.md` · *LLM-pipeline runbook (Del B) ligger arkiverad under [`avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md`](../avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md).*

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
| LLM-pipeline milstolpe + review-körlista (arkiv) | [`avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md`](../avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md) |
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
| Läcka stängd: `demoUrl` vs `sandboxUrl` (GET chat/versions + versionval i builder + quality-badges) | [x] 2026-03-30 |
| Adapters / «degraded preview» för vissa integrationer (mer än placeholders) | [ ] |
| GitHub-export som **sekundär** väg (persistens = fortfarande Postgres / `files_json`) | [ ] |
| Ev. kallstarts-heuristik för VM / session | delvis |
| Massstädning efter warm-sandbox / preview-lifecycle (död kod, planfiler, docs, DB-fas) | [ ] — körplan: [`STORDSTAD-repo-kod-databas.md`](./STORDSTAD-repo-kod-databas.md) |
| API-kontrakt: publika svar med `previewUrl` endast; inbound legacy via `resolveInboundPreviewUrl` | [x] 2026-03-30 — [`KORPLAN-preview-url-api.md`](../avklarat/KORPLAN-preview-url-api.md) (arkiverad) |

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
| P17-1 | v0 SDK (`src/lib/v0.ts`) | [x] borttagen |
| P17-2 | `V0_API_KEY` i required env | [x] borttagen ur runtime |
| P17-3 | Rensa `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` ur schema när policy klar | [ ] |
| P17-4 | `ENV.md` + `env-policy.json` i synk | doc delvis [x] — `ENV.md` förkortad 2026-03-30 (kanon = `env.ts` + policy); policy-jämförelse låg prio |
| P17-5 | Stora JSON → `.gitignore` / LFS / build-time | repo [ ] |
| P17-6 | `research/`-policy | delvis [x] — se `research/README.md` |
| P17-7 | `docs/old/` flytt | [x] |
| P17-8 | Naming debt: `v0ChatId`, `v0ProjectId`, `v0_*` DB-fält, `/api/v0/`-prefix | deferred — intern naming rensas löpande; payload-/DB-kontrakt bryts inte utan migrationsplan |
| P17-9 | Root-verktyg till `scripts/env/` och `scripts/manual/` | [x] — wrappers i roten |
| P17-10 | Shadcn-moduler grupperade under `src/lib/shadcn/` | [x] — re-exporter |

**Skilj på:** *external-review remediation 100%* (historisk våg) vs *Plan 17* (arkitektur/städ) — båda kan vara «klara» i olika bemärkelser.

---

## 8. Hög konfliktrisk (undvik tung preview-refaktor + deploy i samma PR)

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`
- `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kring env/409

**Rekommenderad ordning:** små PR:ar i konfliktzonen · K-019-polish när du redan rör stream/finalize · Plan 17 doc/repo när preview-kedjan är lugn.

---

## 9. External review & remediation (historik)

Extern granskning och remediation är **införlivad** i kod och i [`preview-deploy.md`](../../architecture/preview-deploy.md) (§ Levererat). Detaljerade %-tabeller, orchestrator-körningar och gamla handoff-filer återfinns i **git-historik** (`docs/plans/avklarat/`, äldre commits) — inga separata aktiva kördokument med gamla plan-ID:n.

**LLM-pipeline (runbook Del B):** **Stängd** 2026-03-30 (B1–B4), dokument i [`avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md`](../avklarat/LLM-PIPELINE-MILESTONE-AND-REVIEW-RUNBOOK.md). Kod/detaljer: [`builder-generation.md`](../../architecture/builder-generation.md), `finalize-pipeline-contract.ts`, `builder-stream-contract.ts`.

---

## 10. Beslut att minnas

- **Own-engine** default och enda codegen-väg. `v0-sdk` och `V0_API_KEY` borttagna.  
- **«v0» i repot** har tre distinkta betydelser: (1) API-versionering, (2) naming debt, (3) template-källa — se `terminology.mdc`.  
- **Vercel-templates** (research) ≠ **v0-templates** (builder gallery) — se `terminology.mdc`.  
- **ENV-städ** periodiskt när K-019 / Plan 17-punkter rör env-policy.
- **Export-pipeline** kanoniserad via `buildExportableProject()` — alla nedladdnings-/verifieringsvägar går genom samma funktion.  
- **Sandbox-policy** centraliserad i `src/lib/mcp/runtime-url.ts` — quality-gate och sandbox-routes delar helpers (`isSafeRelativePath`, `resolveSandboxTemplateGitUrl`).  
- **Template-katalog:** server/pages importerar `@/lib/templates/template-data` och/eller `@/lib/templates/template-catalog`; klient säkra exports via `@/lib/templates/client` (ingen gemensam `index`-barrel).  
- **Template-library runtime guidance:** system prompt bygger nu regelstyrd reference guidance (`style rules`, `section inventory`, `avoid patterns`, `world-class rubric`) från template-katalogen före kodsnippets, och scaffold/template-taxonomy valideras hårdare i test/runtime.  
- **Bildpolicy** synkad: genererad `next.config` vitlistar inte längre hosts som prompten förbjuder.  
- **Generation fan-in** kanoniserad via `GenerationInputPackage` + `computeLineageHash()` i `src/lib/gen/generation-input-package.ts`.  
- **BuildSpec** bär nu ett litet styrande lager i orchestration (`src/lib/gen/build-spec.ts`) för `generationMode`, `changeScope`, `contextPolicy`, `previewPolicy` och `verificationPolicy`; narrow follow-ups kan därför köra lättare kontext och snabbare finalize.  
- **Server-verify** (`src/lib/gen/server-verify.ts`) triggas automatiskt efter finalize; kör quality gate + capped repair (max 2 pass). Verification state `repairing` synlig i UI.  
- **Server repair** är default efter quality-gate-fel; klientautofix fallback. `__SAJTMASKIN_SKIP_SERVER_REPAIR__` opt-out ersätter gammal opt-in.  
- **v0Stream.ts** och **gen/fallback.ts** borttagna (inga runtime-konsumenter).  
- **Builder preview-URL i klientstate:** `currentPreviewUrl` / `setCurrentPreviewUrl` (`useBuilderState`, stream-handlers, VM) — inte `currentDemoUrl`. Publika API-svar använder `previewUrl` (ingen `demoUrl` i svar); se [`KORPLAN-preview-url-api.md`](../avklarat/KORPLAN-preview-url-api.md).  
- **Handoff-dokument** under `docs/handoffs/*.md` är **borttagna**; fulltext finns i **git-historik**. Pekare: [`docs/handoffs/README.md`](../../handoffs/README.md). Öppna gap och nästa steg styrs här (§4–§7) och i [`preview-deploy.md`](../../architecture/preview-deploy.md).

---

## 11. Git- och agentrutin

- Git-hygien, staging och docs: [`.cursor/rules/session-git-docs.mdc`](../../../.cursor/rules/session-git-docs.mdc).
- Efter städning eller större refaktor: [`.cursor/rules/cleanup-and-scope.mdc`](../../../.cursor/rules/cleanup-and-scope.mdc).
- Innan `git push`: synka med fjärr (`fetch` / `pull` eller rebase enligt teamets vanor) så du inte skriver över andras arbete av misstag.

## 12. Relaterat

- Nav i `docs/`: [`docs/README.md`](../../README.md)  
- Preview / sandbox (kanon): [`docs/architecture/preview-deploy.md`](../../architecture/preview-deploy.md)  
- Agentflöden: [`docs/contributing/agent-workflows.md`](../../contributing/agent-workflows.md)
