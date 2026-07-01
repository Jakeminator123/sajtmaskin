# LLM-flöde — målbild (världsklass)

**Senast uppdaterad:** 2026-07-01.
**Syfte:** **norra stjärna** för hur Sajtmaskins LLM-flöde *bör* se ut, separat från hur det faktiskt är just nu. När docs och kod beskriver "vad som finns idag", beskriver den här filen "vad vi siktar mot" så vi kan mäta gap.

> **Den här filen är inte source of truth för runtime.** Det är `src/lib/gen/`, `docs/architecture/fas{1,2,3}-*.md` och `glossary.md`. Den här filen är en **referensvision** att jämföra emot.

För **vad som faktiskt finns idag**, läs:
- [`llm-pipeline.md`](./llm-pipeline.md) — kanoniskt körflöde FAS 1→2→3 (prompt → streamstart → orchestrate → finalize → preview → deploy)

---

## Grundprincip

Ett världsklass-LLM-flöde har **fem singel-sanningskällor**:

| # | Sanning | Idag |
|---|---------|------|
| 1 | **En sanningskälla för intent** (Deep Brief) | ✅ I huvudsak — men brief-vägar (klient-brief, server-auto-brief, snapshot-brief) parallellexisterar |
| 2 | **En sanningskälla för prompt composition** (Core Rules + Dynamic Context) | ✅ `composeEngineSystemPrompt` |
| 3 | **En sanningskälla för runtime status** (event bus) | ⚠️ Delvis — `selectVersionStatus` är nu kanonisk projektion läst av `useVersionStatus`-hooken (`resolveEngineVersionDisplayStatus` borttagen); enstaka DB-flaggor + `done`-SSE lever fortfarande parallellt |
| 4 | **Ett enda repair-kontrakt** (mekanisk autofix → en LLM-fix-gate) | ⚠️ Idag flera fixer-call-sites (verifier-fixer, partial-file-repair, syntax-fixer, tsc-fixer, eslint-fixer); samma `runLlmFixer` men olika gates |
| 5 | **Tydlig skillnad F2 vs F3** | ✅ Implementerat (lifecycle stage + check-profiler), men UI-text glider ihop |

---

## 3-fasmodell — målbilden

```
┌────────────────────────────────────────────────────────────────────┐
│ FAS 1 — Intent Architecture (förstå, välja, paketera)              │
│                                                                    │
│   Init                              Follow-up                      │
│   ───────                           ─────────                      │
│   raw prompt                        raw follow-up + prior artifact │
│   → junk/ambiguity detector         → follow-up intent classifier  │
│   → Deep Brief (semantic expansion) → delta planner                │
│   → capability graph                → contract inheritance         │
│   → scaffold + variant + dossiers   → capability refresh on delta  │
│   → route + build planner           → prompt composer              │
│   → prompt composer                 → immutable follow-up contract │
│   → immutable generation contract                                  │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ FAS 2 — Build Architecture (generera kandidat)                     │
│                                                                    │
│   generation contract                                              │
│   → Primary LLM (codegen)                                          │
│   → candidate artifact graph                                       │
│   → deterministic mechanical passes                                │
│       A. imports/assets                                            │
│       B. syntax/schema                                             │
│       C. route/reference coherence                                 │
│   → SINGLE repair gate (only if mechanical checks fail)            │
│   → revalidated candidate                                          │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ FAS 3 — Runtime Architecture (starta, verifiera, promota)          │
│                                                                    │
│   candidate → F2 checks (preview boots, page renders, no fatal)    │
│             → "Fidelity 2 passed"                                  │
│                                                                    │
│   on demand → F3 checks (npm run build, integration smoke,         │
│                          capability-specific checks)               │
│             → "Fidelity 3 passed"                                  │
│                                                                    │
│   ONE event bus → version modal · iframe overlay · logs · DB       │
└────────────────────────────────────────────────────────────────────┘
```

---

## Init vs Follow-up — distinkta operationer

