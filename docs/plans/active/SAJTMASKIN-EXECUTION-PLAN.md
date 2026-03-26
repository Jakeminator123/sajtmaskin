# Sajtmaskin — execution plan (primär körplan)

**Syfte:** **Enda ingången** för *allt som fortfarande är fel, saknas eller ska förbättras* efter remediation-exit — spaltlista nedan. Uppdatera denna fil när en punkt levereras eller medvetet stängs med N/A.

**Kanonisk K-tabell (`[ ]` / `[x]`):** `[kritik-consolidated-open-items.md](./kritik-consolidated-open-items.md)` — uppdatera alltid när en K-rad stängs.  
**Djup berättelse, fidelity §0, acceptansrader:** `[MASTER-ALLT-KVAR.md](./MASTER-ALLT-KVAR.md)`  
**Fas A-beslut (historik, 2026-03-26):** `[../avklarat/2026-03-handoff-doc-bundle/BESLUT-INNAN-VI-GAR-VIDARE.md](../avklarat/2026-03-handoff-doc-bundle/BESLUT-INNAN-VI-GAR-VIDARE.md)`  
**Köfil i `active/queue/` (pekare, inte tom):** `[queue/BESLUT-INNAN-VI-GAR-VIDARE.md](./queue/BESLUT-INNAN-VI-GAR-VIDARE.md)`

**Verifiering efter kod:** `npm run typecheck` && `npx vitest run`

---

## 1. Alla öppna brister (spaltlista)

*Numrering = referens i commits/handoff; inte alla måste göras i ordning.*

### A–B. K-007 & K-009 (stängda 2026-03-26)

Full tabellhistorik: `[../avklarat/2026-03-26-execution-plan-K007-K009-closed.md](../avklarat/2026-03-26-execution-plan-K007-K009-closed.md)`. Aktuell K-radstatus: `[kritik-consolidated-open-items.md](./kritik-consolidated-open-items.md)`.

### C. K-018 — Preview / sandbox / `iframe` för **genererad** sajt


| #     | Brist                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Typ         | Status                                                                                                                                                                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K18-1 | **Acceptans MASTER §2:** «Fler previews startar när integrationer krävs»                                                                                                                                                                                                                                                                                                                                                                                                      | kod         | delvis [x] — `filesJson`-fallback vid tom parse + **sandbox `.env.local`:** placeholders (`40-*-placeholders.env.txt`) ∪ `getStoredProjectEnvVarMap` ∪ genererad `.env.local` (`sandbox-env-local.ts` → `startSandboxPreview`)                                                                             |
| K18-2 | **Acceptans MASTER §2:** Sandbox/runtime **primär** preview när start lyckas; shim bara fallback (inte default-upplevelse)                                                                                                                                                                                                                                                                                                                                                    | kod/produkt | delvis [x] — som ovan + **PreviewPanel**-remsa «Visa statisk» / «Byt till live-preview» när båda URL:er finns; `activeVersionAlternatePreview` kan härleda shim via `buildPreviewUrl` om listraden bara bär sandbox                                                                                        |
| K18-3 | **Acceptans MASTER §2:** UI tydligt shim ↔ runtime ↔ build OK/fail **utan** intern plattformslista i samma vy (build OK/fail delvis 2026-03-26)                                                                                                                                                                                                                                                                                                                               | kod         | delvis [x] 2026-03-26 — sandbox: samlad **tier-2**-remsa utan env-namnsdump; v0/shim: mjukare mediastorage-copy (`PreviewPanel`)                                                                                                                                                                           |
| K18-4 | **Fas 2 (kvar):** sann VM-återanvändning via SDK/plattform + ev. delat session-lager                                                                                                                                                                                                                                                                                                                                                                                          | kod         | delvis [x] — som tidigare + när `**REDIS_URL`** (ioredis) är aktiv: `sandbox-session-store` **async**-API skriver/läser `sandbox-preview:session:{chatId}` i Redis (~2 h TTL) så annan serverless-instans kan återanvända `sandboxId`; **kvar:** kall start / plattforms-SDK-heuristik utanför nyckel-JSON |
| K18-5 | **Fas 3:** adapters / degraded preview (SQLite, preview-mail, demo-auth, Redis-ersättare där det behövs)                                                                                                                                                                                                                                                                                                                                                                      | kod         | [ ]                                                                                                                                                                                                                                                                                                        |
| K18-6 | **Fas 4:** GitHub som export (inte primär persistence)                                                                                                                                                                                                                                                                                                                                                                                                                        | kod         | [ ]                                                                                                                                                                                                                                                                                                        |
| K18-7 | **Delmoment klart bl.a.:** `.env.local`-merge i sandbox; valfritt `npm run build` i sandbox; SSE `prodBuildVerified`; toast vid shim-fallback; `sandbox-session-store` + `touchSandboxSession`; `**tryResumeSandboxById`**; `POST /api/v0/chats/[chatId]/sandbox-preview`; builder **auto-warmup** (`useBuilderPageController`); se `[preview-fidelity-tiers.md](../../architecture/preview-fidelity-tiers.md)`, `[PLAN-PREVIEW-SANDBOX.md](./queue/PLAN-PREVIEW-SANDBOX.md)` | kod         | delvis [x] — **rad [ ] i kritik** tills produkt accepterar hela målbilden                                                                                                                                                                                                                                  |


