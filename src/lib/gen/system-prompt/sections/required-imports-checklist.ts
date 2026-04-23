/**
 * E4 — Required Imports Checklist.
 *
 * Deterministic, prompt-time render of the shadcn/ui components the model is
 * most likely to use, grouped by import source. The goal is to stop the
 * codegen-LLM from calling `<Card>`/`<Badge>`/`<Input>`/... without the
 * matching `import { … } from "@/components/ui/<subpath>"` — which is the
 * single biggest driver of `autofix.heavy_load` (import-validator adds ~11
 * imports per run on average; most of them are mechanical forgetfulness the
 * model would have emitted correctly if the checklist were present).
 *
 * Sources:
 *   - `SHADCN_COMPONENTS` (runtime source of truth for component → subpath).
 *   - `capabilityHints` string (already rendered by `buildCapabilityHints`) —
 *     we pattern-match it instead of re-doing the capability inference so
 *     this block cannot drift from the `## Detected Capabilities` block.
 *   - `routePlan.routes[].path` — surface a few common route hints (contact,
 *     pricing) so the baseline set is explicit even when capability-inference
 *     did not pick them up.
 *
 * Keep this focused: the "Required Imports Checklist" block must stay short
 * enough that the LLM *reads* it. A block that enumerates 40 components is
 * indistinguishable from no block.
 */

import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import type { RoutePlan } from "../../route-plan";

export interface RequiredImportsChecklistParams {
  routePlan?: RoutePlan | null;
  capabilityHints?: string | null;
}

/**
 * Public group key. Ordered so the rendered table keeps a predictable
 * top-to-bottom flow: layout → content → forms → feedback → overlays.
 * Values are the keys we emit into the inferred set; mapping to actual
 * component names happens in `GROUP_COMPONENTS`.
 */
type ChecklistGroup =
  | "button"
  | "card"
  | "badge"
  | "separator"
  | "input"
  | "label"
  | "textarea"
  | "form"
  | "tabs"
  | "table"
  | "carousel"
  | "dialog"
  | "sheet"
  | "drawer"
  | "popover"
  | "calendar"
  | "command"
  | "skeleton"
  | "progress"
  | "sidebar";

/**
 * Canonical component list per group. Kept tight — only the specifiers the
 * LLM actually forgets most often (Card forgets CardHeader; Form forgets
 * FormField/FormMessage). Anything beyond these the LLM can derive from the
 * shadcn toolkit summary elsewhere in the prompt.
 */
const GROUP_COMPONENTS: Record<ChecklistGroup, readonly string[]> = {
  button: ["Button"],
  card: ["Card", "CardContent", "CardDescription", "CardFooter", "CardHeader", "CardTitle"],
  badge: ["Badge"],
  separator: ["Separator"],
  input: ["Input"],
  label: ["Label"],
  textarea: ["Textarea"],
  form: ["Form", "FormControl", "FormDescription", "FormField", "FormItem", "FormLabel", "FormMessage"],
  tabs: ["Tabs", "TabsContent", "TabsList", "TabsTrigger"],
  table: ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"],
  carousel: ["Carousel", "CarouselContent", "CarouselItem", "CarouselNext", "CarouselPrevious"],
  dialog: ["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle", "DialogTrigger"],
  sheet: ["Sheet", "SheetContent", "SheetDescription", "SheetFooter", "SheetHeader", "SheetTitle", "SheetTrigger"],
  drawer: ["Drawer", "DrawerContent", "DrawerDescription", "DrawerFooter", "DrawerHeader", "DrawerTitle", "DrawerTrigger"],
  popover: ["Popover", "PopoverContent", "PopoverTrigger"],
  calendar: ["Calendar"],
  command: ["Command", "CommandEmpty", "CommandGroup", "CommandInput", "CommandItem", "CommandList"],
  skeleton: ["Skeleton"],
  progress: ["Progress"],
  sidebar: [
    "Sidebar",
    "SidebarContent",
    "SidebarFooter",
    "SidebarGroup",
    "SidebarHeader",
    "SidebarMenu",
    "SidebarMenuButton",
    "SidebarMenuItem",
    "SidebarProvider",
    "SidebarTrigger",
  ],
};

/** Baseline groups — always included. These are the components that turn up
 *  in almost every landing/portfolio/brochure generation. */
const BASELINE_GROUPS: readonly ChecklistGroup[] = ["button", "card", "badge"];

/**
 * Capability → group mapping. Keys are the `capabilityHints` bullet markers
 * rendered by `buildCapabilityHints`; matching is intentionally substring-
 * based on the lowercased hints text so minor wording drift does not break
 * the mapping.
 */
const CAPABILITY_TO_GROUPS: ReadonlyArray<{ needle: string; groups: readonly ChecklistGroup[] }> = [
  { needle: "forms requested", groups: ["input", "label", "textarea", "form"] },
  { needle: "auth pages requested", groups: ["input", "label", "form", "dialog"] },
  { needle: "carousel/slider requested", groups: ["carousel"] },
  { needle: "app shell requested", groups: ["sidebar", "sheet", "tabs", "table", "skeleton", "progress", "separator"] },
  { needle: "data table / crud requested", groups: ["table", "input", "separator"] },
  { needle: "search/command palette requested", groups: ["command", "dialog"] },
  { needle: "calendar/date selection requested", groups: ["calendar", "popover"] },
  { needle: "e-commerce requested", groups: ["sheet", "dialog", "drawer", "carousel", "separator"] },
  { needle: "payments requested", groups: ["dialog"] },
];

