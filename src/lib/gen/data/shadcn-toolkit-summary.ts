import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SHADCN_COMPONENTS } from "./shadcn-components";
import type { ScaffoldId } from "@/lib/gen/scaffolds/types";

const SEARCH_ROOTS = [
  join(/* turbopackIgnore: true */ process.cwd(), "src", "components", "ui"),
  join(/* turbopackIgnore: true */ process.cwd(), "components", "ui"),
] as const;

interface ToolkitGroup {
  readonly label: string;
  readonly members: readonly string[];
}

const TOOLKIT_GROUPS: readonly ToolkitGroup[] = [
  {
    label: "Core primitives",
    members: ["button", "card", "badge", "avatar", "aspect-ratio", "separator", "item"],
  },
  {
    label: "Navigation & shell",
    members: ["breadcrumb", "navigation-menu", "menubar", "sidebar", "sheet", "tabs", "pagination"],
  },
  {
    label: "Overlays & reveals",
    members: [
      "dialog",
      "alert-dialog",
      "drawer",
      "popover",
      "dropdown-menu",
      "context-menu",
      "tooltip",
      "hover-card",
    ],
  },
  {
    label: "Forms & inputs",
    members: [
      "form",
      "field",
      "input",
      "input-group",
      "textarea",
      "select",
      "native-select",
      "checkbox",
      "radio-group",
      "switch",
      "slider",
      "label",
    ],
  },
  {
    label: "Search, command & date picking",
    members: ["command", "combobox", "calendar", "input-otp"],
  },
  {
    label: "Data, charts & collections",
    members: ["table", "chart", "carousel", "accordion", "collapsible", "scroll-area", "resizable"],
  },
  {
    label: "Feedback & status",
    members: ["alert", "progress", "skeleton", "empty", "spinner", "sonner"],
  },
  {
    label: "Advanced controls",
    members: ["button-group", "toggle", "toggle-group", "kbd"],
  },
];

const SCAFFOLD_PRIMARY_GROUPS: Partial<Record<ScaffoldId, readonly string[]>> = {
  "landing-page": ["Core primitives", "Navigation & shell", "Overlays & reveals", "Feedback & status"],
  "saas-landing": ["Core primitives", "Navigation & shell", "Forms & inputs", "Overlays & reveals"],
  blog: ["Core primitives", "Navigation & shell", "Data, charts & collections"],
  portfolio: ["Core primitives", "Navigation & shell", "Overlays & reveals"],
  dashboard: ["Core primitives", "Navigation & shell", "Data, charts & collections", "Forms & inputs", "Feedback & status"],
  ecommerce: ["Core primitives", "Navigation & shell", "Forms & inputs", "Data, charts & collections", "Overlays & reveals", "Feedback & status"],
  "app-shell": ["Core primitives", "Navigation & shell", "Forms & inputs", "Data, charts & collections", "Overlays & reveals", "Feedback & status", "Search, command & date picking"],
  "auth-pages": ["Core primitives", "Forms & inputs", "Feedback & status"],
  "content-site": ["Core primitives", "Navigation & shell", "Data, charts & collections"],
  "base-nextjs": [],
};

const SECTION_TO_GROUPS: Record<string, string[]> = {
  hero: ["Core primitives"],
  pricing: ["Core primitives", "Data, charts & collections"],
  testimonials: ["Core primitives", "Data, charts & collections"],
  faq: ["Data, charts & collections"],
  contact: ["Forms & inputs"],
  auth: ["Forms & inputs", "Feedback & status"],
  login: ["Forms & inputs"],
  signup: ["Forms & inputs"],
  checkout: ["Forms & inputs", "Feedback & status"],
  search: ["Search, command & date picking"],
  dashboard: ["Data, charts & collections", "Navigation & shell"],
  settings: ["Forms & inputs", "Navigation & shell"],
  analytics: ["Data, charts & collections"],
  blog: ["Data, charts & collections", "Navigation & shell"],
  gallery: ["Core primitives", "Overlays & reveals"],
  sidebar: ["Navigation & shell"],
  modal: ["Overlays & reveals"],
  chart: ["Data, charts & collections"],
  form: ["Forms & inputs"],
  table: ["Data, charts & collections"],
  calendar: ["Search, command & date picking"],
};

export interface ScaffoldToolkitContext {
  scaffoldId?: ScaffoldId | null;
  sectionInventory?: string[];
}

function resolveRelevantGroups(ctx?: ScaffoldToolkitContext): Set<string> {
  const relevant = new Set<string>();
  if (!ctx) return relevant;

  const scaffoldGroups = ctx.scaffoldId ? SCAFFOLD_PRIMARY_GROUPS[ctx.scaffoldId] : undefined;
  if (scaffoldGroups) {
    for (const g of scaffoldGroups) relevant.add(g);
  }

  if (ctx.sectionInventory) {
    for (const section of ctx.sectionInventory) {
      const lower = section.toLowerCase();
      for (const [keyword, groups] of Object.entries(SECTION_TO_GROUPS)) {
        if (lower.includes(keyword)) {
          for (const g of groups) relevant.add(g);
        }
      }
    }
  }

  return relevant;
}