### D. K-019 — Builder UX + orchestration / promptkedja


| #     | Brist                                                                                                                                                              | Typ | Status                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | -------------------------------------------------------------------------------------------------------- |
| K19-1 | Finare **merge-policy** för `orchestration_snapshot` (ersätt vs merge vs storleks-tak) — se `[PLAN-K019-PROMPT-SNAPSHOT.md](./queue/PLAN-K019-PROMPT-SNAPSHOT.md)` | kod | delvis [x] — **shallow merge** vid finalize: `{ ...previous, ...snap }` + `getChatOrchestrationSnapshot` |
| K19-2 | Ev. **UI** för snapshot / felsökning i standard vs debug-läge                                                                                                      | kod | [ ]                                                                                                      |
| K19-3 | Ev. **sync create-path** (ny chat) med samma kontinuitetsregler                                                                                                    | kod | [ ]                                                                                                      |
| K19-4 | **Delmoment klart:** Agentlogg hopfälld som standard; DB-kolumn + persist efter finalize; follow-up prependar kontinuitet; se `orchestration-snapshot.ts`          | kod | delvis [x]                                                                                               |
| K19-5 | **Delmoment 2026-03-26:** `buildIntent` ingår i prepend-text vid follow-up (färre tappade signaler)                                                                | kod | [x]                                                                                                      |


### E. Plan 17 — repo separation (öppna kryss)


| #     | Brist                                                                                                                                            | Typ    | Status       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------ |
| P17-1 | **WS-2 deferred:** v0 SDK (`src/lib/v0.ts`) — **ägarbeslut:** medvetet separat spår, ingen nära borttagning                                      | policy | [ ] medvetet |
| P17-2 | **WS-2 deferred:** `V0_API_KEY` i required env — samma beslut                                                                                    | policy | [ ] medvetet |
| P17-3 | **WS-4:** ta bort `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` ur env-schema när health/admin inte behöver dem                                     | kod    | [ ]          |
| P17-4 | **WS-4:** `ENV.md` + `config/env-policy.json` i synk med **faktisk** användning (låg prio tills K-018/K-019 stabilare)                           | doc    | [ ]          |
| P17-5 | **WS-5:** säkerställ att stora JSON (>`~1MB`) i repo hamnar i `.gitignore` / git-lfs / build-time — ny scan om nya filer tillkommer              | repo   | [ ]          |
| P17-6 | **WS-5:** `research/`-policy dokumenterad (extern rådata, inte hårdkrav för `npm run dev`) — `[research/README.md](../../../research/README.md)` | doc    | delvis [x]   |
| P17-7 | **WS-5 delmoment klart:** `docs/old/` innehåll → `avklarat/2026-03-docs-old-archive/`                                                            | doc    | [x]          |


Kryss i detalj: `[17-repo-separation-and-independence.md](./17-repo-separation-and-independence.md)`

