---
id: gm-omrade-05-followup-och-preview-kontrakt
status: active
created: 2026-06-18
linear: null
parent: gm-00-master-plan
supersedes: null
---

# Område 5 — Follow-up & preview-kontrakt (Nivå 2)

**Nivå 1:** [`00-master-plan.md`](00-master-plan.md) · **Wave 2** · **Beroende:** område 1
**Yt-karta:** [`docs/architecture/llm-callsite-matrix.md`](../../../architecture/llm-callsite-matrix.md) (kluster E + verifierade fynd F1/F2).

## Syfte
Produktens hjärta: en `FollowUpContract` som hindrar follow-up från att omedvetet byta
scaffold, tappa route, tappa capability eller bygga på fel version.

## Yta (owner-surface — verifierad mot HEAD `cccc843dd`, 2026-06-19)
- **Kontrakt-byggare (naturlig hook):** `src/lib/api/engine/chats/follow-up-orchestration-input.ts:54-125` — samlar redan brief, scaffold, variant, routes, capabilities, quality.
- **Ingress-gate:** `src/lib/api/engine/chats/chat-message-stream-post.ts:332-347` (efter `resolveFollowUpPreviousFiles`, före `resolveOrchestrationBase`).
- **Bas-resolve:** `src/lib/gen/version-manager.ts:82-133` (idag: tyst accept av explicit `engineBaseVersionId`).
- **Snapshot/brief:** `src/lib/gen/orchestration-snapshot.ts:257-307` (`buildFollowUpBriefFromSnapshot`).
- **Frysning idag (spridd):** scaffold `orchestrate.ts:488-522` · variant `scaffold-variants/matcher.ts:46-80` · routes `route-plan/route-plan-builder.ts:50-86` · quality `orchestrate/policy-helpers.ts:85-109`.
- **Preview-pinning:** `src/lib/gen/preview/session-store.ts:14-23` + `preview-session/route.ts` + `preview-heartbeat/route.ts:64-72` (redan 1 session/`chatId` med `versionId`+`previewSessionId`).
- **F3-referens (mönster för 409):** `src/app/api/engine/chats/[chatId]/finalize-design/route.ts:126-143` (returnerar redan 409 vid stale bas).

## Kontraktsfält — nuläge vs gap (kluster E)
| Fält | Finns idag | Skydd idag | Gap |
|---|---|---|---|
| `baseVersionId` | delvis | resolve via `version-manager.ts:110-133` | **Ingen stale-gate i strömmen (F2)** — bygger tyst på fel version |
| `snapshotBrief` | delvis | `buildFollowUpBriefFromSnapshot` | Tom snapshot → `brief:null` → capabilities kan tappas; clear-redesign-delta når ej orchestrate (**F1**) |
| `scaffoldId` (fryst) | delvis | `persisted` i orchestrate | `scaffoldMode:"manual"`+`meta.scaffoldId` kringgår (`orchestrate.ts:503-504`) |
| `variantId` (fryst) | delvis | `lockedVariantForFollowUp` | clear-redesign släpper (avsett); saknad snapshot → default ej 409 |
| `routePlan` (fryst utom clear-redesign) | delvis | `useFollowUpFreeze` | Fryst mot **filer från basversion** → fel bas = fel routes; LLM kan radera filer i merge |
| `capabilities` | delvis | brief→inferred→caller-merge | Ej fryst lista; init-capabilities kan tappas tyst |
| `qualityTarget` (kan bara höjas) | **ja** | `inheritQualityTargetFromPriorVersion` | Ingen explicit kontraktsvalidering, men sänkning blockeras |
| `previewSessionId` | delvis | exakt match i heartbeat/status | Ingår ej i follow-up-kontraktet; ingen validering vid follow-up-start |

## Klart när
Follow-up kan aldrig omedvetet byta scaffold/tappa route/bygga på fel version;
stabilitetstest låser det. Stale basversion ger serverfel (409), inte tyst bygge.

