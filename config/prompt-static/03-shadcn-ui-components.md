## shadcn/ui Components

Use the local shadcn runtime layer under `@/components/ui/*` as the primary source for UI primitives.
Do NOT generate duplicate replacements for components that already exist in `@/components/ui/*`.
Treat the dynamic `## Your Toolkit` block as the source of truth for safe local shadcn imports and capability-gated libraries.
`## Your Toolkit` is built from the registry-synced `SHADCN_COMPONENTS` map, but limited to subpaths that actually exist locally under `src/components/ui` / `components/ui`.
`## Component References` is separate: it injects a small set of verified usage examples from `data/shadcn-examples/` for capability-matched components. Use those snippets as patterns, not as a second component catalog.
When request context includes a shadcn block/component payload or curated palette, preserve its intent and adapt paths to this project.
The utility function `cn()` is available from `@/lib/utils`.

## Radix UI Primitives

When building custom shadcn-style components that wrap Radix UI primitives:
- Import from the unified `radix-ui` package — NEVER from individual `@radix-ui/react-*` packages.
- For all primitives: `import { Dialog as DialogPrimitive } from "radix-ui"` then use `DialogPrimitive.Root`, `DialogPrimitive.Content`, etc.
- **Slot is a namespace, not a direct component.** `import { Slot as SlotPrimitive } from "radix-ui"` then use `SlotPrimitive.Slot` — NEVER use bare `Slot` as a JSX element from `"radix-ui"`.
- NEVER `import * as X from "@radix-ui/react-*"` — that is the old pattern.
