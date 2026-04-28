## shadcn/ui Components

The dynamic `## Your Toolkit` block is the source of truth for which local shadcn primitives are safe to import in this generation — it is registry-synced and filtered to subpaths that actually exist under `src/components/ui` / `components/ui`. Always import primitives from `@/components/ui/<component>`. Do NOT generate duplicate replacements for components that already exist there. **Every file that renders a shadcn JSX tag must include its own `import` from `@/components/ui/...`** — importing the primitive in `app/layout.tsx` does not make it available to other files. The utility function `cn()` is available from `@/lib/utils`. When the request-specific context includes a shadcn block/component payload or a curated palette, preserve its intent and adapt paths to this project. `## Component References` is separate: it injects a small set of verified usage examples from `data/shadcn-examples/` for capability-matched components — treat those as patterns, not as a parallel catalog.

## Radix UI Primitives

When building custom shadcn-style components that wrap Radix UI primitives:
- Import from the unified `radix-ui` package — NEVER from individual `@radix-ui/react-*` packages.
- For all primitives: `import { Dialog as DialogPrimitive } from "radix-ui"` then use `DialogPrimitive.Root`, `DialogPrimitive.Content`, etc.
- **Slot is a namespace, not a direct component.** `import { Slot as SlotPrimitive } from "radix-ui"` then use `SlotPrimitive.Slot` — NEVER use bare `Slot` as a JSX element from `"radix-ui"`.
- NEVER `import * as X from "@radix-ui/react-*"` — that is the old pattern.

## Type-only Imports

When a binding is used **only** to annotate a type (prop type, ref generic, event handler), import it with `import type` — NEVER plain `import`. Mixing the two styles inside one specifier (`X as type Y`) is invalid TypeScript and a recurring generation bug.

**Lucide icons as prop type** — keep the `LucideIcon` type separate from the icon value:

```tsx
import type { LucideIcon } from "lucide-react";
import { Star } from "lucide-react";

type Feature = { icon: LucideIcon; label: string };
const features: Feature[] = [{ icon: Star, label: "Kvalitet" }];
```

NEVER write `import { Star, Type as type LucideIcon } from "lucide-react"` — the stray `type` keyword between `as` and the alias is invalid syntax.

**Reused prop types from another component** — use `import type` so the runtime value isn't pulled in:

```tsx
import type { ButtonProps } from "@/components/ui/button";
```

**`VariantProps` from `class-variance-authority`** — the type helper is type-only; `cva` is the runtime value:

```tsx
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

const badgeVariants = cva("inline-flex items-center", {
  variants: { tone: { default: "bg-primary", outline: "border" } },
});
type BadgeProps = VariantProps<typeof badgeVariants>;
```

**Counter-examples — what NOT to do.** These three mistakes caused a real bug where a generated `/showcase` route rendered as a white page (chat `341cdc37...`, 2026-04-23). Every one is deterministic and fixable upstream — do not ship them.

```tsx
// ❌ NEVER — TS1361. If an icon is used as JSX or as a value in data,
// it MUST be a value import, not `import type`.
import type { Building2, Camera } from "lucide-react";
const features = [{ icon: Building2 }];   // TS1361 here
<Camera className="h-4 w-4" />            // TS1361 here

// ✅ CORRECT — value import.
import { Building2, Camera } from "lucide-react";
```

```tsx
// ❌ NEVER — HTMLFormElement is a DOM interface, not a React component.
// Using it as a JSX tag is an unresolved symbol and Next build fails.
<HTMLFormElement onSubmit={handleSubmit}>…</HTMLFormElement>

// ✅ CORRECT — use the lowercase HTML tag.
<form onSubmit={handleSubmit}>…</form>
// If you need the DOM type in an event handler signature, use
// `FormEvent<HTMLFormElement>`: `import type { FormEvent } from "react";`
// then `function handleSubmit(e: FormEvent<HTMLFormElement>) {}`.
```

```tsx
// ❌ NEVER — re-declaring an imported identifier as a local type causes
// TS2300 duplicate-identifier errors AND shadows the import so the
// runtime value is unreachable.
import ShowcaseVehicle from "@/components/showcase-vehicle";
export type ShowcaseVehicle = { make: string };

// ✅ CORRECT — pick one: either the import IS the value (then the local
// type must have a distinct name), or the module you are importing from
// only exports a type (then use `import type`).
import ShowcaseVehicleCard from "@/components/showcase-vehicle";
export type ShowcaseVehicle = { make: string };
// or:
import type { ShowcaseVehicle } from "@/components/showcase-vehicle";
```

## Compositions and High-Risk Usage Patterns

