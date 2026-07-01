# Version-status state machine

Denna fil dokumenterar DB-state-maskinen för `engine_versions` (`release_state`, `verification_state`) och vilken kod som skriver respektive state. Skrevs ursprungligen 2026-04-23 som del av showcase-bug-rotorsaksfixen — se [`docs/devlogs/2026-04-23-showcase-bug-rootfix.md`](../devlogs/2026-04-23-showcase-bug-rootfix.md).

## States

Definierat i [`src/lib/db/engine-version-lifecycle.ts`](../../src/lib/db/engine-version-lifecycle.ts):

| `release_state` | `verification_state` | Betydelse |
|---|---|---|
| `draft` | `pending` | Nyskapad. Ingen verifiering har kört än. |
| `draft` | `verifying` | Server-verify kör i bakgrunden. |
| `draft` | `repairing` | En repair-pass skriver nya filer. |
| `draft` | `repair_available` | Repair-pass klar, användaren kan acceptera/granska. |
| `draft` | `passed` | Verifierad men inte promotad. |
| `draft` | `failed` | Verifiering misslyckades definitivt. |
| `promoted` | (vilken som) | Publicerad — live. |

**Två statusytor läser detta:** publicerings-/deploy-ytan (`/readiness`) läser DB-state via `resolveEngineVersionLifecycleStatus(version)` och visar labels som "Draft"/"Verifierar"/"Reparerar"/"Fix redo"/"Fel"/"Publicerad". **Builder-spinnern + version-historik-badgen** läser däremot event-bus-projektionen (`selectVersionStatus` via `/version-status` + `/versions`), som sedan #337 reconcilas mot terminalt DB-`verification_state` (`reconcileTerminalDbState`) så en död verify-runda aldrig fastnar på "verifying".

## Transitioner

```mermaid
stateDiagram-v2
  [*] --> pending: finalize start
  pending --> verifying: server-verify triggered
  pending --> failed: preflight blocking (syntax/parse/merge)
  verifying --> promoted: gate pass + !diagnosticOnly
  verifying --> repair_available: gate fail + repair-loop saved
  verifying --> failed: gate fail + no repair / diagnosticOnly terminal
  failed --> repair_available: triggerBuildErrorRepair saves
  pending --> repair_available: triggerBuildErrorRepair saves
  repair_available --> promoted: user accepts + gate pass
  promoted --> [*]: published
  failed --> [*]: terminal
```

## Vem skriver vad

| Transition | Kod | Not |
|---|---|---|
| → `pending` | [`addAssistantMessageAndCreateDraftVersion`](../../src/lib/db/chat-repository-pg.ts) | Default state vid DB-insert. |
| → `verifying` | `markVersionVerifying` | Anropas av [`server-verify.ts`](../../src/lib/gen/verify/server-verify.ts) före gate-körning. |
| → `repairing` | `markVersionRepairing` | Anropas av repair-loop innan LLM-anrop. |
| → `repair_available` | `saveRepairedFiles` | Efter lyckad LLM-repair i server-verify. |
| → `passed` | (oanvänd i nuläget) | Reserverad för framtida split av `passed` vs `promoted`. |
| → `failed` | `failVersionVerification` / `maybeFailVersionVerification` | Se 2026-04-23-ändringen nedan. |
| → `promoted` | `promoteVersion` | Server-verify gate-pass (inte diagnostic_only), eller manuell quality-gate-route. |

## 2026-04-23 — regel för pre-commit `failed`

**Tidigare beteende:** varje version med verifier-LLM blocking findings (`verifierBlockingFindings.length > 0`) markerades omedelbart `failed` inne i `finalizeAndSaveVersion` via `maybeFailVersionVerification`. Server-verify sprang sen i `diagnosticOnly: true` och gjorde **ingen** state-uppdatering. Resultat: UI:n visade "Fel" innan server-verify hunnit köra sitt riktiga tsc+build-pass.

**Nytt beteende (fas D1–D2 av showcase-bug-rotorsaksfixen):**

1. Endast **preflight hard errors** (syntax/parse/merge) → pre-committa `failed` i finalize. Dessa är deterministiska och ska fast-fail:a.
2. **Verifier-only blocking** → state stannar i `pending` tills server-verify landat. UI:n visar "Verifierar" under fönstret.
3. Server-verify i `diagnosticOnly: true` **resolverar** terminalt via `failVersionVerification` både vid gate-pass (verifier-LLM och tsc oeniga) och gate-fail (båda eniga om fel). Detta säkrar att versionen aldrig fastnar i `pending` utan att någon sätter slutstatus.
4. `triggerBuildErrorRepair` (VM build-error SSE) kan fortfarande override:a vilket state som helst genom `saveRepairedFiles` → `repair_available`.

Koden: se `runner.ts:389-410` och `server-verify.ts:175-245`.

## Uppföljningsspår

- **Full event-bus UI-flip** (Kvarvarande #11) — ✅ **klar** (Område 6-3): builder-ytorna läser `selectVersionStatus(events)` från [`event-bus-projection.ts`](../../src/lib/logging/event-bus-projection.ts) via `/version-status` + `/versions`. #337 la till terminal DB-reconcile (`reconcileTerminalDbState`) + en lease-säker stale-watchdog (`settleStaleVerificationIfNeeded`, delad med `/readiness`) så bussen aldrig fastnar icke-terminalt. Kvar-fältet `resolveEngineVersionLifecycleStatus` används nu bara av publicerings-/deploy-ytan.
- **Audit §3.2** (slå ihop server-verify + quality-gate + accept-repair till ett enda pass) — större refaktor, parkerad.
