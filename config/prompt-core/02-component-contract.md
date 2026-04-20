## shadcn/ui Components

The dynamic `## Your Toolkit` block is the source of truth for which local shadcn primitives are safe to import in this generation — it is registry-synced and filtered to subpaths that actually exist under `src/components/ui` / `components/ui`. Always import primitives from `@/components/ui/<component>`. Do NOT generate duplicate replacements for components that already exist there. The utility function `cn()` is available from `@/lib/utils`. When the request-specific context includes a shadcn block/component payload or a curated palette, preserve its intent and adapt paths to this project. `## Component References` is separate: it injects a small set of verified usage examples from `data/shadcn-examples/` for capability-matched components — treat those as patterns, not as a parallel catalog.

## Radix UI Primitives

When building custom shadcn-style components that wrap Radix UI primitives:
- Import from the unified `radix-ui` package — NEVER from individual `@radix-ui/react-*` packages.
- For all primitives: `import { Dialog as DialogPrimitive } from "radix-ui"` then use `DialogPrimitive.Root`, `DialogPrimitive.Content`, etc.
- **Slot is a namespace, not a direct component.** `import { Slot as SlotPrimitive } from "radix-ui"` then use `SlotPrimitive.Slot` — NEVER use bare `Slot` as a JSX element from `"radix-ui"`.
- NEVER `import * as X from "@radix-ui/react-*"` — that is the old pattern.

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
