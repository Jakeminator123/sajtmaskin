# Fixer Registry

Single source of truth for every fixer/validator the generation pipeline runs.

**Source of truth:** `src/lib/gen/autofix/fixer-registry.ts` (TS const array `FIXER_REGISTRY`).

**Visualised in:** `backoffice/pages/fixer_registry.py` (Streamlit table grouped by category + phase).

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
  sourcePath: string;
  targetFailureMode: string;
  triggers: string[];
  status: "active" | "deprecated" | "experimental";
  ownerPhase: FixerOwnerPhase;
  telemetryCounter?: string;
  notes?: string;
}
```

`FixEntry` (runtime output from autofix/preflight) now also carries `lane` for
telemetry filtering (`mechanical`, `static_gate`, `llm_repair`, `stream_suspense`,
`post_merge`, `server_repair`). Canonical lane contracts: see the **Lane contracts** section below.

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
| `llm-syntax` | LLM-fixer for syntax/typecheck escalation |
| `llm-verifier` | LLM-fixer for verifier-blocking findings |
| `llm-partial-file` | LLM-fixer for truncated file content |
| `llm-server-repair` | Server-repair-loop LLM passes |
| `verifier-pass` | Read-only verifier LLM (not a fixer per se) |

## Owner phases

| Phase | When it runs |
|---|---|
| `pre-syntax` | Before esbuild syntax validation, on every file |
| `post-syntax` | After syntax validation (escalation) |
| `verifier` | After preflight, when verifier policy says yes |
| `preflight` | During finalize-preflight (partial-file-repair) |
| `post-merge` | After follow-up merge against previous version |
| `server-repair` | Server-side after quality-gate failures |

## Lane contracts

Lane-kontrakten för fixer-systemet. Målet är tydliga entrypoints per lane, inte en monolit.

| Lane | Entrypoint | När den kör | Input | Output | Får mutera |
|---|---|---|---|---|---|
| `mechanical` | `runAutoFix()` i `src/lib/gen/autofix/pipeline.ts` | Under finalize/validate när kandidatversion byggs | CodeProject-innehåll | Mekaniskt reparerat innehåll + `FixEntry[]` | Kandidatens filer |
| `static_gate` | `validateAndFix()` + `runFinalizePreflightAll()` | Efter mekanisk lane för gate-signaler | Kandidatens filer | Valideringsresultat/preflight-issues | Ingen kod (bara signaler) |
| `llm_repair` | `runLlmRepairGate()` (syntax + verifier) | När static-gate blockerar | Kandidat + fel-sammanfattning | LLM-reparerat kandidatinnehåll (eller noop) | Kandidatens filer |
| `stream_suspense` | `createDefaultRules()` i `src/lib/gen/suspense/default-rules.ts` | Under streamning, rad-för-rad | Stream-rader | Transformerade rader före parse/finalize | Endast stream-buffer/context |
| `post_merge` | `repairGeneratedFiles()` + `fixTypeOnlyModuleDefaultImports()` | Efter merge/scaffold-preflight | Merged `CodeFile[]` | Reparerat merged filset + fixes | Merged filset |
| `server_repair` | `runRepairLoop()` i `src/lib/gen/verify/repair-loop.ts` | Efter server-verify/quality-gate-fel | Persistad version + verifierfel | Reparerad serverversion eller early-stop | Persistad version |

Lane-gränser:

- `runAutoFix()` är entrypoint för mekanisk lane; den producerar lane-taggade `FixEntry` (`mechanical`).
- `repairGeneratedFiles()` är separat post-merge lane; samma fixer-id kan förekomma men taggas `post_merge`.
- `createDefaultRules()` är enda default-väg till suspense-rules i streaming-lane.
- Server-repair (`runRepairLoop`) är separat lane och konsolideras inte med autofix-lane.

## Adding a new fixer

1. Implement and wire into the appropriate runner (`pipeline.ts` for mechanical,
   `finalize-version/runner.ts` for verifier-pass branch, `repair-loop.ts` for server-repair).
   Note: the original `finalize-version.ts` monolith was split during OMTAG 03; the
   verifier-pass logic now lives under `src/lib/gen/stream/finalize-version/`.
2. Append a `FixerRegistryEntry` in `fixer-registry.ts` with full metadata.
3. The parity test (`fixer-registry.test.ts`) enforces:
   - Unique IDs
   - Non-empty triggers + targetFailureMode
   - sourcePath under `src/lib/gen/autofix/` or finalize-version/verify roots
4. If the fixer emits to telemetry, set `telemetryCounter` to the metric name.
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
- `docs/plans/archived/parked/L1-unified-repair-call.md` — future consolidation of the
  four LLM phases into one call.
