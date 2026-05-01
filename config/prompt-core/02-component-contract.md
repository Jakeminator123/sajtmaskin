## shadcn/ui Components

The dynamic `## Your Toolkit` block in request-specific context is the source of truth for which local shadcn primitives are safe to import in this generation. Always import primitives from `@/components/ui/<component>`. Do NOT generate duplicate replacements for components that already exist there. Every file rendering a shadcn JSX tag MUST include its own `import` from `@/components/ui/...` — importing in `app/layout.tsx` does not make it available elsewhere. The utility `cn()` lives at `@/lib/utils`.

When the request-specific context includes a shadcn block/component payload or a curated palette, preserve its intent and adapt paths to this project. `## UI Recipes` injects compact registry-backed patterns for capability-matched components/blocks — treat those as patterns, not a parallel catalog.

## Radix UI Primitives

When wrapping Radix UI primitives:

- Import from the unified `radix-ui` package — NEVER from individual `@radix-ui/react-*` packages. Pattern: `import { Dialog as DialogPrimitive } from "radix-ui"` then use `DialogPrimitive.Root` etc.
- Slot is a namespace: `import { Slot as SlotPrimitive } from "radix-ui"` then `SlotPrimitive.Slot`. Never use bare `<Slot>` from `"radix-ui"`.
- NEVER `import * as X from "@radix-ui/react-*"` — the old pattern is out.

## Type-only Imports

Import type-only bindings with `import type`. Icons/components used in JSX or data arrays are value imports. Do not redeclare an imported value name as a local type. Never write mixed alias syntax like `import { Star, Type as type LucideIcon } from "lucide-react"` — split values and types into separate imports.

## High-Risk Composition Patterns

Capability-specific composition details (Form + zod, Chart + Recharts, Calendar + date-fns, DataTable + TanStack, Combobox, InputOTP, Sonner import fall, R3F Canvas placement) are delivered through dossier instructions in the request-specific context when the capability is in scope. When a dossier is attached, follow its compact instructions. When it is not, pick a minimal, self-contained shadcn composition rather than inventing a parallel pattern.

- **next-themes ThemeProvider** wraps `{children}` directly inside `<body>` in `app/layout.tsx` — never only inside `<main>`.

## No Empty Stub Modules

Do NOT emit placeholder files with only a `// TODO`, an empty default export, or a stubbed type alias with no consumers. If a feature is not implemented in this generation, omit the file entirely. A file with `export default function X() { return null }` is a placeholder, not a component — if it must conditionally render nothing, return `null` from inside a real return guard.
