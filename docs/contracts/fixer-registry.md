# Fixer Registry

Katalog över de fixers/validators som körs inne i `runAutoFix()`, plus
RepairGate-faserna och verifier.

**Source of truth:** `src/lib/gen/autofix/fixer-registry.ts` (TS const array `FIXER_REGISTRY`).

**Utanför registret:** två steg ändrar genererad kod utan att gå via
`runAutoFix` och utan att emittera `FixEntry`, så de har inget id att
registrera. Leta här först när en ändring i genererad kod saknar matchande
registerpost:

| Steg | Källa | Varför utanför |
|---|---|---|
| `checkCrossFileImports` | `src/lib/gen/autofix/rules/cross-file-import-checker.ts` | Körs från `finalize-merge.ts` — behöver det mergade filsetet för att veta vad som finns. Stubbar/vägrar import av lokala moduler som saknas; rapporteras som `merge:cross-file-stub`-rader. |
| `runSecurityChecks` | `src/lib/gen/security/run-security-checks.ts` | Sista steget i autofix-pipelinen, warning-only. |

**Visualised in:** `backoffice/pages/fixer_registry.py` (Streamlit table grouped by category + phase).

Docs använder kontrollbegreppen Normalize och RepairGate. Registry-id:n,
category-värden, lane-värden och telemetry counters är kod-legacy och döps inte
om.

## Why

Without a registry, "what touches generated code?" requires grep:ing through 40+
files. The registry lets a reader answer:

- What category does this fixer belong to (mechanical / validator / LLM / verifier)?
- Which lifecycle phase owns it (pre-syntax / post-syntax / verifier / preflight / server-repair)?
- What failure mode does it target?
- Is there telemetry?

## Schema

Each entry has the shape:

```ts
interface FixerRegistryEntry {
  id: string;                    // matches FixEntry.fixer
  category: FixerCategory;
  risk: "safe" | "risky";        // verifier-policy risk class
  sourcePath: string;
  targetFailureMode: string;
  triggers: string[];
  status: "active" | "deprecated" | "experimental";
  ownerPhase: FixerOwnerPhase;             // primary/grouping phase
  additionalOwnerPhases?: FixerOwnerPhase[]; // secondary phases (multi-phase fixers)
  telemetryCounter?: string;
  notes?: string;
}
```

`FixEntry` (runtime output from Normalize/preflight) now also carries `lane` for
telemetry filtering (`mechanical`, `static_gate`, `llm_repair`, `stream_suspense`,
`post_merge`, `server_repair`). Lane-namnen är runtime-värden; canonical docs
contracts finns i **Lane contracts** section below.

## Risk classes

`risk` is the verifier-policy signal for an executed fixer:

| Risk | Meaning |
|---|---|
| `safe` | Narrow deterministic hygiene: directives, escaping/quotes, known library imports, same-module dedupe, URL/asset expansion, metadata/font/config small fixes, and read-only validators. |
| `risky` | Structure or contract mutation: JSX tag/default-export rewrites, cross-file import/provider decisions, dependency additions/version bumps, regex import surgery, LLM rewrites, and server-repair passes. Unknown fixer ids are treated as `risky` at runtime. |

Many `safe` Normalize fixes are normal flow. One `risky` fix is a signal to keep verifier
coverage when the base verifier policy says it should run.

See `src/lib/gen/autofix/fixer-registry.ts` for the canonical TypeScript types.

## Categories

| Category | Meaning |
|---|---|
| `mechanical-import` | Adds/removes/rewrites import statements |
| `mechanical-syntax` | AST-level syntax repair |
| `mechanical-jsx` | JSX-tree fixes |
| `mechanical-shadcn` | shadcn/ui import-path corrections |
| `mechanical-r3f` | React Three Fiber tuple/type fixes |
| `mechanical-tailwind` | Tailwind class / @apply fixes |
| `mechanical-meta` | `Metadata` / `MetadataRoute` / `cn` imports |
| `mechanical-next-config` | next.config.ts adjustments |
| `mechanical-misc` | Cross-cutting deterministic fixes |
| `validator-syntax` | esbuild syntax check |
| `validator-jsx` | JSX checker (tag balance, default export) |
| `validator-dep` | Dependency completion + version validation |
| `llm-syntax` | RepairGate escalation for syntax/typecheck residuals |
| `llm-verifier` | RepairGate escalation for verifier-Blocker findings |
| `llm-partial-file` | RepairGate escalation for truncated file content |
| `llm-server-repair` | Server-repair-loop RepairGate passes |
| `verifier-pass` | Read-only verifier LLM (not a fixer per se) |

