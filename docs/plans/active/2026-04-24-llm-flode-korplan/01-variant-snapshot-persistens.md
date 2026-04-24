---
status: active
created: 2026-04-24
spår: 1 av 5 (LLM-flöde-körplan)
prio: P1 (glasklar bug, liten yta, hög user-impact)
estimat: 1–2 dagar
---

# Spår 1 — Variant-snapshot-persistens (variant-flips mellan create och followup)

## Symtom (observerat)

I körning `eb152443-2660-4042-a2a0-e5c156b928ed`:

1. Create-passet valde scaffold-variant **`editorial-lux`** (loggad i `orchestration.styleDirection` 11:19:18).
2. Auto-repair-passet 11:30:01 hamnade i **`corporate-grid`** via fallback. Loggrad: `[scaffold-variant] variant_lock_fallback { reason: "missing_prior_variant_id", fallbackVariantId: "corporate-grid" }`.
3. `orchestration.snapshot.persisted`-eventet (timeline.ndjson rad 16) visar `{ variantId: null, hasVariantId: false }` — fast variantvalet skedde 12 ms tidigare.

User-effekt: design "byts plötsligt mitt i samma chat" — exakt det Plan 11 / P26 skulle förhindra.

## Rotorsak

Buggen är två-lagrad:

### Lager A — `variantId` når inte snapshot-DB:n

**Källkedjan:**

| # | Fil | Rad | Vad |
|---|-----|-----|---|
| 1 | `src/lib/gen/orchestrate.ts` | 793–800 | `lockedVariantForFollowUp` anropas (followup-fallet) |
| 2 | `src/lib/gen/system-prompt/build-dynamic-context.ts` | 291 | `variantId: effectiveVariant?.id ?? null` (när variant valts) |
| 3 | `src/lib/gen/orchestrate.ts` | 888–893 | `finalizeOrchestrationPrompts` returnerar `variantId: dynamic.variantId` |
| 4 | `src/lib/api/engine/chats/create-chat-stream-post.ts` | 862 | `variantId: finalized.variantId` skickas vidare |
| 5 | `src/lib/own-engine/session/own-engine-build-session.ts` | 207 | `buildOwnEngineGenerationStreamMeta` sätter `variantId: input.variantId ?? null` — **explicit null om falsy** |
| 6 | `src/lib/gen/stream/finalize-version/orchestration-snapshot.ts` | 65–78 | `sanitizeOrchestrationSnapshotForStorage` → `buildPersistedOrchestrationSnapshot` |
| 7 | `src/lib/gen/stream/finalize-version/orchestration-snapshot.ts` | 18–25 + 94–108 | `MAX_KEYS = 10–11` global key-budget per object-sweep + shallow `{...base, ...next}` merge utan special-case för `variantId` |
| 8 | `src/lib/gen/stream/finalize-version/persist-side-effects.ts` | 55–70 | `persistOrchestrationSnapshot` loggar `variantId: typeof merged.variantId === "string" ? merged.variantId : null` |
| 9 | `src/lib/db/chat-repository-pg.ts` | 431–439 | `updateChatOrchestrationSnapshot` skriver till `engine_chats.orchestration_snapshot` (jsonb) |

**Två oberoende felmekanismer i kedjan:**

- **(7-A) Sanitize tröskar bort `variantId`:** `sanitizeOrchestrationSnapshotForStorage` har en global `MAX_KEYS`-budget (10–11) per object-sweep. `variantId` ligger sent i meta-objektet (efter `buildSpec`, contracts, m.m.) och kan tröskas bort när tidigare nycklar konsumerar budgeten.
- **(7-B) Merge skriver över med null:** En senare finalize med `variantId: null` (ingen variant vald, t.ex. clean-redesign) kan via shallow merge `{ ...base, ...next }` nolla en tidigare sträng — det finns ingen specialregel för `variantId` (jfr hur `buildSpec` har specialhantering).

### Lager B — Matcher faller tillbaka till default när det inte ska

`src/lib/gen/scaffold-variants/matcher.ts` rad 76-89: `lockedVariantForFollowUp` har en *medveten* fallback till `getDefaultVariantForScaffold` när `priorVariantId === null`. Designintentionen (P26-kommentaren rad 68-75) var att stoppa matcher från att fritt välja om embedding-pick — men effekten blev ändå en flip från `editorial-lux` → `corporate-grid` eftersom snapshotten aldrig hade rätt id.

## Föreslagen fix (två lager — gör båda)

### Fix A — Säkerställ att `variantId` persisteras