let localUiSubpathsCache: string[] | null = null;

function readLocalUiSubpaths(): string[] {
  if (localUiSubpathsCache) return localUiSubpathsCache;

  const names = new Set<string>();
  for (const root of SEARCH_ROOTS) {
    if (!existsSync(/* turbopackIgnore: true */ root)) continue;
    for (const entry of readdirSync(/* turbopackIgnore: true */ root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^(.+)\.(tsx|ts|jsx|js)$/);
      if (!match) continue;
      names.add(match[1]!);
    }
  }

  localUiSubpathsCache = [...names].sort((a, b) => a.localeCompare(b));
  return localUiSubpathsCache;
}

function getAvailableRegistrySubpaths(): string[] {
  const localSubpaths = new Set(readLocalUiSubpaths());
  const registrySubpaths = [...new Set(Object.values(SHADCN_COMPONENTS))].sort((a, b) =>
    a.localeCompare(b),
  );
  const safeLocalRegistrySubpaths = registrySubpaths.filter((subpath) => localSubpaths.has(subpath));
  return safeLocalRegistrySubpaths.length > 0 ? safeLocalRegistrySubpaths : registrySubpaths;
}

function countAvailableExportSymbols(availableSubpaths: Set<string>): number {
  return Object.values(SHADCN_COMPONENTS).filter((subpath) => availableSubpaths.has(subpath)).length;
}

function buildImportExamples(availableSet: Set<string>): string[] {
  const subpathToExports = new Map<string, string[]>();
  for (const [exportName, subpath] of Object.entries(SHADCN_COMPONENTS)) {
    if (!availableSet.has(subpath)) continue;
    const list = subpathToExports.get(subpath) ?? [];
    list.push(exportName);
    subpathToExports.set(subpath, list);
  }

  const highPriority = [
    "button", "card", "badge", "input", "label", "sheet",
    "dialog", "tabs", "select", "separator", "avatar",
    "accordion", "table",
  ];

  const examples: string[] = [];
  for (const subpath of highPriority) {
    const exports = subpathToExports.get(subpath);
    if (!exports) continue;
    const names = exports.slice(0, 5).join(", ");
    examples.push(`    import { ${names} } from "@/components/ui/${subpath}"`);
    if (examples.length >= 8) break;
  }

  return examples;
}

export function buildRegistryDrivenShadcnToolkitSummary(
  ctx?: ScaffoldToolkitContext,
): string[] {
  const availableSubpaths = getAvailableRegistrySubpaths();
  const availableSet = new Set(availableSubpaths);
  const exportCount = countAvailableExportSymbols(availableSet);
  const grouped = new Set<string>();

  const relevantGroupLabels = resolveRelevantGroups(ctx);
  const hasScaffoldContext = relevantGroupLabels.size > 0;

  const lines: string[] = [
    `  - Registry-synced local layer: ${availableSubpaths.length} safe import subpaths / ${exportCount} exported symbols are currently backed by real files under \`@/components/ui/*\`.`,
  ];

  if (hasScaffoldContext) {
    const primaryGroups: ToolkitGroup[] = [];
    const secondaryGroups: ToolkitGroup[] = [];

    for (const group of TOOLKIT_GROUPS) {
      if (relevantGroupLabels.has(group.label)) {
        primaryGroups.push(group);
      } else {
        secondaryGroups.push(group);
      }
    }

    if (primaryGroups.length > 0) {
      lines.push(`  - **Primary for this scaffold:**`);
      for (const group of primaryGroups) {
        const present = group.members.filter((m) => availableSet.has(m));
        if (present.length === 0) continue;
        for (const m of present) grouped.add(m);
        lines.push(`    - ${group.label}: ${present.join(", ")}`);
      }
    }

    if (secondaryGroups.length > 0) {
      const secondaryMembers: string[] = [];
      for (const group of secondaryGroups) {
        const present = group.members.filter((m) => availableSet.has(m));
        for (const m of present) {
          grouped.add(m);
          secondaryMembers.push(m);
        }
      }
      if (secondaryMembers.length > 0) {
        lines.push(`  - Also available: ${secondaryMembers.join(", ")}`);
      }
    }
  } else {
    for (const group of TOOLKIT_GROUPS) {
      const present = group.members.filter((member) => availableSet.has(member));
      if (present.length === 0) continue;
      for (const member of present) grouped.add(member);
      lines.push(`  - ${group.label}: ${present.join(", ")}`);
    }
  }

  const remaining = availableSubpaths.filter((subpath) => !grouped.has(subpath));
  if (remaining.length > 0) {
    lines.push(`  - Also available from the synced local registry: ${remaining.join(", ")}`);
  }

  const importExamples = buildImportExamples(availableSet);
  if (importExamples.length > 0) {
    lines.push("");
    lines.push("  Ready-to-use import statements (MUST be included at the top of every file that uses these components):");
    lines.push(...importExamples);
    lines.push(`    import Link from "next/link"`);
    lines.push(`    import Image from "next/image"`);
    lines.push(`    import type { Metadata } from "next"`);
  }

  return lines;
}
