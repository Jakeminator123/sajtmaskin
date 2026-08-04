import type { AutoFixEntry } from "../pipeline";

// ---------------------------------------------------------------------------
// Radix UI: @radix-ui/react-* → "radix-ui" monorepo imports
// ---------------------------------------------------------------------------

const PACKAGE_TO_RADIX_EXPORT: Record<string, string> = {
  "@radix-ui/react-slot": "Slot",
  "@radix-ui/react-dialog": "Dialog",
  "@radix-ui/react-dropdown-menu": "DropdownMenu",
  "@radix-ui/react-tabs": "Tabs",
  "@radix-ui/react-tooltip": "Tooltip",
  "@radix-ui/react-accordion": "Accordion",
  "@radix-ui/react-collapsible": "Collapsible",
  "@radix-ui/react-select": "Select",
  "@radix-ui/react-switch": "Switch",
  "@radix-ui/react-checkbox": "Checkbox",
  "@radix-ui/react-label": "Label",
  "@radix-ui/react-scroll-area": "ScrollArea",
  "@radix-ui/react-separator": "Separator",
  "@radix-ui/react-avatar": "Avatar",
  "@radix-ui/react-popover": "Popover",
  "@radix-ui/react-progress": "Progress",
  "@radix-ui/react-slider": "Slider",
  "@radix-ui/react-toggle": "Toggle",
  "@radix-ui/react-toggle-group": "ToggleGroup",
  "@radix-ui/react-hover-card": "HoverCard",
  "@radix-ui/react-navigation-menu": "NavigationMenu",
  "@radix-ui/react-radio-group": "RadioGroup",
  "@radix-ui/react-context-menu": "ContextMenu",
  "@radix-ui/react-menubar": "Menubar",
  "@radix-ui/react-alert-dialog": "AlertDialog",
  "@radix-ui/react-aspect-ratio": "AspectRatio",
};

const OLD_RADIX_NAMESPACE_RE =
  /^(\s*)import\s+\*\s+as\s+(\w+)\s+from\s+["'](@radix-ui\/react-[\w-]+)["']\s*;?\s*$/;

const OLD_RADIX_NAMED_RE =
  /^(\s*)import\s+\{([^}]+)\}\s+from\s+["'](@radix-ui\/react-[\w-]+)["']\s*;?\s*$/;

export function fixRadixImports(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const nsMatch = line.match(OLD_RADIX_NAMESPACE_RE);
    if (nsMatch) {
      const [, indent, alias, pkg] = nsMatch;
      const exportName = PACKAGE_TO_RADIX_EXPORT[pkg];
      if (exportName) {
        lines[i] = `${indent}import { ${exportName} as ${alias} } from "radix-ui"`;
        fixes.push({
          fixer: "import-validator",
          description: `Converted namespace import from "${pkg}" to unified "radix-ui"`,
          line: i + 1,
        });
      }
      continue;
    }

    const namedMatch = line.match(OLD_RADIX_NAMED_RE);
    if (namedMatch) {
      const [, indent, rawNames, pkg] = namedMatch;
      const exportName = PACKAGE_TO_RADIX_EXPORT[pkg];
      if (exportName) {
        const names = rawNames.trim();
        lines[i] = `${indent}import { ${names} } from "radix-ui"`;
        fixes.push({
          fixer: "import-validator",
          description: `Converted named import from "${pkg}" to unified "radix-ui"`,
          line: i + 1,
        });
      }
    }
  }

  return { code: lines.join("\n"), fixes };
}

// ---------------------------------------------------------------------------
// Slot namespace fix: bare `Slot` from "radix-ui" → `SlotPrimitive.Slot`
// ---------------------------------------------------------------------------

export function fixRadixSlotUsage(code: string): { code: string; fixes: AutoFixEntry[] } {
  const fixes: AutoFixEntry[] = [];

  const slotImportRe = /^(\s*)import\s+\{\s*Slot\s*\}\s+from\s+["']radix-ui["']/m;
  const match = code.match(slotImportRe);
  if (!match) return { code, fixes };

  const usesSlotDot = /SlotPrimitive\./.test(code);
  if (usesSlotDot) return { code, fixes };

  const usedAsBareJsx = /<Slot[\s/>]/.test(code) || /\?\s*Slot\s*:/.test(code);
  if (!usedAsBareJsx) return { code, fixes };

  let fixed = code.replace(slotImportRe, "$1import { Slot as SlotPrimitive } from \"radix-ui\"");
  fixed = fixed.replace(/\basChild\s*\?\s*Slot\s*:/g, "asChild ? SlotPrimitive.Slot :");
  fixed = fixed.replace(/<Slot(\s)/g, "<SlotPrimitive.Slot$1");
  fixed = fixed.replace(/<Slot>/g, "<SlotPrimitive.Slot>");
  fixed = fixed.replace(/<\/Slot>/g, "</SlotPrimitive.Slot>");

  if (fixed !== code) {
    fixes.push({
      fixer: "import-validator",
      description: "Fixed bare Slot usage from radix-ui namespace to SlotPrimitive.Slot",
      line: 0,
    });
  }

  return { code: fixed, fixes };
}
