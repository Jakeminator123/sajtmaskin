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

## Nivå 3 — aktiviteter (skapade 2026-06-19, körordning)
Smal `owner_files` var; sekventiella beroenden via `blocked_by`. Detaljspec skapas just-in-time per aktivitet (5-1 + 5-2 finns; 5-3..5-7 stubbas när de är på tur).

| ID | Aktivitet | blocked_by | Risk | Owner (grovt) | Status |
|---|---|---|---|---|---|
| [5-1](aktiviteter/5-1-followup-contract-type.md) | `FollowUpContract`-typ + builder (konsolidera spridd frysning till ett explicit objekt; additivt, härlett ur befintlig input) | — | Låg–medel | `orchestration-snapshot.ts` (ny typ) + `follow-up-orchestration-input.ts` | **ready** |
| [5-2](aktiviteter/5-2-stale-baseversion-409.md) | Stale-`baseVersionId`-gate i follow-up-strömmen → **409** (spegla `finalize-design`) | 5-1 (delar gate-yta) el. fristående | **Medel (runtime/korrekthet)** | `chat-message-stream-post.ts:332-347` (+ `version-manager.ts`) | **ready (högst korrekthetsvärde)** |
| 5-3 | Frys-enforcement: stäng `scaffoldMode:"manual"`-kringgång; scaffold/variant via kontraktet | 5-1 | Medel | `orchestrate.ts:488-522`, `matcher.ts:46-80` | stub |
| 5-4 | F1-fix: clear-redesign-delta-brief ska nå orchestrate (eller tas bort om medvetet) | 5-1 | Medel | `chat-message-stream-post.ts:436-490`, `follow-up-orchestration-input.ts:82-84` | stub |
| [5-5](aktiviteter/5-5-capabilities-can-only-grow.md) | Capabilities can-only-grow / aldrig tyst tappa (snapshot-null-guard) | 5-1 + 5-3 (#168) | Medel | `orchestrate.ts:761-792` (+ floor efter prompt-filter) | **ready** (bygg efter #168 mergad) |
| 5-6 | `previewSessionId` in i kontraktet + validering vid follow-up-start | 5-1 | Låg–medel | `preview-session/route.ts`, kontrakt | stub |
| 5-7 | Stabilitetstest: follow-up byter ej scaffold / tappar ej route / bygger ej på fel version + svensk åäö follow-up-intent-test | 5-1..5-6 | Låg (test) | `*.stability.test.ts` | stub |
| 5-Z | Z-städ: LLM-flow-modulnamn/kartsynk, doc-drift F3/F5 | 5-1..5-7 | Låg | docs + ev. barrel | stub |
