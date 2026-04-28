import { SHADCN_COMPONENTS } from "@/lib/gen/data/shadcn-components";
import type { SuspenseRule, StreamContext } from "./transform";
import { lucideIconFix } from "./rules/lucide-icon-fix";

const IMPORT_RE =
  /^(\s*import\s*\{)([^}]+)(\}\s*from\s*)(["'])@\/components\/ui\4\s*(;?)(\s*)$/;

function resolveSubpath(names: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const name of names) {
    const subpath = SHADCN_COMPONENTS[name];
    if (subpath) {
      const existing = grouped.get(subpath) ?? [];
      existing.push(name);
      grouped.set(subpath, existing);
    }
  }
  return grouped;
}

const shadcnImportFix: SuspenseRule = {
  name: "shadcn-import-fix",
  transform(line: string, _context: StreamContext): string {
    const match = line.match(IMPORT_RE);
    if (!match) return line;

    const [, prefix, rawNames, middle, quote, semi, trailing] = match;
    const names = rawNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    if (names.length === 0) return line;

    const grouped = resolveSubpath(names);
    if (grouped.size === 0) return line;

    if (grouped.size === 1) {
      const [subpath, groupedNames] = [...grouped.entries()][0];
      return `${prefix} ${groupedNames.join(", ")} ${middle}${quote}@/components/ui/${subpath}${quote}${semi}${trailing}`;
    }

    const lines: string[] = [];
    const unknowns = names.filter((n) => !SHADCN_COMPONENTS[n]);

    for (const [subpath, groupedNames] of grouped) {
      lines.push(
        `${prefix} ${groupedNames.join(", ")} ${middle}${quote}@/components/ui/${subpath}${quote}${semi}`,
      );
    }

    if (unknowns.length > 0) {
      lines.push(
        `${prefix} ${unknowns.join(", ")} ${middle}${quote}@/components/ui${quote}${semi}`,
      );
    }

    return lines.join("\n");
  },
};

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

const radixImportFix: SuspenseRule = {
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

const ALIAS_RE = /\{\{([A-Za-z][A-Za-z0-9_-]*(?:_\d+)?)\}\}/g;

const urlAliasExpand: SuspenseRule = {
  name: "url-alias-expand",
  transform(line: string, context: StreamContext): string {
    if (!context.urlMap) return line;
    if (!line.includes("{{")) return line;
    return line.replace(ALIAS_RE, (full, key: string) => {
      return context.urlMap?.[key] ?? full;
    });
  },
};

const FC_RE = /:\s*React\.FC(<[^>]*>)?/;
const JSX_RETURN_RE = /\):\s*JSX\.Element\s*\{/;
const PROPS_ANY_RE = /\(props:\s*any\)/;

const typeAnnotationFix: SuspenseRule = {
  name: "type-annotation-fix",
  transform(line: string, _context: StreamContext): string {
    let result = line;

    if (FC_RE.test(result)) {
      result = result.replace(FC_RE, "");
    }
    if (JSX_RETURN_RE.test(result)) {
      result = result.replace(/\):\s*JSX\.Element\s*\{/, ") {");
    }
    if (PROPS_ANY_RE.test(result)) {
      result = result.replace(PROPS_ANY_RE, "(props: Record<string, unknown>)");
    }

    return result;
  },
};

const SEMANTIC_SUFFIX_RE =
  /(bg|text|border|ring|outline)-(primary|secondary|accent|muted|destructive)-\d{2,3}/g;
const DARK_BG_RE = /dark:bg-(?:gray|slate|zinc|neutral)-\d{2,3}/g;
const DARK_TEXT_WHITE_RE = /dark:text-white/g;
const DARK_TEXT_GRAY_RE = /dark:text-(?:gray|slate|zinc|neutral)-\d{2,3}/g;
const CLASS_CONTEXT_RE = /className|class=|cn\(|clsx\(|twMerge\(/;
const BG_WHITE_RE = /\bbg-white\b/g;
const TEXT_BLACK_RE = /\btext-black\b/g;

const tailwindClassFix: SuspenseRule = {
  name: "tailwind-class-fix",
  transform(line: string, _context: StreamContext): string {
    let result = line;

    result = result.replace(SEMANTIC_SUFFIX_RE, "$1-$2");
    result = result.replace(DARK_BG_RE, "dark:bg-background");
    result = result.replace(DARK_TEXT_WHITE_RE, "dark:text-foreground");
    result = result.replace(DARK_TEXT_GRAY_RE, "dark:text-foreground");

    if (CLASS_CONTEXT_RE.test(result)) {
      result = result.replace(BG_WHITE_RE, "bg-background");
      result = result.replace(TEXT_BLACK_RE, "text-foreground");
    }

    return result;
  },
};

const IMPORT_PREFIX = "import ";
const FROM_KEYWORD = " from ";

function createDuplicateImportRule(): SuspenseRule {
  const seen = new Set<string>();

  return {
    name: "duplicate-import-fix",
    transform(line: string, _context: StreamContext): string {
      const trimmed = line.trim();
      if (trimmed.startsWith(IMPORT_PREFIX) && trimmed.includes(FROM_KEYWORD)) {
        if (seen.has(trimmed)) return "";
        seen.add(trimmed);
      }
      return line;
    },
  };
}

const EXPORTED_RE = /^export\s/;
const FUNC_RE = /^function\s+[A-Z][a-zA-Z0-9]*\s*[(<]/;
const CONST_RE = /^const\s+[A-Z][a-zA-Z0-9]*\s*[=:]/;

const missingExportFix: SuspenseRule = {
  name: "missing-export-fix",
  transform(line: string, _context: StreamContext): string {
    if (EXPORTED_RE.test(line)) return line;
    if (line.startsWith(" ") || line.startsWith("\t")) return line;

    if (FUNC_RE.test(line)) {
      return `export default ${line}`;
    }
    if (CONST_RE.test(line)) {
      return `export ${line}`;
    }

    return line;
  },
};

const NEXT_OG_RE = /^\s*import\s.*from\s+["']next\/og["']/;
const NEXT_SERVER_RE =
  /^(\s*import\s*\{)([^}]+)(\}\s*from\s+["']next\/server["'].*)$/;
const STRIP_SPECIFIERS = new Set(["ImageResponse"]);

const nextOgStrip: SuspenseRule = {
  name: "next-og-strip",
  transform(line: string, _context: StreamContext): string {
    if (NEXT_OG_RE.test(line)) {
      return "// next/og not available in preview";
    }

    const serverMatch = line.match(NEXT_SERVER_RE);
    if (!serverMatch) return line;

    const [, prefix, rawNames, suffix] = serverMatch;
    const names = rawNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const kept = names.filter(
      (n) => !STRIP_SPECIFIERS.has(n.split(/\s+as\s+/)[0].trim()),
    );

    if (kept.length === names.length) return line;
    if (kept.length === 0) return "// ImageResponse not available in preview";

    return `${prefix} ${kept.join(", ")} ${suffix}`;
  },
};

const AI_PATH_RE = /src\s*=\s*["']\/ai\/([^"']+)["']/g;

const imageSrcFix: SuspenseRule = {
  name: "image-src-fix",
  transform(line) {
    if (!line.includes("/ai/")) return line;
    return line.replace(AI_PATH_RE, (_match, filename: string) => {
      const name = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, "+");
      return `src="/placeholder.svg?height=400&width=600&text=${encodeURIComponent(name)}"`;
    });
  },
};

const BLOCK_ENTIRELY = [
  /^\s*import\s+.*\s+from\s+["']next\/og["']/,
  /^\s*import\s+.*\s+from\s+["']server-only["']/,
  /^\s*import\s+.*\s+from\s+["']next\/headers["']/,
];

const forbiddenImportStrip: SuspenseRule = {
  name: "forbidden-import-strip",
  transform(line) {
    const trimmed = line.trim();
    for (const re of BLOCK_ENTIRELY) {
      if (re.test(trimmed)) return `// ${trimmed} (stripped for preview compatibility)`;
    }
    return line;
  },
};

const ATTR_MAP: Array<[RegExp, string]> = [
  [/\bclass=/g, "className="],
  [/\bfor=/g, "htmlFor="],
  [/\bonclick=/g, "onClick="],
  [/\bonchange=/g, "onChange="],
  [/\bonsubmit=/g, "onSubmit="],
  [/\bonkeydown=/g, "onKeyDown="],
  [/\btabindex=/g, "tabIndex="],
  [/\bautocomplete=/g, "autoComplete="],
  [/\breadonly(?==)/g, "readOnly"],
];

const jsxAttributeFix: SuspenseRule = {
  name: "jsx-attribute-fix",
  transform(line) {
    if (!line.includes("=")) return line;
    let result = line;
    for (const [pattern, replacement] of ATTR_MAP) {
      result = result.replace(pattern, replacement);
    }
    return result;
  },
};

const BARE_PATH_RE = /from\s+["']((?:components|lib|app|hooks)\/[^"']+)["']/g;

const relativeImportFix: SuspenseRule = {
  name: "relative-import-fix",
  transform(line) {
    if (!line.includes("from")) return line;
    return line.replace(BARE_PATH_RE, (_match, p: string) => `from "@/${p}"`);
  },
};

/**
 * Build a fresh rule set. Called per-stream so stateful rules
 * (like duplicate-import-fix) start with a clean slate.
 */
export function createDefaultRules(): SuspenseRule[] {
  return [
    shadcnImportFix,
    lucideIconFix,
    radixImportFix,
    urlAliasExpand,
    typeAnnotationFix,
    tailwindClassFix,
    createDuplicateImportRule(),
    missingExportFix,
    nextOgStrip,
    imageSrcFix,
    forbiddenImportStrip,
    jsxAttributeFix,
    relativeImportFix,
  ];
}