These are non-trivial compositions or import patterns where the model frequently gets it wrong. The simple "this component exists, here is its tag" cases are already covered by the dynamic Toolkit block — only patterns with real failure modes live here.

- **Form**: Always pair with `useForm()` from `react-hook-form` + a `zod` schema + `@hookform/resolvers/zod`. Structure: `<Form><FormField control={form.control} name="x" render={({ field }) => <FormItem><FormLabel /><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />`. Skipping the resolver or wiring `name` to a value that is not in the schema silently breaks validation.
- **DataTable** (composition): use `@tanstack/react-table` for column definitions, sorting, filtering, and pagination logic; render with the shadcn Table primitives (`<Table><TableHeader><TableBody><TableRow><TableCell>`). Do not invent a manual table — DataTable is a composition, not a single component.
- **Chart**: `<ChartContainer config={chartConfig}><BarChart data={data}>` wraps Recharts. Always use `<ChartTooltip content={<ChartTooltipContent />} />` — NOT raw Recharts `Tooltip`. Mixing them produces unstyled tooltips.
- **Calendar**: `<Calendar mode="single" selected={date} onSelect={setDate} />` wraps `react-day-picker`. Supports `mode="range"` for date spans. NEVER build a manual date grid — Calendar handles navigation, selection, and accessibility.
- **DatePicker** (composition): Calendar + Popover + `format(date, "PPP")` from `date-fns`. Trigger with a Button inside `PopoverTrigger`.
- **Combobox**: a local `@/components/ui/combobox` wrapper exists. Preferred pattern: `<Combobox><ComboboxInput ... /><ComboboxContent><ComboboxList><ComboboxItem ... /></ComboboxList></ComboboxContent></Combobox>`. Use the local wrapper directly unless a lower-level custom composition is intentional.
- **Sonner** (toasts) — import-fall trap: `toast("Message")` or `toast.success("Done")` must be imported as `import { toast } from "sonner"`. Do NOT import `toast` from `"@/components/ui/sonner"` — that file only exports the `Toaster` provider.
- **InputOTP**: `<InputOTP maxLength={6}><InputOTPGroup><InputOTPSlot index={0} />...` for verification codes. Wraps `input-otp`. The `index` prop on each slot must match its position; mismatched indexes break paste-fill.
- **next-themes ThemeProvider**: in `app/layout.tsx`, wrap `{children}` directly inside `<body>` — `<body><ThemeProvider attribute="class" defaultTheme="system" enableSystem>{children}</ThemeProvider></body>`. NEVER place it inside `<main>` or wrap only the page content; header / footer / fixed overlays render outside `<main>` and would otherwise stay locked to the system theme even after the user toggles dark mode. Toggle from a `"use client"` component via `const { setTheme } = useTheme()`. Without the body-level provider, every theme hook crashes and the dark-mode switch only re-paints the page body.

## No Empty Stub Modules

Do NOT emit placeholder files such as `components/booking-form-state.tsx` that contain only a `// TODO` comment, an empty default export, or a stubbed type alias with no consumers. If a feature is not implemented in this generation, omit the file entirely. Empty stubs ship as dead code, confuse the file panel, and trigger false-positive "missing import" autofix loops.

Acceptable: a file exists with full implementation, or it does not exist at all. Anything in between (single-line export, empty function body, "data-stub-pattern" placeholders) is a regression and must not be shipped.

Specifically: a component file that contains only `export default function X() { return null }` is a placeholder, not a real component. If a feature isn't implemented, omit the file. If a component must conditionally render nothing, return `null` from inside a real return guard, not as the entire component body.

## 3D and React Three Fiber Policy

Use `three`, `@react-three/fiber`, and `@react-three/drei` ONLY when the user explicitly asks for a real 3D scene. Trigger phrases (English): "3D", "WebGL", "three.js", "React Three Fiber", "R3F", "physics", "interactive 3D model", or any unambiguous description like "a floating drum that rotates above the header". Trigger phrases (Swedish): "3D", "tre-dimensionell", "trumma som svävar/snurrar", "modell som roterar", "interaktiv 3D-scen". When the prompt is unambiguous about a real 3D object, use R3F even if the word "3D" is missing — a "floating drum that catches the light" is R3F territory.

For decorative 3D-looking effects (subtle parallax, glowing card, layered hero atmospheric), prefer CSS gradients, transforms, layered SVG, `framer-motion`, and `mix-blend-mode` — they ship without WebGL boot cost and don't fail under reduced-motion. If you do introduce R3F, also USE it in real emitted code; do not add `three` to `package.json` and then leave the canvas empty.
