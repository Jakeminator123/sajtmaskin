/**
 * Consolidated sections:
 * - route-plan.ts
 * - required-imports-checklist.ts
 *
 * Grouped during OMTAG-03 style refactor — no behavior change.
 */

import { FEATURES } from "@/lib/config";
import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import { renderErrorLogRagBlockLines } from "@/lib/gen/rag/error-log-retriever";
import type { RoutePlan } from "../../route-plan";
import type { ScaffoldManifest } from "../../scaffolds/types";
import type { BuildSpec } from "../../build-spec";
import { renderRecurringFailuresBlockLines } from "../recurring-failures";

export function renderRoutePlanBlock(params: {
  routePlan: RoutePlan | null | undefined;
  buildSpec: BuildSpec | null | undefined;
  isFollowUp: boolean;
  chatId: string | null | undefined;
  userPrompt: string | undefined;
  resolvedScaffold: ScaffoldManifest | null | undefined;
  ragContext?: {
    faultType?: string | null;
    routePath?: string | null;
    variantId?: string | null;
    capabilityIds?: string[];
    generationMode?: "init" | "followup" | "auto_repair" | null;
  };
}): string[] {
  const { routePlan, buildSpec, isFollowUp, chatId, userPrompt, resolvedScaffold, ragContext } = params;
  if (!routePlan || routePlan.routes.length === 0) return [];

  const parts: string[] = [];
  const routeRealization = buildSpec?.routeRealization ?? null;
  const routeMode = routeRealization?.mode ?? "full";
  const shellRoutes = routeRealization?.shellRoutePaths ?? [];
  const fullRoutes = routeRealization?.fullRoutePaths ?? routePlan.routes.map((route) => route.path);
  parts.push(
    "## Route Plan",
    "",
    `- **Site type:** ${routePlan.siteType}`,
    `- **Planning source:** ${routePlan.provenance.primarySource}`,
    `- **Route contributors:** ${routePlan.provenance.sources.join(" → ")}`,
    `- **Why:** ${routePlan.reason}`,
    "",
  );
  if (routeRealization) {
    parts.push(`- **Primary route:** \`${routeRealization.primaryRoutePath}\``);
    if (routeMode === "primary-full-with-shells") {
      parts.push(
        `- **Init realization policy:** Fully realize only \`${routeRealization.primaryRoutePath}\` in this generation. Planned extras should start as intentional shell pages.`,
      );
      parts.push(
        `- **Full routes now:** ${fullRoutes.map((path) => `\`${path}\``).join(", ")}`,
      );
      parts.push(
        `- **Shell routes now:** ${shellRoutes.map((path) => `\`${path}\``).join(", ")}`,
      );
    } else {
      parts.push(
        `- **Init realization policy:** Fully realize all planned routes in this generation when they are in scope.`,
      );
    }
    parts.push("");
  }
  for (const route of routePlan.routes.slice(0, 10)) {
    const routeModeLabel =
      routeMode === "primary-full-with-shells"
        ? route.path === routeRealization?.primaryRoutePath
          ? " [full now]"
          : shellRoutes.includes(route.path)
            ? " [shell now]"
            : ""
        : "";
    parts.push(
      `- \`${route.path}\` — ${route.name}${routeModeLabel}: ${route.intent}${route.required ? " (must exist)" : ""}`,
    );
  }
  if (routeMode === "primary-full-with-shells") {
    parts.push(
      "",
      "- For shell routes, create valid App Router pages that look intentional: include page title, route purpose, a short explanation of what the page will become, and a clear primary CTA such as 'Skapa sida'.",
      "- Shell routes should feel like deliberate builder-owned placeholder states, not broken pages. It is fine if they use a bold branded theme treatment to signal 'this route exists and is ready to be expanded next'.",
      "- Keep shell code lightweight, coherent, and safe to preview. They should preserve navigation, metadata surface, and internal linking without pretending to be fully implemented.",
      "- Keep most design and implementation budget on the primary route. Extra planned routes should preserve IA, navigation, metadata, and internal linking without demanding full implementation yet.",
    );
    if (isFollowUp) {
      parts.push(
        "- **Shell preservation rule (follow-up):** These shell routes already exist as intentional placeholders. Do NOT replace, expand, redesign, or regenerate them unless the user explicitly asks to build out that specific page. If your change does not target a shell route, omit it from your response entirely so it is kept as-is.",
      );
    }
  } else if (routePlan.routes.length > 1) {
    parts.push(
      "",
      "- Do not collapse this into a single long landing page. Create real App Router page files for the required routes unless the user explicitly asks to simplify.",
    );
  } else {
    parts.push("", "- Keep the route structure compact unless the prompt clearly requires extra pages.");
  }
  parts.push(
    "- Generate routes in the project's primary language only. Do not emit both '/contact' and '/kontakt' — pick one based on the brief locale.",
  );

  // Hard contract: list the canonical paths the LLM is allowed to use in
  // navigation expressions. This catches the /blog vs /blogg failure mode
  // where the LLM emits href="/blog/${slug}" against actual route /blogg.
  // Mirror of the deterministic preflight check in
  // src/lib/gen/verify/href-route-cross-check.ts.
  const canonicalPaths = routePlan.routes.map((route) => route.path);
  parts.push(
    "",
    "### Canonical route paths (use these EXACTLY in href/Link/router.push/redirect)",
    "",
    ...canonicalPaths.map((path) => `- \`${path}\``),
    "",
    "Hard rules for navigation expressions:",
    "- Never invent paths that are not in the list above.",
    "- For slug-based detail pages, reuse the listing route's path as prefix (e.g. if `/blogg` is listed, use `\\`/blogg/${slug}\\`` — never `\\`/blog/${slug}\\``).",
    "- The finalize preflight runs a deterministic href ↔ route cross-check; mismatches surface as warnings in the version error log and may block future builds.",
    "- Sub-routes (anything other than `/`) MUST NOT auto-redirect back to `/`. Even when the scaffold is one-page-marketing, sub-routes are intentional and must render their own content. NEVER emit `router.push('/')`, `redirect('/')`, or `window.location.href = '/'` inside a sub-route page, layout, or client component on mount. The only legitimate redirect-on-mount target from a sub-route is to a sibling sub-route after a real user action (e.g. successful form submit) — never the root.",
  );
  parts.push("");

  // Phase 2D — recurring failures block. Only on follow-ups (init has no
  // historical patterns), only when the FEATURES.recurringPatternsInMainPrompt
  // toggle is on, and only when there is real signal. Inserted right after
  // the canonical-route-paths block so the model sees both "where to go"
  // and "what not to repeat" together. See renderRecurringFailuresBlockLines.
  if (
    (isFollowUp || (FEATURES.recurringPatternsInCreatePrompt && chatId)) &&
    FEATURES.recurringPatternsInMainPrompt
  ) {
    const recurringLines = renderRecurringFailuresBlockLines(chatId);
    if (recurringLines.length > 0) {
      parts.push(...recurringLines);
    }
  }

  // Phase 3.4 — Vector RAG block. When enabled, retrieves top-K
  // similar past failures from the deterministic TF-IDF index built
  // by `scripts/observability/index-error-log-rag.mjs` and renders
  // them as `### Lessons from similar past builds`. Auto-rebuilt at
  // npm run dev|build|start (see scripts/dev/next-runner.mjs hook).
  // Capped at 800 chars; falls silently when index is empty/missing.
  if (FEATURES.useErrorLogRag) {
    const ragLines = renderErrorLogRagBlockLines({
      prompt: userPrompt ?? "",
      faultType: ragContext?.faultType ?? null,
      routePath:
        ragContext?.routePath ??
        buildSpec?.routeRealization?.primaryRoutePath ??
        routePlan.routes[0]?.path ??
        null,
      scaffoldId: resolvedScaffold?.id ?? buildSpec?.scaffoldId ?? null,
      variantId: ragContext?.variantId ?? null,
      capabilityIds: ragContext?.capabilityIds ?? buildSpec?.capabilityFlags?.signals ?? [],
      generationMode:
        ragContext?.generationMode ??
        (buildSpec?.generationMode === "followUp"
          ? "followup"
          : buildSpec?.generationMode === "init"
            ? "init"
            : null),
      // lineageHash is not surfaced into DynamicContextOptions today; the
      // retriever happily works without it. P26 follow-up could thread it
      // through orchestration-snapshot.
    });
    if (ragLines.length > 0) {
      parts.push(...ragLines);
    }
  }

  return parts;
}

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

