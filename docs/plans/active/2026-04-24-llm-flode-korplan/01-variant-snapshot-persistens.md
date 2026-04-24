---
status: active
created: 2026-04-24
revision: 2026-04-24 (KORRIGERAD — fel filsökväg + fel MAX_KEYS i v1; verifiering visade `src/lib/gen/orchestration-snapshot.ts` med MAX_KEYS=80)
spår: 1 av 7 (LLM-flöde-körplan)
prio: P1 (efter P0 F2/F3-kontrakt)
estimat: 1–2 dagar (krävs testdriven verifiering av rotorsak innan fix)
---

# Spår 1 — Variant-snapshot-persistens (test-driven verifiering + fix)

## ⚠️ KORRIGERING jämfört med v1

Den första versionen av denna plan hade **två fel** som upptäcktes vid verifiering:

| Fel i v1 | Korrekt |
|---|---|
| Filsökväg `src/lib/gen/stream/finalize-version/orchestration-snapshot.ts` | **`src/lib/gen/orchestration-snapshot.ts`** |
| `MAX_KEYS = 10-11` | **`MAX_KEYS = 80`** |
| Hypotes A "absolut bevisad" | Hypotes A är **plausibel men ej bevisad för `eb152443`-fallet** — kräver instrumentering |

Dessutom påpekade deep-prefab-agenten att rotorsak måste **bevisas testdrivet** innan fix.

## Symtom (observerat, oförändrat)

I körning `eb152443-2660-4042-a2a0-e5c156b928ed`:

1. Create-passet valde scaffold-variant **`editorial-lux`** (`orchestration.styleDirection`-event 11:19:18).
2. Auto-repair-passet 11:30:01 hamnade i **`corporate-grid`** via `[scaffold-variant] variant_lock_fallback { reason: "missing_prior_variant_id", fallbackVariantId: "corporate-grid" }`.
3. `orchestration.snapshot.persisted`-eventet (timeline.ndjson rad 16) visar `{ variantId: null, hasVariantId: false }`.

## Rotorsak — vad vi VET vs HYPOTESER

### Vad vi vet (verifierat i kod)

**Källkedjan från orchestration → DB:**

| # | Fil | Rad | Vad | Bevis |
|---|-----|-----|---|---|
| 1 | `src/lib/gen/orchestrate.ts` | 793-815 | `lockedVariantForFollowUp` anropas **bara** för `followUp`. Create använder `resolveScaffoldVariant` → `pickScaffoldVariantAsync` | Verifierat |
| 2 | `src/lib/gen/scaffold-variants/matcher.ts` | 210-236 | `pickScaffoldVariant` returnerar `null` **bara** om scaffold saknar varianter — annars alltid en variant | Verifierat |
| 3 | `src/lib/gen/system-prompt/build-dynamic-context.ts` | 282-292 | Returnerar `variantId: effectiveVariant?.id ?? null` | Verifierat |
| 4 | `src/lib/gen/orchestrate.ts` | 888-893 | `finalizeOrchestrationPrompts` returnerar `variantId: dynamic.variantId` | Verifierat |
| 5 | `src/lib/api/engine/chats/create-chat-stream-post.ts` | 754-768 | Logik: `if (finalized.variantId) devLogAppend(orchestration.styleDirection)` — kräver truthy | Verifierat |
| 6 | `src/lib/api/engine/chats/create-chat-stream-post.ts` | 845-863 | Skickar `variantId: finalized.variantId` till `buildOwnEngineGenerationStreamMeta` | Verifierat |
| 7 | `src/lib/own-engine/session/own-engine-build-session.ts` | 207 | `variantId: input.variantId ?? null` — bevarar string om truthy | Verifierat |
| 8 | `src/lib/gen/orchestration-snapshot.ts` | 8-27 | `MAX_KEYS = 80`, delad `keyCount` över hela trädet | **KORRIGERING — inte 10-11** |
| 9 | `src/lib/gen/orchestration-snapshot.ts` | 94-113 | Shallow merge `{...base, ...next}`, `buildSpec` har specialskydd, **`variantId` har inget skydd** | Verifierat |
| 10 | `src/lib/gen/stream/finalize-version/persist-side-effects.ts` | 36-54 | `persistOrchestrationSnapshot` läser `previous`, mergar alltid, skriver tillbaka | Verifierat |
| 11 | `src/lib/gen/stream/finalize-version/persist-side-effects.ts` | 55-70 | Loggar `variantId: typeof merged.variantId === "string" ? merged.variantId : null` | Verifierat |

### Logiskt avfärdade hypoteser

**Hypotes C ("`effectiveVariant` aldrig null från start"):**
**AVFÄRDAT.** Eftersom `orchestration.styleDirection` faktiskt loggades (rad 5 i `create-chat-stream-post.ts` L764 kräver truthy), så hade `finalized.variantId` ett strängvärde precis innan meta byggdes. Att den blir null nedströms måste ske i sanitize eller merge.