> **STATUS 2026-06-21 — kärnan klar (~Område 5 stängt).** "Klart när"-kriterierna uppfyllda: scaffold/variant-frys (5-3) + route hard-clamp (5-3b) + capability-floor (5-5) + stale-base-409 (5-2) + clear-redesign-delta-brief (5-4), alla **blockerande CI-gatade** (5-7, #176). **5-6 previewSessionId parkerad** (tunt; värdefull re-pin-efter-finalize-variant = backlog). 5-Z (doc-drift) klar. Återstår som backlog: re-pin-varianten + F4/F5 + vestigial nominerings-kod.

## Nivå 3 — aktiviteter (skapade 2026-06-19, körordning)
Smal `owner_files` var; sekventiella beroenden via `blocked_by`. Detaljspec skapas just-in-time per aktivitet (5-1..5-5 + 5-3b finns; 5-6/5-7 + 5-Z stubbas när de är på tur).

| ID | Aktivitet | blocked_by | Risk | Owner (grovt) | Status |
|---|---|---|---|---|---|
| [5-1](aktiviteter/5-1-followup-contract-type.md) | `FollowUpContract`-typ + builder (konsolidera spridd frysning till ett explicit objekt; additivt, härlett ur befintlig input) | — | Låg–medel | `orchestration-snapshot.ts` (ny typ) + `follow-up-orchestration-input.ts` | **Klar** (#165) |
| [5-2](aktiviteter/5-2-stale-baseversion-409.md) | Stale-`baseVersionId`-gate i follow-up-strömmen → **409** (spegla `finalize-design`) | 5-1 (delar gate-yta) el. fristående | **Medel (runtime/korrekthet)** | `chat-message-stream-post.ts:332-347` (+ `version-manager.ts`) | **Klar** (#166) |
| [5-3](aktiviteter/5-3-frys-enforcement.md) | Frys-enforcement: stäng `scaffoldMode:"manual"`-kringgång; scaffold/variant via kontraktet (route = drift-signal, ej hård clamp) | 5-1 | Medel | `orchestrate.ts:488-522`, `matcher.ts:46-80` | **Klar** (#168) |
| [5-3b](aktiviteter/5-3b-route-hard-clamp.md) | Hård route-clamp + explicit route-removal (route blir floor, ej bara drift-signal); clear-redesign + explicit removal undantag | 5-3 | Medel | `orchestrate.ts` (`enforceFollowUpRouteFreeze`) | **Klar** (#172) |
| [5-4](aktiviteter/5-4-clear-redesign-delta-brief.md) | F1-fix: clear-redesign-delta-brief når orchestrate | 5-1 | Medel | `chat-message-stream-post.ts:436-490`, `follow-up-orchestration-input.ts:82-84` | **Klar** (#169) |
| [5-5](aktiviteter/5-5-capabilities-can-only-grow.md) | Capabilities can-only-grow / aldrig tyst tappa (floor-union efter prompt-filter) | 5-1 + 5-3 | Medel | `orchestrate.ts` (`enforceFollowUpCapabilityFloor`) | **Klar** (#174) |
| 5-6 | `previewSessionId` in i kontraktet + validering vid follow-up-start | 5-1 | Låg–medel | `preview-session/route.ts`, kontrakt | **Parkerad** (tunt/redundant — kontraktet bär redan fältet; preview-routen version-pinnar redan vid session-start. Den värdefulla "preview re-pinnar till nya versionen efter follow-up-finalize / anti-stale-falsk-grön"-varianten = egen scopad backlog) |
| 5-7 | Follow-up-kontrakt-invarianter → blockerande CI (lane-promotion) | 5-1..5-5 | Låg (test) | `package.json`, `.github/workflows/ci.yml` | **Klar** (#176) |
| 5-Z | Z-städ: LLM-karta/flowchart-synk, doc-drift F1/F2/F3 + nominerings-drift rättad | 5-1..5-7 | Låg | docs | **Klar** (2026-06-21) |

**Hård route-clamp + explicit route-removal — byggd & mergad som 5-3b (#172, 2026-06-20):** route är nu **floor** (ej bara drift-signal) — en tyst tappad fryst route återinförs; clear-redesign + explicit route-removal är undantag. Coachens nästa prioritet = capability single-source (5-5), sedan preview-session/version-pinning + finalize/readiness-kontrakt.