Den största principiella skillnaden mellan ett *starkt* system och ett *världsklass*-system:

| Aspekt | Init (target) | Follow-up (target) |
|---|---|---|
| Operation-typ | **Genesis** — bygg ny artifact graph | **Delta** — operation på existerande graph |
| Brief | Full Deep Brief (1 LLM-anrop) | **Snapshot-brief inheritance** + delta-refresh på rå message — aldrig ny full brief |
| Scaffold/variant | Embedding + brief.nomination | **Frusen** från snapshot-contract (utom vid `clear-redesign`) |
| Capabilities | Ny inferens | Refresh på rå message + union med snapshot |
| Routes | Fri planering | **Frusen** mot existerande filer (add/remove kräver explicit signal) |
| Quality target | Färsk inferens | **Ärvs** från prior version (utom vid uppgradering) |
| Prompt composition | Full system prompt | Samma composer + `## Continuity` + `## Existing Project Files` user-wrap |
| Output kontrakt | Komplett site | **Komplett site** (LLM får alltid hela filer, aldrig diffs/snippets) |

**Implikation:** follow-up ska INTE behandlas som "nästan init". Det är en delta-operation på en låst kontrakts-graph. Idag är det **väsentligen rätt** — `buildFollowUpBriefFromSnapshot`, `lockedVariantForFollowUp`, `inheritQualityTargetFromPriorVersion`, `effectiveInitRouteCount`-respekten — men gates är spridda. Mål: en `FollowUpContract`-typ som samlar allt.

---

## Fas 2 — single repair gate

**Idag:** `runLlmFixer` anropas från 5 ställen (verifier-fixer, partial-file-repair, syntax-fixer, tsc-fixer, eslint-fixer). Olika gates, olika fallbacks, olika telemetri.

**Mål:** en `RepairGate`-modul med tre buckets *internt* men ett enda anropsställe *externt*:

```
mechanical_check_failed?
  ├── A. imports/assets bucket  → run mechanical fixer family A
  ├── B. syntax/schema bucket   → run mechanical fixer family B
  └── C. coherence bucket       → run mechanical fixer family C

  if still failing → repair_gate.invoke({ phase, errors, files })
                        → single LLM-fixer call with phase-routed model
                        → telemetry: phase + before/after diagnostics
```

Plan: `L1-unified-repair-call.md` (parkad — väntar på telemetri-data).

---

## Fas 3 — F2 vs F3 + single status truth

### F2 vs F3 — tydlig skiljelinje

| | F2 (`fidelity2`) | F3 (`fidelity3`) |
|---|---|---|
| Vad checkas | preview bootar, page renderar, ingen fatal overlay | full `npm run build`, integration smoke, capability-specifika checks |
| Trigger | init / vanlig follow-up | explicit knapp `POST /finalize-design` |
| Lifecycle stage | `"design"` | `"integrations"` |
| Tier-3 SDKs | strippas (placeholder UI) | krävs riktiga env-keys (per `enforcement: "build"`) |
| Quality gate | `["typecheck"]` (warm pre-VM) | `["typecheck", "build", "lint"]` |
| UI-text mål | "Förhandsgranskning" / "Design redo" | "Bygg redo" / "Integrationer testade" |

**Detta är implementerat.** UI-text mellan `verifying`/`repairing`/`repair_available`/`promoted` glider fortfarande ihop — se status-bus nedan.

> **Kvarvarande F2-friktion (kod-sanning 2026-07-01):** F2:s quality gate är `["typecheck"]` men **fortfarande en hård promotion-gate** — `POST .../quality-gate` kör `failVersionVerification` när `gateResult.passed === false` (`quality-gate/route.ts:396-400`). Ett F2-typecheck-fel failar alltså versionen och triggar repair även om previewn redan renderar. Det är **inte** "render räcker". PR #330 ("F2 render is enough" → typecheck advisory när preview renderar) är **stängd, ej mergad** (`state: CLOSED`, `draft`), så den friktionen finns kvar i master. Målbilden ovan (F2 = "preview bootar, renderar, ingen fatal") är alltså aspiration, inte nuläge.