**A1. Sanitize-skydd:** I `src/lib/gen/stream/finalize-version/orchestration-snapshot.ts` `sanitizeOrchestrationSnapshotForStorage` — säkerställ att vissa **kärnfält** (`variantId`, `scaffoldId`, `variantSelectionMethod`) **alltid** överlever sanitize, oavsett `MAX_KEYS`-budget. Två alternativ:

- **a)** Lyfta dessa fält **ut ur** sanitize-loop:en och skriv dem deterministiskt sist.
- **b)** Höj `MAX_KEYS` till 20 (enkel men yttäckare).

Förslag: **a)** — explicit allowlist är robustare än att höja en limit.

**A2. Merge-skydd:** I `mergePersistedOrchestrationSnapshots` (samma fil rad 94-108), specialhantera `variantId`: om `next.variantId === null` och `base.variantId` är sträng, behåll `base.variantId`. Samma princip som finns för `buildSpec`.

### Fix B — Failsafe i matchern

I `src/lib/gen/scaffold-variants/matcher.ts` rad 76-89 (eller i call-site `src/lib/gen/orchestrate.ts` rad 793-800): innan fallback till `getDefaultVariantForScaffold`, läs senaste persisterade `variantId` från en **tredje källa**.

**Två konkreta källor:**

1. **`engine_chats.orchestration_snapshot.last_resolved_variant_id`** — nytt fält som skrivs separat och inte sanitas. Låg risk eftersom det ligger utanför sanitize-budgeten.
2. **`logs/site-observability/<chatId>/latest/observability.json`** — vi loggar redan `orchestration.styleDirection` per run. Men: matcher.ts ska inte läsa NDJSON. Bättre att tråda in `lastResolvedVariantId` i call-site (`chat-message-stream-post.ts` rad 832-839).

Förslag: **(1)** — lägg `last_resolved_variant_id` som separat kolumn-rot i jsonb (utanför sanitize), uppdatera vid varje lyckad variant-resolution.

## Tester som behövs

Befintligt `src/lib/gen/scaffold-variants/matcher.test.ts` täcker matcher-isolation, men **inte** end-to-end create→snapshot→followup.

**Ny testfil:** `src/lib/gen/stream/finalize-version/orchestration-snapshot-persist.test.ts`

**Två test-cases:**

```
describe("orchestration snapshot persistence — variantId roundtrip", () => {
  it("variantId from create survives sanitize+merge even with full MAX_KEYS pressure", async () => {
    // Build streamMeta with variantId: "editorial-lux" + 20 other nested fields
    // Run sanitize + merge with empty base
    // Assert merged.variantId === "editorial-lux"
  });

  it("subsequent finalize with variantId: null does not nuke previous string", async () => {
    // base = { variantId: "editorial-lux", ... }
    // next = { variantId: null, ... }
    // Run mergePersistedOrchestrationSnapshots(base, next)
    // Assert merged.variantId === "editorial-lux"
  });
});
```

**Utökat test:** I `matcher.test.ts`, lägg till case som verifierar att fallback INTE flippar variant när `lastResolvedVariantId` finns (kräver Fix B-implementation).

## Acceptanskriterier

- [ ] Sanitize bevarar `variantId` (och `scaffoldId`) oavsett key-budget.
- [ ] Merge skriver inte över sträng `variantId` med `null`.
- [ ] Followup utan tidigare snapshot men med `lastResolvedVariantId` använder den variant istället för default.
- [ ] Regression-tester passerar.
- [ ] Manuell verifiering: skapa create + auto-repair, kontrollera att `[scaffold-variant] variant_lock_fallback` INTE loggar `missing_prior_variant_id` när create-passet valt en variant.

## Risker

- **Snapshot-format-migration:** Befintliga chattar har redan `orchestration_snapshot.variantId === null` som ren fallback. Migreringen är icke-destruktiv (gamla chattar fortsätter falla tillbaka), men telemetri kan se en sänkt fallback-rate som "förbättring" snarare än "fix".
- **`last_resolved_variant_id` jsonb-fält:** kräver migration-guide eller (enklare) tolerera saknat fält i läs-pathen.

## Filer att läsa innan implementation

- `src/lib/gen/scaffold-variants/matcher.ts` (hela)
- `src/lib/gen/stream/finalize-version/orchestration-snapshot.ts` (hela)
- `src/lib/gen/stream/finalize-version/persist-side-effects.ts` rad 36-84
- `src/lib/own-engine/session/own-engine-build-session.ts` rad 172-220
- `src/lib/db/chat-repository-pg.ts` rad 418-440

## Källa

Audit-agent #1 (claude-4.6-sonnet-medium-thinking) 2026-04-24, prompt fokus: variant-lock-bug-rotorsak.