/** Route-path → group hints. Used when capabilityHints is empty or misses
 *  a route-specific component pool. Matching is prefix-based on the route
 *  path so `/kontakt` and `/kontakt/form` both trigger. */
const ROUTE_TO_GROUPS: ReadonlyArray<{ prefixes: readonly string[]; groups: readonly ChecklistGroup[] }> = [
  { prefixes: ["/contact", "/kontakt"], groups: ["input", "label", "textarea", "form"] },
  { prefixes: ["/pricing", "/priser", "/prices"], groups: ["separator"] },
  { prefixes: ["/login", "/logga-in", "/register", "/registrera", "/signup", "/signin", "/sign-in", "/sign-up"], groups: ["input", "label", "form"] },
  { prefixes: ["/dashboard", "/admin", "/backoffice", "/instrumentpanel"], groups: ["sidebar", "sheet", "table", "tabs", "skeleton"] },
  { prefixes: ["/search", "/sok", "/sök"], groups: ["command", "dialog"] },
];

function collectGroups(params: RequiredImportsChecklistParams): ChecklistGroup[] {
  const selected = new Set<ChecklistGroup>(BASELINE_GROUPS);

  const hints = params.capabilityHints?.toLowerCase() ?? "";
  if (hints) {
    for (const entry of CAPABILITY_TO_GROUPS) {
      if (hints.includes(entry.needle)) {
        for (const group of entry.groups) selected.add(group);
      }
    }
  }

  const routes = params.routePlan?.routes ?? [];
  for (const route of routes) {
    const path = route.path?.toLowerCase() ?? "";
    if (!path) continue;
    for (const entry of ROUTE_TO_GROUPS) {
      if (entry.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
        for (const group of entry.groups) selected.add(group);
      }
    }
  }

  // Return in the declared order of `ChecklistGroup` so the rendered table
  // is stable across runs regardless of detection order.
  const ORDER: readonly ChecklistGroup[] = [
    "button",
    "card",
    "badge",
    "separator",
    "input",
    "label",
    "textarea",
    "form",
    "tabs",
    "table",
    "carousel",
    "dialog",
    "sheet",
    "drawer",
    "popover",
    "calendar",
    "command",
    "skeleton",
    "progress",
    "sidebar",
  ];
  return ORDER.filter((group) => selected.has(group));
}

function renderRow(group: ChecklistGroup): string | null {
  const specifiers = GROUP_COMPONENTS[group];
  if (!specifiers || specifiers.length === 0) return null;

  // Cross-check against SHADCN_COMPONENTS so the subpath cannot drift from
  // the authoritative registry. If any specifier is missing there we skip
  // the row entirely rather than emit a broken import suggestion.
  const subpaths = new Set(specifiers.map((name) => SHADCN_COMPONENTS[name]));
  if (subpaths.size !== 1) return null;
  const subpath = subpaths.values().next().value as string | undefined;
  if (!subpath) return null;

  const joined = specifiers.join(", ");
  return `| ${joined} | \`import { ${joined} } from "@/components/ui/${subpath}";\` |`;
}

/**
 * Deterministic builder for the Required Imports Checklist section.
 *
 * Returns a list of prompt lines (already split), or an empty array when
 * there is nothing actionable to render (e.g. neither capabilityHints nor
 * routePlan was provided — the block would just repeat the static baseline
 * and eat token budget for no gain).
 */
export function renderRequiredImportsChecklistBlock(
  params: RequiredImportsChecklistParams,
): string[] {
  const hasAnyContext =
    Boolean(params.capabilityHints && params.capabilityHints.trim()) ||
    Boolean(params.routePlan && params.routePlan.routes.length > 0);
  if (!hasAnyContext) return [];

  const groups = collectGroups(params);
  const rows = groups.map(renderRow).filter((line): line is string => Boolean(line));
  if (rows.length === 0) return [];

  return [
    "## Required Imports Checklist",
    "",
    "If your code uses these components, the matching import MUST be present. Do NOT rely on the post-generation import-validator to add them for you — it wastes tokens and can pick the wrong casing/module.",
    "",
    "| Component(s) | Import |",
    "|---|---|",
    ...rows,
    "",
    "Rules:",
    "- Merge into an existing `@/components/ui/<subpath>` import statement when one already exists for that subpath — do not duplicate the statement.",
    "- Only import specifiers you actually reference in JSX/TS. The table above is a reminder, not a requirement to import everything.",
    "- React hooks (`useState`, `useEffect`, …) and `next/navigation` hooks (`useRouter`, `usePathname`, …) still need their own `import { … } from \"react\"` / `\"next/navigation\"` lines when used.",
    "",
  ];
}

/** Exposed for tests only. */
export const __testing = {
  collectGroups,
  GROUP_COMPONENTS,
  BASELINE_GROUPS,
};