### Plausibla men obevisade hypoteser

**Hypotes A (sanitize tröskar bort `variantId` pga MAX_KEYS=80):**
- **Plausibel.** `keyCount` delas över hela trädet (djup `buildSpec` + `briefSummary` + integrations-arrayer kan konsumera 80+ nycklar).
- `variantId` ligger **sent** i meta-objektet (rad 207, näst sist före `chatPrivacy`/`scaffoldLabel`).
- Om budgeten förbrukas bryter loopen och resterande top-level-nycklar processas inte.
- **MEN:** vi vet inte säkert att meta-objektet i `eb152443`-fallet hade tillräckligt djup struktur för att förbruka 80 nycklar.

**Hypotes B (shallow merge skriver över):**
- **Bekräftad mekanism** (`mergePersistedOrchestrationSnapshots` saknar `variantId`-skydd).
- **MEN:** för create-fallet finns ingen tidigare `previous` att skriva över. Hypotesen är relevant för **followup**-fall där create lyckats sätta strängen och senare finalize skickar `variantId: null`.

## Test-driven verifiering FÖRST

**Innan vi fixar något, lägg till tester som bevisar vilken hypotes som faktiskt orsakar `variantId: null`.**

### T1. Unit-test för sanitize-tröskning

**Ny fil:** `src/lib/gen/orchestration-snapshot-variant.test.ts`

```ts
describe("sanitizeOrchestrationSnapshotForStorage — variantId roundtrip", () => {
  it("preserves variantId when meta has < MAX_KEYS total nodes", async () => {
    const meta = buildMinimalMetaWithVariant("editorial-lux");
    const out = sanitizeOrchestrationSnapshotForStorage(meta);
    expect(out.variantId).toBe("editorial-lux");
  });

  it("LOSES variantId when meta has > MAX_KEYS total nodes (deep buildSpec)", async () => {
    const meta = buildHeavyMetaWithVariant("editorial-lux", { 
      buildSpec: { /* 90+ nycklar */ },
    });
    const out = sanitizeOrchestrationSnapshotForStorage(meta);
    // Detta test EXPONERAR buggen — antingen passerar (bug bekräftad) eller failar (bug elsewhere)
    expect(out.variantId).toBeUndefined();  // eller .toBe("editorial-lux") med fix
  });

  it("preserves variantId when MAX_KEYS doubled to 160", async () => {
    // Mock MAX_KEYS = 160 via dependency injection eller via privat config
    const meta = buildHeavyMetaWithVariant("editorial-lux");
    // Med MAX_KEYS=160 ska variantId överleva
  });
});
```

### T2. Unit-test för merge-skydd

```ts
describe("mergePersistedOrchestrationSnapshots — variantId protection", () => {
  it("base.variantId='X', next.variantId=null ⇒ merged.variantId='X'", async () => {
    const base = { variantId: "editorial-lux", capturedAt: "2026-01-01" };
    const next = { variantId: null, capturedAt: "2026-01-02" };
    const merged = mergePersistedOrchestrationSnapshots(base, next);
    expect(merged.variantId).toBe("editorial-lux");  // KRÄVER FIX
  });
});
```

### T3. Integration-test som reproducerar `eb152443`-flödet

```ts
describe("e2e: create → snapshot → followup variant lock", () => {
  it("create with editorial-lux → snapshot has variantId → followup uses editorial-lux", async () => {
    const createMeta = buildRealisticOrchestrationMeta({ variantId: "editorial-lux" });
    const snap = buildPersistedOrchestrationSnapshot({ streamMeta: createMeta, ... });
    const merged = mergePersistedOrchestrationSnapshots(null, snap);
    expect(merged.variantId).toBe("editorial-lux");
    
    // Simulera followup som läser snapshot
    const followupResult = lockedVariantForFollowUp({
      chatId: "test",
      intent: "neutral",
      scaffoldId: "landing-page",
      priorVariantId: merged.variantId as string | null,
    });
    expect(followupResult?.id).toBe("editorial-lux");  // INTE corporate-grid
  });
});
```

### T4. Instrumentera produktionen (tillfälligt)

I `src/lib/gen/stream/finalize-version/persist-side-effects.ts` rad 47, lägg tillfällig logg:
```ts
const snap = buildPersistedOrchestrationSnapshot(...);
console.info("[debug:variant-trace]", {
  rawMetaVariantId: orchestrationStreamMeta?.variantId,
  postSanitizeVariantId: snap?.variantId,
  previousVariantId: previous?.variantId,
});
const merged = mergePersistedOrchestrationSnapshots(previous, snap);
console.info("[debug:variant-trace] post-merge", {
  mergedVariantId: merged?.variantId,
});
```

Kör 5 nya generations, läs loggen, peka ut **exakt** var stringen blir null. Ta sedan bort loggen.