## Owner phases

| Phase | When it runs |
|---|---|
| `pre-syntax` | Before esbuild syntax validation, on every file |
| `post-syntax` | After syntax validation (escalation) |
| `verifier` | After preflight, when verifier policy says yes |
| `preflight` | During finalize-preflight (partial-file-repair) |
| `post-merge` | After follow-up merge against previous version |
| `server-repair` | Server-side after RenderGate/ReleaseGate failures |

A fixer can run in more than one phase: `ownerPhase` is the primary/grouping
phase, `additionalOwnerPhases` lists the rest. Example: the diagnostic-driven
import fixers (`ts2304-known-import-fixer`, `own-component-import-fixer`) run in
the shared deterministic import-repair (`autofix/deterministic-import-repair.ts`)
from BOTH the finalize Normalize pass on warm-tsc failure (`post-syntax`, before
`runLlmRepairGate`) and the server repair-loop pre-pass (`server-repair`, before
RepairGate).

## Deterministic import-repair order (Normalize + server-repair)

When tsc diagnostics exist (warm-tsc fail in finalize, or RenderGate/ReleaseGate fail in
server-repair), the deterministic import-repair runs BEFORE RepairGate, in
this order:

1. `ts2304-known-import-fixer` — TS2304/TS2552 names resolvable to a known
   library module (diagnostic-driven, whole project)
2. `own-component-import-fixer` — residual TS2304 names that are NOT library
   names but are exported by exactly one own project file (named or default)
3. TS1361 / TS2440 / TS2300 per-file fixers (`value-used-from-type-import-fixer`,
   `import-declaration-conflict-fixer`, react-import consolidation,
   `duplicate-import-binding-fixer`, `duplicate-import-local-type-collision-fixer`)
4. Mandatory post-injection dedupe + receipt per touched file:
   `consolidateReactImports` → duplicate-binding pruning → revert the file if it
   still carries *introduced* duplicate bindings or new parse errors. No fixer
   may hand over two import statements re-declaring the same local binding.

In finalize, warm-tsc is then re-run ONCE (no loop, cost cap) and only the
residual diagnostics reach RepairGate (`runLlmRepairGate`).

## Lane contracts

Lane-kontrakten för fixer-systemet. Målet är tydliga entrypoints per lane, inte en monolit.

| Lane | Entrypoint | När den kör | Input | Output | Får mutera |
|---|---|---|---|---|---|
| `mechanical` | `runAutoFix()` i `src/lib/gen/autofix/pipeline.ts` | Under Normalize när kandidatversion byggs | CodeProject-innehåll | Mekaniskt reparerat innehåll + `FixEntry[]` | Kandidatens filer |
| `static_gate` | `validateAndFix()` + `runFinalizePreflightAll()` | Efter mekanisk lane för gate-signaler | Kandidatens filer | Valideringsresultat/preflight-issues | Ingen kod (bara signaler) |
| `llm_repair` | `runLlmRepairGate()` (syntax + verifier) | När static-gate har Blocker-residual | Kandidat + fel-sammanfattning | RepairGate-reparerat kandidatinnehåll (eller noop) | Kandidatens filer |
| `stream_suspense` | `createDefaultRules(scope)` i `src/lib/gen/suspense/default-rules.ts` | Under streamning, rad-för-rad | Stream-rader | Transformerade rader före parse/finalize | Endast stream-buffer/context |
| `post_merge` | `repairGeneratedFiles()` + `fixTypeOnlyModuleDefaultImports()` | Efter merge/scaffold-preflight | Merged `CodeFile[]` | Reparerat merged filset + fixes | Merged filset |
| `server_repair` | `runRepairLoop()` i `src/lib/gen/verify/repair-loop.ts` | Efter server-verify/RenderGate-/ReleaseGate-fel | Persistad version + verifierfel | Reparerad serverversion eller early-stop | Persistad version |

Lane-gränser:

- `runAutoFix()` är entrypoint för Normalize-lanen; den producerar lane-taggade `FixEntry` (`mechanical`).
- `repairGeneratedFiles()` är separat post-merge lane; samma fixer-id kan förekomma men taggas `post_merge`. Fixar från finalize-preflight-anropet persisteras i `generation_telemetry.meta.autofix.fixers` (sedan 2026-08-01); anropen i preview-/exportvägarna loggar fortsatt bara till devLog.
- `createDefaultRules()` är enda default-väg till suspense-rules i streaming-lane.
- Server-repair (`runRepairLoop`) är separat lane men skickar LLM-residual via RepairGate.

