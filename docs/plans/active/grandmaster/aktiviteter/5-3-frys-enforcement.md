---
id: gm-akt-5-3-frys-enforcement
status: ready
created: 2026-06-19
parent: gm-omrade-05-followup-och-preview-kontrakt
blocked_by: 5-1 (FollowUpContract finns på master, c469a4598)
risk: medium
owner_files:
  - src/lib/gen/orchestrate.ts
  - src/lib/api/engine/chats/follow-up-orchestration-input.ts
  - src/lib/gen/followup-freeze.stability.test.ts
---

# 5-3 — Frys-enforcement: lås scaffold/variant/route vid neutral follow-up

**Område 5** · Wave 2 · [nivå-2](../05-followup-och-preview-kontrakt.md) · bygger på **5-1** (`FollowUpContract`, mergad #165).

## Mål
Gör `FollowUpContract` till **aktiv källa** så en *vanlig* (neutral) follow-up inte kan drifta bort från basversionens scaffold/variant/route. **Undantag: clear-redesign** (avsiktlig omdesign) ska fortsatt få välja om. Smal PR — bara scaffold/variant/route, **inte** capability (5-5), finalize (5-6) eller F1-delta-brief (5-4).

## Bakgrund (verifierat i kod)
Frysen finns redan men är **utspridd** och läser lösa fält, **inte kontraktet**, och det finns **ingen guard som fångar drift**:

| Yta | Nuvarande frys-mekanism | Clear-redesign-undantag (befintligt) |
|---|---|---|
| Scaffold | `persistedScaffoldId` + `effectivePersistedScaffoldId` (`orchestrate.ts:495-529`) | `ignorePersistedScaffoldForMatch=true` → `auto`-rematch (`:530-566`) |
| Variant | `lockedVariantForFollowUp({ intent: followUpIntent ?? "neutral", priorVariantId: persistedVariantId })` (`orchestrate.ts:861-874`) | `followUpIntent === "clear-redesign"` släpper matchern |
| Route | `existingRoutePaths`/`existingShellRoutePaths` (route-freeze/clamp, `orchestrate.ts:691`) | clear-redesign får byta routes |

**Känd kringgång (stub):** en neutral follow-up kan skicka `scaffoldMode:"manual"` + ett annat `scaffoldId` → `orchestrate.ts:510-511` använder det skickade scaffoldet **istället för** det frysta → tyst scaffold-byte utan clear-redesign.

Kontraktet (`FollowUpContract`, `orchestration-snapshot.ts:335-360`) bär redan de frysta värdena: `scaffoldId`, `variantId`, `routePlan.{existingRoutePaths,existingShellRoutePaths}`. Det byggs i `follow-up-orchestration-input.ts:116-123` men **orchestrate läser det inte än**.

## Steg (stabilitetstest FÖRST)
1. **`followup-freeze.stability.test.ts` (skrivs först, ska faila innan fixen):**
   - Neutral follow-up som försöker byta scaffold (`scaffoldMode:"manual"` + `scaffoldId ≠ contract.scaffoldId`) → orchestrate resolverar **frysta** `contract.scaffoldId`, inte det skickade.
   - Neutral follow-up → resolverad variant == `contract.variantId`.
   - Neutral follow-up → `contract.routePlan`-routes bevaras (tappas/byts ej).
   - **clear-redesign** (`ignorePersistedScaffoldForMatch=true` / `followUpIntent="clear-redesign"`) → scaffold/variant-rematch **tillåten** (ingen clamp).
2. **Enforcement:** låt `orchestrate` läsa `input.followUpContract`. För `resolvedMode==="followUp"` **och inte** clear-redesign:
   - **Scaffold:** om begärt scaffold (manual) skiljer sig från `contract.scaffoldId` → clampa till `contract.scaffoldId` (stäng manual-kringgången). Frys vinner över klient-skickat byte.
   - **Variant:** säkerställ resolverad variant == `contract.variantId` (redan via `lockedVariantForFollowUp`; lägg assertion/clamp).
   - **Route:** validera att `contract.routePlan` bevaras.
   - Vid upptäckt drift: clampa + emit:a **drift-telemetri** (t.ex. `followup_freeze_drift`, `incIngressEvent` i try/catch) — **kasta aldrig**, bryt aldrig gen.
3. **Clear-redesign-undantag:** hoppa över alla clamps när `ignorePersistedScaffoldForMatch` (scaffold) / `followUpIntent==="clear-redesign"` (variant). Bekräfta att signalerna verkligen sätts på clear-redesign-vägen innan du litar på dem.

## Acceptans / tester
- `followup-freeze.stability.test.ts`: alla invariant-fall gröna efter fix; minst ett fall som bevisar drift fångas/clampas; clear-redesign-fall bevisar undantaget.
- Befintliga `orchestrate`-/scaffold-/variant-tester gröna (medvetet justerade om antagande ändras — dokumentera).
- `typecheck`/`lint` 0.
- **Beteende-neutralt i normalvägen:** ingen drift → ingen ändring (clamp är korrigerande, inte default-omskrivande).

## Guardrails
- **Smal:** bara scaffold/variant/route. Capability/finalize/preview-session/F1 = senare slices.
- Eget worktree (`..\sajtmaskin-omr5-3`, branch `feat/omr5-freeze-enforcement`), **draft-PR** (orchestrate = codegen-kärna + möjlig protected path → PR-mergaren `NEEDS_HUMAN` väntat).
- Builder-coexistence: rör inte preview/heartbeat.
- Om en yta (t.ex. route-validering) visar sig kräva bredare grepp än en clamp → **flagga som blocker**, smyg inte in den.