### Single status truth

```
                           ┌──────────────────┐
                           │  EVENT BUS       │
                           │  (single source) │
                           └────────┬─────────┘
                                    │
            ┌────────────┬──────────┼──────────┬────────────┐
            ▼            ▼          ▼          ▼            ▼
      version modal  iframe    logs/devlog   DB record   backoffice
                     overlay
```

**Idag:** OMTAG fas 3·06 levererade `selectVersionStatus(events)` som projektion, och Område 6 (cut-over) flippade builder-ytorna dit: `BuilderShellContent.tsx` läser bus-status via `useVersionStatus`, `VersionHistory` via server-enrichat `busStatus`. Den gamla DB-flagg-helpern `resolveEngineVersionDisplayStatus` är **borttagen** (6-3). Bussen är dock inte längre *enda* källan: sedan #337/#342 är statusytan en **hybrid** — `/version-status` + `/versions` reconcilar bus-fasen mot terminalt DB-`verification_state` (`reconcileTerminalDbState`), `/version-status` + `/readiness` delar en lease-säker stale-watchdog (`settleStaleVerificationIfNeeded`), och `useVersionStatus` har ett klient-poll-tak. Det stänger de eviga `verifying`/`repairing`-spinner-lägena.

**Status:** event-bus UI-flip (spår A / f.d. "Kvarvarande #11") är **klar** — bus-projektion + terminal DB-reconcile + stale-watchdog + klient-tak levererade (#337, #342). F2/F3-ordval (spår B) ägs separat av `docs/plans/archived/2026-05-01-f2-f3-ux-copy-konsolidering.md`, så signalfrågor och copyfrågor inte blandas ihop.

---

## 3D / Three-Fiber som vanlig capability

3D är **inte specialmagi** — det är en capability bland andra (auth, ecommerce, CMS, payments). I målbilden:

```
request needs 3D
  → capability classifier marks "3d_scene" (needs3D, needsPhysics)
  → dossier/scaffold rules attach 3D package requirements
  → asset/component generator creates scene module
  → dependency planner adds package changes (@react-three/fiber, drei, rapier)
  → runtime smoke includes WebGL / render mount check
```

**Idag:** detta fungerar. `needs3D` + `needsPhysics` är egna capability-flaggor; `visual-3d` är dekorativ Three/R3F, `physics-3d` är Rapier/rigid-body-tillägg, och `parallax-scroll` / `parallax-pointer` är separata dossiers. **Glapp:** runtime smoke-check för WebGL render mount finns inte ännu — om Canvas misslyckas mounta hamnar det i F2-overlay-runbook istället.

---

## Vad som redan är starkt (behåll)

| Område | Status | Varför världsklass-relevant |
|---|---|---|
| Rikt orchestration-lager (`orchestrate.ts`) | ✅ Mature | Inte bara "skicka prompt till modell" — riktig planning-fas |
| Scaffold + variant + dossier som separata begrepp | ✅ | Tydlig ansvarsuppdelning (struktur / visuell signatur / capability-implementation) |
| Snapshot-baserad follow-up-kontinuitet | ✅ | `orchestration-snapshot.ts` + `buildFollowUpBriefFromSnapshot` |
| Core Rules + Dynamic Context-uppdelning | ✅ | Stabil produktregel-baseline + per-request-kontext |
| Per-Request Signal Cascade | ✅ | EXPLICIT > INDICATED > INFERRED > DEFAULT > FALLBACK |
| Lifecycle stage (F2/F3) | ✅ | Distinkta gates och kontrakt |
| Element Preservation Guard | ✅ | Mekaniskt skydd mot att follow-ups tappar high-value-element |
| Verifier-fynd → LLM-fixer på pre-VM-vägen | ✅ | Kvalitet rättas innan UI ser version |
| Auto-repair på `build-error` (dev/preview) | ✅ | Stänger F2 + `verificationPolicy: fast`-gapet |
| Status event bus (UI-flip + terminalitet) | ✅ | Bus-projektion + terminal DB-reconcile + delad stale-watchdog + klient-poll-tak (#337/#342); f.d. `Kvarvarande #11` |
| Brief-cache i Redis | ✅ | Sparar 1 LLM-anrop/retry på samma input |

---

## Återstående gap mot målbild

Samlat från audit-rapporter, plans/active och denna analys. Detta är **inte nya buggar** — det är medvetna kompromisser eller kandidater för konsolidering.

| Gap | Idag | Mål | Plan / status |
|---|---|---|---|
| **Single repair gate** | 5 callsites till `runLlmFixer` | 1 RepairGate-modul med 3 buckets internt | `L1-unified-repair-call.md` (parkad — väntar telemetri) |
| **F2 = render räcker** | F2 quality gate `["typecheck"]` failar versionen hårt vid typfel även när preview renderar | F2-typecheck advisory när preview renderar; hårt först i F3 | PR #330 **stängd, ej mergad** — friktionen finns kvar |
| **Brief-vägar** | klient-brief / server-auto-brief / snapshot-brief; fallback-addendum finns kvar som degraderad helper, inte som init-chat-wrapper | Sekventiell hierarki: klient → server-auto → snapshot → ingen | P2 (öppet, fas1-doc) |
| **Follow-up som strikt delta** | rätt i praktiken, men spritt över helpers | `FollowUpContract`-typ som samlar inheritance | (ingen aktiv plan) |
| **Verifier-pass placering** | Inline i finalize, men hoppas över på fast-path | Antingen alltid inline (med budget) eller helt asynk | Audit §3.1 (telemetri-blockad) |
| **Partial-file-repair** | 1 LLM-fixer-runda + abort | Ta bort när fast-tier byts till GPT-5+ (kompletta filer alltid) | Audit §3.3 (telemetri-blockad) |
| **3D runtime smoke-check** | Saknas | WebGL render mount-check ingår i F2-checks vid `needs3D` | (ingen aktiv plan) |
| **Prompt-lager-konsolidering** | Deep Brief + server-auto-brief + snapshot-brief + kvarvarande prompt-assist helpers (`formatPrompt` i wizard/runner). Rewrite/Polish-UI är legacy. | En kanonisk path | P7 (öppet) |
| **WebContainers istället för Fly-VM** | preview boot 2-5 min | 5 sek (50-60×) | Audit Tier D #38 — strategisk satsning |

---

## Hur använder jag den här filen?

| Du gör... | ...använd den här filen så här |
|---|---|
| Skriver ny pipeline-kod | Kolla att den respekterar 3-fas-mappningen + de 5 sanningskällorna |
| Reviewar PR | Fråga: introducerar detta en ny call-site till `runLlmFixer`? Ny status-källa? Bryter init/follow-up-distinktionen? |
| Triagerar audit-fynd | Mappar fyndet mot ett gap här. Om det inte mappar — antingen ny gap-rad eller redan löst |
| Skriver ny doc | Beskriv "vad finns" i fas-doc, "vad siktar vi mot" här. Duplicera inte. |

---

## Relaterade dokument

| Dokument | Vad |
|---|---|
| [`llm-pipeline.md`](./llm-pipeline.md) | Vad som faktiskt händer när användaren skickar en prompt — kanoniskt körflöde FAS 1→2→3 |
| [`llm-signal-flow.md`](./llm-signal-flow.md) | Signal-ownership-matris |
| [`docs/plans/active/README.md`](../plans/active/README.md) | Koncentrat med konkreta öppna punkter (event-bus UI-flip är numera **levererad** via #337/#342) |
| [`docs/plans/archived/2026-05-01-f2-f3-ux-copy-konsolidering.md`](../plans/archived/2026-05-01-f2-f3-ux-copy-konsolidering.md) | F2/F3 copy-konsolidering (spår B, arkiverad) |