### `stream_suspense`: två scope, en gräns som inte får suddas

`createDefaultRules()` tar ett scope. `canonical` är reparationer som hör hemma i
den sparade artefakten. `preview` är samma regler plus de som kommenterar bort
importer preview-VM:en inte kan köra (`next/og`, `next/headers`, `server-only`)
och skriver `(stripped for preview compatibility)`.

De preview-only-reglerna förstör fungerande kod. De får därför bara röra kopian
som skickas till previewen — aldrig den `finalizeAndSaveVersion` persisterar, där
`project-sanity` avvisar strippmarkören som ett strukturfel. Båda previewbanorna
måste applicera dem själva: Fly-hostbanan via `preview-session.ts` och
same-origin-shimbanan via `buildPreviewHtml`, båda genom
`src/lib/gen/preview/preview-only-files.ts`. En bana som hoppar över dem kraschar
på sparade filer med serverimporter; en bana som kör dem för tidigt sparar
sönderklippt kod. Låst av `preview-only-files.test.ts`.

### `server_repair`: ett pass får inte göra artefakten sämre

Loopen jämför blockerande preflight-fynd före och efter varje pass:

| Utfall | `earlyStopReason` | Vad loopen gör |
|---|---|---|
| Passet skapade ett blockerande fel som inte fanns innan | `blocker_regression` | rullar tillbaka till innehållet före passet och stannar |
| Samma blockerande fel finns kvar efter två pass | `blocker_unresolved` | stannar i stället för ett tredje identiskt varv |

Båda utfallen bär fyndnycklarna vidare (`introducedBlockers` /
`unresolvedBlockers`) och har egen copy i reparationsroutens svar. Rollbacken
gäller **bara** när ett nytt fel tillkom; ett kvarstående fel får fortfarande sitt
andra försök. Ägare: `src/lib/gen/verify/repair-blockers.ts`.

## Adding a new fixer

1. Implement and wire into the appropriate runner (`pipeline.ts` for mechanical,
   `finalize-version/runner.ts` for verifier-pass branch, `repair-loop.ts` for server-repair).
   Note: the original `finalize-version.ts` monolith was split during OMTAG 03; the
   verifier-pass logic now lives under `src/lib/gen/stream/finalize-version/`.
2. Append a `FixerRegistryEntry` in `fixer-registry.ts` with full metadata.
3. `fixer-registry.test.ts` kontrollerar registrets **struktur**:
   - Unique IDs
   - Non-empty triggers + targetFailureMode
   - sourcePath under `src/lib/gen/autofix/` or finalize-version/verify roots
   - risk-klass satt

   Testet kör inte pipelinen och kan därför inte bevisa att varje id som
   emitteras i runtime är registrerat. En oregistrerad fixer fångas i stället
   vid körning: `summarizeAutofixRisk` failar stängt och klassar okänt id som
   `risky`.
4. Sätt `telemetryCounter` **bara** när en verkligt skriven signal finns.
   Namnge aldrig en räknare som inget ökar — en fantomräknare läses som
   "det här mäts" och skickar nästa läsare att leta efter data som aldrig
   skrevs. Mekaniska fixers behöver ingen post: de täcks av
   `generation_telemetry.meta->'autofix'->'fixers'` (antal per fixer per
   version), som exponeras som `fixersByName` i
   `scripts/db/control-stats.mjs`.
5. The Streamlit backoffice page reads the registry directly via `mcp__filesystem__read`
   on a generated JSON snapshot (see `scripts/observability/dump-fixer-registry.mjs`).

## Deprecating a fixer

1. Set `status: "deprecated"` with a note pointing to its replacement.
2. Keep the entry in the registry until the implementation is removed
   (so historical telemetry remains attributable).
3. Remove the call from `pipeline.ts` (or wherever it runs) in a separate commit
   so the diff is reviewable.

## Related plans

- `docs/plans/avklarat/repair-loop-hardening.md` — A/B/C/D hardening steps that
  add the LLM phases visible in the registry.
- Parked idea `L1-unified-repair-call` (plan file deleted 2026-08-08, full text in
  git history) — future consolidation of the four LLM phases into one call.
