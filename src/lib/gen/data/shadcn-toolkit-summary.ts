import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SHADCN_COMPONENTS } from "./shadcn-components";

const SEARCH_ROOTS = [
  join(process.cwd(), "src", "components", "ui"),
  join(process.cwd(), "components", "ui"),
] as const;

const TOOLKIT_GROUPS = [
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
] as const;

let localUiSubpathsCache: string[] | null = null;

function readLocalUiSubpaths(): string[] {
  if (localUiSubpathsCache) return localUiSubpathsCache;

  const names = new Set<string>();
  for (const root of SEARCH_ROOTS) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
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

export function buildRegistryDrivenShadcnToolkitSummary(): string[] {
  const availableSubpaths = getAvailableRegistrySubpaths();
  const availableSet = new Set(availableSubpaths);
  const exportCount = countAvailableExportSymbols(availableSet);
  const grouped = new Set<string>();

  const lines: string[] = [
    `  - Registry-synced local layer: ${availableSubpaths.length} safe import subpaths / ${exportCount} exported symbols are currently backed by real files under \`@/components/ui/*\`.`,
  ];

  for (const group of TOOLKIT_GROUPS) {
    const present = group.members.filter((member) => availableSet.has(member));
    if (present.length === 0) continue;
    for (const member of present) grouped.add(member);
    lines.push(`  - ${group.label}: ${present.join(", ")}`);
  }

  const remaining = availableSubpaths.filter((subpath) => !grouped.has(subpath));
  if (remaining.length > 0) {
    lines.push(`  - Also available from the synced local registry: ${remaining.join(", ")}`);
  }

  return lines;
}