## Föreslagen fix (efter T1+T2+T3 bevisat rotorsak)

### Fix för Hypotes A (om bevisad)

**A1.** I `src/lib/gen/orchestration-snapshot.ts` `sanitizeOrchestrationSnapshotForStorage`:

```ts
const PROTECTED_TOP_LEVEL_KEYS = ["variantId", "scaffoldId", "lineageHash", "versionId", "chatId"];

export function sanitizeOrchestrationSnapshotForStorage(input, depth = 0, keyCount = { n: 0 }) {
  if (depth > MAX_DEPTH) return {};
  const out = {};
  // Steg 1: kopiera skyddade fält FÖRST utan att räkna mot budget
  for (const key of PROTECTED_TOP_LEVEL_KEYS) {
    if (key in input && typeof input[key] !== "object") {
      out[key] = input[key];
    }
  }
  // Steg 2: kör vanlig sanitize på resten
  for (const [k, v] of Object.entries(input)) {
    if (PROTECTED_TOP_LEVEL_KEYS.includes(k)) continue;
    if (keyCount.n > MAX_KEYS) break;
    // ...befintlig logik...
  }
  return out;
}
```

### Fix för Hypotes B (alltid värd att göra)

**B1.** I `src/lib/gen/orchestration-snapshot.ts` `mergePersistedOrchestrationSnapshots`:

```ts
const merged = { ...base, ...next };

// SKYDDA variantId från null-overwrite — samma princip som buildSpec
if (typeof base.variantId === "string" && next.variantId === null) {
  merged.variantId = base.variantId;
}

// Samma princip för scaffoldId
if (typeof base.scaffoldId === "string" && next.scaffoldId === null) {
  merged.scaffoldId = base.scaffoldId;
}

// (befintlig buildSpec-merge behålls)
```

### Failsafe för matchern (alltid värd att göra)

**M1.** I `src/lib/api/engine/chats/chat-message-stream-post.ts` rad 832-839 där `snapshotVariantId` läses: lägg till en tredje källa:

```ts
const persistedVariantId = 
  snapshotVariantId ?? 
  await readLastResolvedVariantFromHistory(chatId);  // NY källa: läser senaste lyckad variant från event-bus
```

`readLastResolvedVariantFromHistory` läser senaste `orchestration.styleDirection`-event från `engine_chat_events` (eller motsvarande). Det är **inte** matcher.ts som läser NDJSON — det är call-site som tråder in extra data.

## Acceptanskriterier

- [ ] T1, T2, T3 finns och bevisar/avfärdar Hypotes A.
- [ ] **Bara om T1 bevisar Hypotes A:** PROTECTED-keys allowlist i sanitize.
- [ ] **Alltid:** B1 merge-skydd för `variantId` + `scaffoldId`.
- [ ] **Alltid:** failsafe i call-site som läser senaste lyckad variant.
- [ ] Manuell verifiering: skapa create + auto-repair, kontrollera att `variant_lock_fallback` INTE loggar `missing_prior_variant_id`.
- [ ] Inga tidigare followup-passes flippar variant utan explicit `clear-redesign`-intent.

## Risker

- **Snapshot-format-migration:** befintliga chattar har redan `null`. Migreringen är icke-destruktiv (gamla chattar fortsätter falla tillbaka till default).
- **Test T1 kan failas i helt andra mekanism:** om hypotes A INTE är rotorsaken, behöver vi spåra vidare. T4-instrumentering är planerad fallback.

## Filer att läsa innan implementation

- `src/lib/gen/orchestration-snapshot.ts` (hela, ~120 rader) ⚠️ KORRIGERAD SÖKVÄG
- `src/lib/gen/scaffold-variants/matcher.ts` (rad 1-150)
- `src/lib/gen/orchestrate.ts` (rad 780-820, 880-900)
- `src/lib/gen/system-prompt/build-dynamic-context.ts` (rad 130-170, 282-295)
- `src/lib/api/engine/chats/create-chat-stream-post.ts` (rad 750-870)
- `src/lib/api/engine/chats/chat-message-stream-post.ts` (rad 825-900)
- `src/lib/own-engine/session/own-engine-build-session.ts` (rad 170-220)
- `src/lib/gen/stream/finalize-version/persist-side-effects.ts` (rad 36-84)
- `src/lib/db/chat-repository-pg.ts` (rad 415-445)

## Källor

- Audit-agent #1 (claude-4.6-sonnet-medium-thinking) 2026-04-24, första pass
- Audit-agent V2 (claude-4.6-sonnet-medium-thinking) 2026-04-24, verifierings-pass — upptäckte fel filsökväg + MAX_KEYS=80
- Deep-prefab-agentens feedback i `svar_gpt`: "Root cause för variantbuggen är inte helt bevisad i de filer jag kunde läsa... ska implementeras testdrivet"
