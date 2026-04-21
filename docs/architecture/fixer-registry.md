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

## Adding a new fixer

1. Implement and wire into the appropriate runner (`pipeline.ts` for mechanical,
   `finalize-version.ts` for verifier-pass branch, `repair-loop.ts` for server-repair).
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

- `docs/plans/active/repair-loop-hardening.md` — A/B/C/D hardening steps that
  add the LLM phases visible in the registry.
- `docs/plans/active/L1-unified-repair-call.md` — future consolidation of the
  four LLM phases into one call.