### F. Dokumentationsluckor (repo-hygien)


| #     | Brist                                                                           | Status         |
| ----- | ------------------------------------------------------------------------------- | -------------- |
| DOC-1 | `queue/BESLUT-INNAN-VI-GAR-VIDARE.md` får **inte** vara tom — pekare till arkiv | [x] 2026-03-26 |


---

## 2. Hög konfliktrisk (undvik samma PR som tung preview-refaktor)

- `src/lib/integrations/registry.ts`, `src/lib/gen/detect-integrations.ts`
- `config/env-policy.json`, deploy-API, `useBuilderDeployActions`, builder-copy kring env/409

---

## 3. Rekommenderad ordning (typiskt)

1. **En K-id per PR** när du rör konfliktzonen.
2. **K-019** polish / merge-policy när du redan är i stream/finalize-ytor.
3. **K-018** i små delmile — env/preview/session/adapters är stort.
4. **Plan 17 WS-4/5** som **lägre risk** doc/repo när preview-kedjan inte ändras i samma PR.

*(**K-007** / **K-009** stängda 2026-03-26 — se `[kritik-consolidated-open-items.md](./kritik-consolidated-open-items.md)`.)*

---

## 4. Övriga pekare

- FAQ: `[queue/FRAGOR-SVAR-FAQ.md](./queue/FRAGOR-SVAR-FAQ.md)`
- Plan 17 öppet: `[queue/PLAN-REPO-SEPARATION-OPEN.md](./queue/PLAN-REPO-SEPARATION-OPEN.md)`
- Progress remediation: `[external-review-remediation-progress.md](./external-review-remediation-progress.md)`
- Hub: `[REMAINING-WORK.md](./REMAINING-WORK.md)`

---

## Historik


| Datum      | Vad                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-26 | Skapad; handoff-bundle arkiverad.                                                                                                                                                                                                                                                                                                           |
| 2026-03-26 | Spaltlista §1 (alla K + Plan 17 + doc); K9-scope-dok + BESLUT-pekare; K19 `buildIntent` i follow-up-prepend.                                                                                                                                                                                                                                |
| 2026-03-26 | **K-007 [x]:** auto-fix oförändrad; deploy-precheck + Vitest + route JSDoc. **K-009 [x]/[N/A]:** own-engine-sse-scope stängd; ingen extra SSE utanför W3 planerad.                                                                                                                                                                          |
| 2026-03-26 | Kod: sandbox från `filesJson` om content-parse tom; orchestration snapshot shallow-merge vid persist.                                                                                                                                                                                                                                       |
| 2026-03-26 | **K-018 delmoment:** `POST .../sandbox-preview` + builder auto-warmup (tier-1 → sandbox); `**tryResumeSandboxById`** + `versionId` i `sandbox-session-store` (VM-reuse per instans). §C K18-2/K18-4 markerade **delvis [x]**.                                                                                                               |
| 2026-03-26 | **Doc:** K-007/K-009 execution-tabeller → `[avklarat/2026-03-26-execution-plan-K007-K009-closed.md](../avklarat/2026-03-26-execution-plan-K007-K009-closed.md)`; `DOKUMENTATION-ANDRINGAR-`* → stub + `[avklarat/2026-03-doc-change-summary.md](../avklarat/2026-03-doc-change-summary.md)`. **K18-3** delvis: `PreviewPanel` tier-2-remsa. |
| 2026-03-26 | **K18-2** forts: previewpanel shim↔sandbox; `activeVersionAlternatePreview` + `buildPreviewUrl`-fallback när sandbox finns men list-`demoUrl` inte är shim.                                                                                                                                                                                 |
| 2026-03-26 | **K18-4** delmoment: Redis-backed sandbox-session (`getActiveSandboxSessionAsync` m.fl.) när `getRedis()` finns; `startSandboxPreview` använder async API.                                                                                                                                                                                  |
| 2026-03-26 | **K18-1** delmoment: sandbox `.env.local` merge (integration-placeholders + `projectEnvVars` + modellens `.env.local`).                                                                                                                                                                                                                     |


