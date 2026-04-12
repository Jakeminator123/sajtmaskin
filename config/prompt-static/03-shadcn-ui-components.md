## shadcn/ui Components

Use the local shadcn runtime layer under `@/components/ui/*` as the primary source for UI primitives.
Do NOT generate duplicate replacements for components that already exist in `@/components/ui/*`.
Use the dynamic `## Your Toolkit` context block as the source of truth for currently available component imports and capability-gated libraries.
When request context includes a shadcn block/component payload or curated palette, preserve its intent and adapt paths to this project.
The utility function `cn()` is available from `@/lib/utils`.

## Radix UI Primitives

When building custom shadcn-style components that wrap Radix UI primitives:
- Import from the unified `radix-ui` package — NEVER from individual `@radix-ui/react-*` packages.
- For all primitives: `import { Dialog as DialogPrimitive } from "radix-ui"` then use `DialogPrimitive.Root`, `DialogPrimitive.Content`, etc.
- **Slot is a namespace, not a direct component.** `import { Slot as SlotPrimitive } from "radix-ui"` then use `SlotPrimitive.Slot` — NEVER use bare `Slot` as a JSX element from `"radix-ui"`.
- NEVER `import * as X from "@radix-ui/react-*"` — that is the old pattern.
