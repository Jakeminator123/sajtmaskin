# MASTER-INTEGRATION-MASTERPLAN

**Datum:** 2026-05-01  
**Status:** implementation av skills 1-10 är genomförd i arbetskatalogen; ingen commit/push är gjord.  
**Syfte:** dokumentera den aktuella master-integrationen så nästa LLM eller reviewer ser vilka kontrakt som nu är portade, vilka UI/UX-invarianter som ska skyddas och vilka release-gates som måste vara gröna.

## 1. Source Of Truth

| Område | Sanning |
|---|---|
| Planunderlag | `master-integration-plans/01-*` till `10-*`, med `*-2026-05-01.txt` som senaste rapporter där de finns. |
| Kod | Repo-koden är source of truth om plan och kod skiljer sig. |
| UI/UX | Nuvarande Apple-minimal, svensk, preview-first byggar-UX ska bevaras. |
| Backend/API | Master-kontrakt för routes, SSE, verifier, env, deploy, CSP och observability ska gälla. |
| Git | Stage aldrig hela trädet blint; exkludera plans/reviews/loggar/generated data om användaren inte uttryckligen ber om dem. |

## 2. Genomförda Integrationsslice

| Skill | Implementerat |
|---|---|
| 1 Git/backend merge-scope | Konflikter lösta med backend-kontrakt från master och lokal UI/UX bevarad. |
| 2 Backend API | Stream/CRUD/media/auth/credits/deploy/domänfel hanterar nya kontrakt och bättre valideringsfel. |
| 3 Generation pipeline | Orchestration/finalize/media catalog/shrink retry/toolkit-kontrakt portade. |
| 4 Builder UI state | Minimal/expanded builder, wizard, launch readiness och nya faser bevarar lokal känsla. |
| 5 Preview runtime | Preview-session/heartbeat/postMessage/quality-gate-wiring harmoniserad. |
| 6 Data/env/config | Spec-first borttaget; manifest/schema/env-policy/docs synkade; F2/F3 quality-gate-policy uppdaterad. |
| 7 Tests verification | Env-paritetstest, public-route smoke och versions-kontrakt fixade; full test-gate grön. |
| 8 Design UX | Delade UI-primitives svenskade; preview chrome tokeniserad utan layoutförändring. |
| 9 Deploy observability | CSP tillåter Vercel Analytics/Speed Insights i prod; Vercel webhook-test täcker signatur/projekt/status/SSE. |
| 10 Synthesis | Denna masterplan uppdaterad från föråldrad plan till faktisk nuläges-/release-checklista. |

## 3. Invarianter Som Inte Får Brytas

| Domän | Bevara |
|---|---|
| Builder | `uiMode`, minimal preview-first layout, drawer/disclosure pill, `Cmd/Ctrl+K`, mobil preview/chatt-tabs. |
| Chat | En generationstråd, help-chat isolerad, F2 env mute, F3 explicit integrationsflöde. |
| Preview | `preview-starting` → `preview-ready` → `vmReady`, postMessage build-out, en viewer/heartbeat per tab, ingen extra klient mot aktivt `chatId`. |
| Design | `globals.css`/Tailwind tokens, light-lock, svensk kortcopy, inga nya hårdkodade brandfärger i produkt-UI. |
| Env | `src/lib/env.ts`, `config/env-policy.json`, manifest/schema och `.env.example` ska ändras atomiskt. |
| Security | En CSP/nonce-källa i `src/proxy.ts`; tokens, `.env*`, `.vercel/`, webhook dumps och session cookies får inte commitas. |
| Observability | Metrics token-gated, version error-log tenant-scoped, lokala NDJSON/loggar hålls utanför produktcommit. |

## 4. Release-Gate

| Gate | Status denna körning |
|---|---|
| `npm run typecheck` | Grön |
| `npm run lint` | Grön, 104 befintliga varningar |
| `npm run test:ci` | Grön |
| `npm run build` | Grön |
| `npm run test:deploy-smoke:e2e` | Grön/skippad korrekt utan E2E-env |
| Riktade suites | Stream, env/config, preview, UI, deploy/observability körda under respektive skill |

Kör om hela raden före commit/PR. Lägg till `npm run scaffolds:validate`, `npm run dossiers:validate-all` och `npm run dossiers:capability-map:check` när scaffold/dossier-data ska ingå i aktuell commit.

## 5. Commit-/PR-Scope

| Inkludera | Exkludera om inte uttryckligen begärt |
|---|---|
| Produktkod, tester, config/docs som direkt hör till integrationen. | `data/runs/**`, `logs/**`, prompt dumps, session cookies, `.env*`, `.vercel/`. |
| Nya riktade tester för kontrakt som ändrats. | `reviews/**`, audit-/planrapporter och `.cursor/skills/master-integration-*` om PR:en ska vara produktfokuserad. |
| Env-policy/docs när runtime-env ändras. | Stora genererade artefakter och lokala smoke-outputfiler. |

## 6. Manuell Smoke

| Flöde | Krav |
|---|---|
| Builder | Använd ny isolerad chat eller be användaren stänga aktiv builder-tab. |
| Init/follow-up | Stream ska nå `done`, visa rätt fastext och skapa version utan stale `Fel`. |
| Preview | Iframe ska gå från tom/progress till live; heartbeat ska använda rätt preview-session-id. |
| Build-out | Shell-ruttens build-out-postMessage ska fortfarande trigga chatten. |
| Deploy | `precheckOnly` först; missing-env ska visa tydlig 409 och inte debitera credits. |
| Domain | Link/verify använder Vercel project id; save använder intern deployment id. |
| CSP/analytics | Kontrollera report-only/enforce och `/api/csp-report` innan prod-enforce. |
| Webhooks | Testa Vercel/Stripe med staging secrets; logga inte payloads med kunddata. |

## 7. Riskregister

| Risk | Mitigation |
|---|---|
| SSE drift mellan routes och hooks | Ändra stream routes, stream-format, hooks och tester i samma slice. |
| Preview TTL/race | En session-id-källa och en viewer per tab; undvik live-builder automation mot användarens chat. |
| Stale verifier/error UI | Knyt error-log och postcheck till senaste `versionId`; visa en sammanhållen status. |
| CSP blockerar prod scripts | Håll `src/proxy.ts` som CSP-auktoritet; testa analytics/speed-insights hosts. |
| Env drift | Uppdatera env schema, policy, docs och exempel tillsammans. |
| Domän på fel Vercel-projekt | Staging-smoke och dashboard-crosscheck på `vercelProjectId`. |
| Secret/log leakage | Rotera om läckt; committa aldrig raw dumps eller secrets. |

## 8. Nästa Operativa Steg

1. Bestäm produktcommit-scope: produktkod/tester separat från plan-/reviewartefakter.
2. Kör release-gate-raden igen direkt före commit.
3. Stage path-specifikt, inte `git add .`.
4. Om PR skapas: nämn att UI/UX är bevarad, master backend/CSP/deploy-kontrakt är portade och att `test:ci` + `build` är gröna.

*Slut på `MASTER-INTEGRATION-MASTERPLAN.md` — uppdaterad efter skill 10.*
