import type { SuspenseRule, StreamContext } from "../transform";

const RADIX_PKG_RE: Record<string, string> = {
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

const NS_IMPORT_RE =
  /^(\s*)import\s+\*\s+as\s+(\w+)\s+from\s+(["'])(@radix-ui\/react-[\w-]+)\3\s*(;?)\s*$/;
const NAMED_IMPORT_RE =
  /^(\s*)import\s+\{([^}]+)\}\s+from\s+(["'])(@radix-ui\/react-[\w-]+)\3\s*(;?)\s*$/;

export const radixImportFix: SuspenseRule = {
  name: "radix-import-fix",

  transform(line: string, _context: StreamContext): string {
    const nsMatch = line.match(NS_IMPORT_RE);
    if (nsMatch) {
      const [, indent, alias, quote, pkg, semi] = nsMatch;
      const exportName = RADIX_PKG_RE[pkg];
      if (exportName) {
        return `${indent}import { ${exportName} as ${alias} } from ${quote}radix-ui${quote}${semi}`;
      }
      return line;
    }

    const namedMatch = line.match(NAMED_IMPORT_RE);
    if (namedMatch) {
      const [, indent, names, quote, pkg, semi] = namedMatch;
      if (RADIX_PKG_RE[pkg]) {
        return `${indent}import { ${names.trim()} } from ${quote}radix-ui${quote}${semi}`;
      }
    }

    return line;
  },
};