const COMMON_LUCIDE_ICONS = {
  "UI controls": ["Plus", "Minus", "X", "Check", "ChevronDown", "ChevronRight", "ChevronLeft", "ChevronUp"],
  Navigation: ["Menu", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "ExternalLink", "Home"],
  Status: ["Info", "AlertCircle", "AlertTriangle", "CheckCircle", "XCircle", "Loader", "Clock"],
  Social: ["Github", "Twitter", "Linkedin", "Facebook", "Instagram", "Mail", "Phone", "MapPin"],
  "Common UI": ["Search", "Settings", "User", "Users", "Heart", "Star", "Eye", "EyeOff", "Download", "Upload", "Share", "Copy", "Edit", "Trash"],
  "Brands/Tech": ["Sparkles", "Zap", "Wand", "Bot", "Brain", "Cpu"],
} as const;

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

export function renderLucideIconsReminderBlock(): string[] {
  return [
    "### Lucide icons commonly needed",
    "",
    ...Object.entries(COMMON_LUCIDE_ICONS).map(
      ([category, iconNames]) => `- ${category}: ${iconNames.join(", ")}`,
    ),
    "",
    "CRITICAL: Each icon used in JSX MUST be imported from \"lucide-react\". Group all lucide imports in ONE statement at top of file. Example: import { Menu, X, ArrowRight, Sparkles } from \"lucide-react\";",
    "",
  ];
}

/** Exposed for tests only. */
export const __testing = {
  collectGroups,
  GROUP_COMPONENTS,
  BASELINE_GROUPS,
  COMMON_LUCIDE_ICONS,
};
