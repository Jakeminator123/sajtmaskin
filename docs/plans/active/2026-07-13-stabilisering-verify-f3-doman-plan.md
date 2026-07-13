---
status: active
owner: unassigned
created: 2026-07-13
topic: Stabilisering — F3-env-gate (P1), en verify-ägare per F2-version, domänrester, svansar
source: Extern coach-review 2026-07-13, verifierad mot kod av 4 read-only-agenter + orkestratorläsning samma dag. Ersätter det lokala kördokumentet builder-stabilisering_9029564c.plan.md (raderat; svansar infångade i § 6).
relates_to: BUG-SWARM-BACKLOG.md (M#f3env1, M#vlane1–3, BB#299, #486-raden, BB#deploy4)
---

# Stabiliseringsplan: verify-ägarskap, F3-env-gate och domänrester

> **Leveransstatus 2026-07-13 (samma dag):** PR 1 = **#517 mergad** · PR 2 = **#518 mergad** (9 externa review-fynd triagerade: 8 fixade, 1 dismissad — se PR-kommentarerna) · PR 3 = **#519 mergad** (6 externa fynd, alla fixade — inkl. ny kanonisk `resolveCanonicalVercelProjectForDomain`). Backlog-raderna M#f3env1, M#vlane1–2, BB#299, #486 a–c och BB#deploy4 är arkiverade. **PR-sektionerna 1–3 nedan är därmed historik/kontext**, inte öppet arbete — radreferenserna gällde master `2459042eb`. Kvar i planen: PR 4 (review-freshness), PR 5 (verification-invalidation), § 6-svansarna och § 7.

## Startläge (snapshot 2026-07-13 ~08:00 — verifiera om vid start)

- `origin/master` = `2459042eb` (#514). CI grön; Vercel prod `READY` (verifierat via Vercel MCP mot #512, två docs-/test-PR:er senare).
- **Verifiera igen innan arbete:** `git fetch origin` + `gh pr list` + checks. #515 (docs/rules) var öppen vid skrivtillfället.
- Alla P1-fynd nedan är **statiskt kodverifierade** 2026-07-13 med fil:rad mot `43f1fe9`–`2459042eb` — inte bara coach-påståenden. Radreferenser kan glida någon rad när master rör sig.

## Vad som INTE görs (ägarbeslut / avgränsning)

| Inte nu | Varför |
|---|---|
| CapabilityIntentDelta / provenance-refaktor | Ägarbeslutad **deferred** (backlog § Beslut & policy, 2026-07-12). Inga nya capability-regexar eller konsument-specialfall innan dess. |
| Bred verify-rewrite | PR 2 stänger dubbelägarskapet riktat; arkitekturomtag är eget initiativ. |
| Dossier-systemet | Friskt efter #497–#502 (per-dossier mock-CI, 10-gruppsvy, delete-guard, AI-kuration inkl. mock — allt kodbekräftat). Kvar är bara etapp 7.3-residualscope (beteendetester), se § 7. |
| Prod perf-index-härdning (#496) | P2 ops, egen senare leverans (concurrency-grupp, advisory lock, `CONCURRENTLY`/ledger). |

---

## PR 1 — P1: F3 approved-provider passerar env-gaten före codegen

**Branch:** `fix/f3-approved-provider-readiness` · **Backlog:** M#f3env1

**Bekräftad kedja:** readiness körs på parent-versionens filer (`chat-message-stream-post.ts:829–833` → `tier3-readiness-gate.ts:185–198`, kravlista = enbart filbevis). En nyligen godkänd provider (t.ex. Clerk, `data/dossiers/hard/clerk-auth/manifest.json:13–22`, `enforcement: "build"`) har inga filer i parent → `requirements.length === 0` → `ok: true`. `approveRoundNeedsDossierInjection` (`:903–918`) undantar deterministisk fork → credits debiteras (`prepareCredits :1306`) → LLM-runda startar. Användaren betalar innan nyckelkravet upptäcks.

**Ordning:**
1. **Regressionstest först** (route-test): parent utan Clerk-filer + marker `suggestedProviders: ["clerk"]` + projekt utan Clerk-env + "Godkänn" → förvänta `412 tier3_env_not_ready` med Clerk-nycklar i `missingByIntegration`, ingen pipeline, inga credits, marker ej konsumerad.
2. **Fix:** union:a pending-approved-providers-spec (via befintliga `deriveTier3BuildSpecForProviderKeys`, `tier3-build-spec.ts:452–474`) med `gate.spec` innan `hasRequiredRealBuildKeys`/`prepareCredits` — antingen i routen runt `:829–888` eller som ny parameter i `checkTier3ReadinessForVersion`.

**Avgränsning:** dossierlösa providers (t.ex. posthog) behåller warn-only + generisk LLM-väg (#503/#506 — medveten policy, `tier3-build-spec.ts:556–566`). Ingen category-sibling räknas som backing provider.

---

## PR 2 — P2 (prod-bevisad): en verify-ägare per F2-version + inga false-red

**Backlog:** M#vlane1 + M#vlane2 + BB#299 (M#vlane3 kan tas här eller som liten följd-PR)

**Bekräftat nuläge:**
- `resolvePostFinalizeServerVerifyDecision` (`post-finalize-policies.ts:140–186`) skippar bara **init**; F2 follow-up med advisory ger `run=true` → fire-and-forget server-verify (`generation-stream-post-finalize.ts:606–685`, ingen `waitUntil`, ingen klient-lane-signal) parallellt/sekventiellt med klientens quality-gate. Lease är per version (kind = metadata), men sekventiell dubbelkörning + radlås gav prod-incidentens promote-`statement_timeout`.
- Promote-vägen (`quality-gate/route.ts:507–642`): ingen retry vid timeout; indeterminate-gren lämnar `verifying`.
- Watchdog (`settle-stale-verification.ts:32–79`): terminal-failar `verifying`-rad efter ~13 min även när en passerad `preflight:quality-gate`-logg finns.

**Leverans:**
1. **M#vlane1:** utöka skip-beslutet till alla F2-design-rundor (inte bara init) — klient-lanen äger F2-verify/promotion. `diagnosticOnly` får finnas kvar vid blockerande fynd men aldrig promovera/konkurrera.
2. **M#vlane2 + BB#299:** bounded retry på promote-UPDATE vid statement timeout, **och** watchdog-rekonciliering: terminal-faila inte en rad vars senaste gate-logg är grön/advisory (gäller även `promoteGuardUnavailable`-grenen).
3. **M#vlane3 (valfritt här):** `waitUntil()` runt verify+release i fire-and-forget-lanen + sweeper för utgångna `running`-leases.

**Testmatris** (saknas idag markerat): F2 init ren ✓ · F2 follow-up ren **✗** · follow-up advisory → ingen server-lane **✗** · blockerande diagnostics ✓ · F3 ✓ · repair ✓ · dubbel schemaläggning **✗** · promote-timeout → retry/reconcile, inte `failed` **✗**.

---

## PR 3 — P2: domän-PR (fyra kodverifierade rester i en liten PR)

**Backlog:** #486-raden + BB#deploy4

| Fix | Bevis | Riktning |
|---|---|---|
| A. Falskt projektnamn-lås (409 vid ren namnändring) | `deployments/route.ts:561–574` vs deploy-target `:809–815` | Härled låsets jämförelsenamn med samma logik som deploy-target |
| B. SEO-fallback går inte att rensa | `useBuilderDeployActions.ts:192–194, 402–404` (API stödjer redan `null`) | Skicka `siteUrl: null` vid tomt fält |
| C. Verifierad branded-domän omverifieras aldrig | `route.ts:1222` (`!brandedDomainVerifiedAt`) — custom-domän recheckas, branded inte | Ta bort villkoret, behåll throttle; rensa bara vid definitivt false |
| D. BB#deploy4 implicit orphan | Låset kräver explicit `projectName` (`:572`); fallback `sajtmaskin-${chatId}` (`:807–814`) vs domän-resolverns `getLatestVercelProjectIdForChat` | Härled lås + deploy-target från samma källa som domän-resolvern |

Obs: `resolve-vercel-project.ts` ligger i `src/lib/domains/`, inte `src/lib/deploy/`.

---

## PR 4 — P2 process: review-freshness

Befintlig backlograd (sign-off/merge-freshness). Krav: `merge:ready`-sign-off bär head-SHA + timestamp + senaste bot-review-referens; ny botkommentar efter sign-off invaliderar labeln; merge-agenten verifierar. Implementeras som lättviktigt checkjobb eller utökning av `review-window.yml` + `pr-merge-review-gate.mdc`.

## PR 5 — P2: verification-invalidation som ett revisionskontrakt

Två syskonrader (Codex på #352, båda i Aktiv kö): status-bussen nollställs inte och stale `quality_gate_result=passed`-telemetri överlever `invalidateVerification`. Fixas **tillsammans**: invalidering ska atomiskt träffa DB-state + bus-projektion + telemetrisignal för samma innehållsrevision. Ägare: `chat-repository-pg.ts` + `stale-verification.ts` + promote-guard-läsningen.

---

## § 6 — Svansar från builder-stabilisering-kördokumentet (små, separata)

Kördokumentet `builder-stabilisering_9029564c.plan.md` är raderat; detta är kvarvarande delta (spår A follow-up-dubbelredovisning och spår E prewarm är **landade**, #485 resp. #480/#484):

| Rest | Läge | Kvar att göra |
|---|---|---|
| B-slut: F3-kravyta | `F3RequirementsSurface` finns (`BuilderShellContent.tsx:799–810`), trigger utan toast | `ProjectEnvVarsPanel` i integrations-läge + Byggblock-popover-städ; `capture-and-triage`-todo (knyt observerad F3-körning till chatId/versionId/`missingByIntegration`) |
| C-slut: scoped `.env.local` | Scopad när `selectedDossierEnvKeys` sätts (`project-scaffold.ts:630–654`) | Ta bort full-katalog-fallbacken (`selectedKeys === undefined`) när alla vägar trådar scope |
| D-slut: `configured`-källa | Huvudvägen läser projektets env-karta | Init-vägen tom (`create-chat-stream-post.ts:726`) + `process.env`-fallback kvar (`select.ts:153–154`) |
| Single-canary | pending | En prod-kontroll (Byggblock-val → F2 → follow-up → F3 → release-status) efter PR 1–2 |

## § 7 — Parallella/senare spår (ej denna plan)

- **Backoffice-stringens refresh-handoff** — redan aktiv egen plan (`2026-07-13-backoffice-stringens-refresh-handoff.md`).
- **Dossier etapp 7.3-residual:** beteendetester per hard-dossier (mock mountar utan krasch) + aktiverings-E2E.
- ~~Ospårade dossier-docs/tester~~ — löst: `docs/contracts/dossier-system.md`, stream-/post-finalize-testsviterna m.fl. är spårade på master sedan #503–#514.
- Prod perf-index-härdning (#496), preview-host-kapacitet (M#fly1), övriga P2/P3 i backloggen.

## Verifiering per PR

`npm run typecheck` · `npm run lint` · riktade `npx vitest run` · `npm run test:followup-contract` vid follow-up/F3-ändring · `node scripts/dev/check-bug-backlog.mjs` vid backlog-ändring · Bugbot-pass på slutlig head-SHA före push · `review-window` ≥ 7 min (admin-merge bypassar checken — verifiera åldern manuellt då).

## Avvikelser mot coach-rapporten (granskad, i huvudsak korrekt)

| Coach sa | Verkligt läge |
|---|---|
| 0 öppna PR:er | #513 (docs) öppnades 18 min efter coachens koll — ofarligt, men "verifiera igen vid start" gäller |
| CapabilityIntentDelta som punkt 5 i arbetslistan | Redan ägarbeslutad deferred — står under "görs inte", inte i kön |
| P1-kandidaten "starkt kodindikerad, ej bevisad" | Nu **kodverifierad** hela kedjan (se PR 1) — testet är fortfarande första steget |
| M#vlane-prioritet efter P1-testet | Bekräftad; backloggen klassar dem P2 men prod-incidenten gör dem till huvudleverans |
