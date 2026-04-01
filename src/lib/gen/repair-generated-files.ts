import type { CodeFile } from "@/lib/gen/parser";
import {
  buildProjectExportIndex,
  buildProjectModuleExportIndex,
  fixLocalDefaultImportMismatches,
  fixMissingLocalSymbolImports,
  fixMissingReactTypeImports,
  fixNextImageImport,
} from "@/lib/gen/autofix/common-import-fixer";
import { fixCnImportConflict } from "@/lib/gen/autofix/rules/metadata-import-fixer";
import { fixAsConstBooleanKeys } from "@/lib/gen/autofix/rules/as-const-boolean-keys";
import { fixFontImport } from "@/lib/gen/autofix/rules/font-import-fixer";
import { fixReactHookImports } from "@/lib/gen/autofix/react-hook-import-fixer";
import { fixLucideImageMisuse } from "@/lib/gen/autofix/rules/lucide-image-fixer";

type RepairEntry = {
  fixer: string;
  description: string;
  file: string;
};

const LUCIDE_IMPORT_RE =
  /import\s*\{([\s\S]*?)\}\s*from\s*["']lucide-react["'];?/m;
const NEXT_LINK_IMPORT_RE = /import\s+Link\s+from\s+["']next\/link["'];?/;
const HREF_LINK_USAGE_RE = /<Link\b[^>]*\bhref=/;
const USE_CLIENT_DIRECTIVE_RE = /^["']use client["'];?\s*\n/;
const STATIC_METADATA_EXPORT_RE =
  /export\s+const\s+metadata(?:\s*:\s*Metadata)?\s*=\s*\{[\s\S]*?\n\};?\s*/m;
const GENERATE_METADATA_EXPORT_RE = /\bexport\s+(?:async\s+)?function\s+generateMetadata\b/;
const CLIENT_HOOKS_RE =
  /\b(useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer|useTransition|useOptimistic|useRouter|useSearchParams|usePathname|useParams|useSelectedLayoutSegment|useSelectedLayoutSegments|useFormStatus|useActionState)\b/;
const EVENT_HANDLERS_RE =
  /\b(onClick|onChange|onSubmit|onKeyDown|onKeyUp|onFocus|onBlur|onMouseEnter|onMouseLeave)\b/;
const BROWSER_APIS_RE = /\b(window\.|document\.|localStorage|sessionStorage|navigator\.)\b/;
const FRAMER_MOTION_IMPORT_RE = /from\s+["']framer-motion["']/;
const HTML_SCROLL_SMOOTH_RE = /(<html\b[^>]*?\bclassName=["'][^"']*)\bscroll-smooth\b([^"']*["'])/;

const NEXT_CONFIG_FILE_RE = /(^|\/)next\.config\.(ts|mts)$/i;

/** Tier 2 preview-host serves at /{projectId}/* — Next must emit /{projectId}/_next/... not /_next/... */
function ensureTier2PreviewBasePathInNextConfig(code: string, filePath: string): {
  code: string;
  fixed: boolean;
} {
  if (!NEXT_CONFIG_FILE_RE.test(filePath.replace(/\\/g, "/"))) {
    return { code, fixed: false };
  }
  if (code.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
    return { code, fixed: false };
  }
  if (/\bbasePath\s*:/.test(code)) {
    return { code, fixed: false };
  }
  const re = /(const\s+nextConfig\s*(?::\s*NextConfig\s*)?=\s*\{)/;
  if (!re.test(code)) {
    return { code, fixed: false };
  }
  const nextCode = code.replace(
    re,
    `$1\n  ...(process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim()\n    ? { basePath: process.env.SAJTMASKIN_PREVIEW_BASE_PATH.trim() }\n    : {}),`,
  );
  return { code: nextCode, fixed: nextCode !== code };
}

function insertImportAfterDirectives(code: string, importLine: string): string {
  const directiveRe = /^("use client"|'use client'|"use server"|'use server');?\s*$/gm;
  let lastDirectiveEnd = 0;

  for (const match of code.matchAll(directiveRe)) {
    lastDirectiveEnd = match.index! + match[0].length;
  }

  if (lastDirectiveEnd > 0) {
    const before = code.slice(0, lastDirectiveEnd).trimEnd();
    const after = code.slice(lastDirectiveEnd).replace(/^\s*/, "\n\n");
    return `${before}\n\n${importLine}${after}`;
  }

  return `${importLine}\n${code}`;
}

function hasUseClientDirective(code: string): boolean {
  return USE_CLIENT_DIRECTIVE_RE.test(code);
}

function hasMetadataExport(code: string): boolean {
  return STATIC_METADATA_EXPORT_RE.test(code) || GENERATE_METADATA_EXPORT_RE.test(code);
}

function needsUseClient(code: string): boolean {
  return (
    CLIENT_HOOKS_RE.test(code) ||
    EVENT_HANDLERS_RE.test(code) ||
    BROWSER_APIS_RE.test(code) ||
    FRAMER_MOTION_IMPORT_RE.test(code)
  );
}

function stripUseClientDirective(code: string): string {
  return code.replace(USE_CLIENT_DIRECTIVE_RE, "");
}

function stripMetadataImport(code: string): string {
  return code.replace(
    /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']next["'];?\s*\n?/g,
    (full, typePrefix: string | undefined, specifiers: string) => {
      const remaining = specifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part !== "Metadata" && part !== "type Metadata");

      if (remaining.length === 0) {
        return "";
      }

      const prefix = typePrefix ?? "";
      return `import ${prefix}{ ${remaining.join(", ")} } from "next";\n`;
    },
  );
}

function fixMetadataClientConflict(code: string, filePath: string): {
  code: string;
  fixed: boolean;
  fixes: RepairEntry[];
} {
  if (!hasUseClientDirective(code) || !hasMetadataExport(code)) {
    return { code, fixed: false, fixes: [] };
  }

  if (!needsUseClient(code)) {
    const nextCode = stripUseClientDirective(code);
    return {
      code: nextCode,
      fixed: nextCode !== code,
      fixes: nextCode !== code
        ? [{
            fixer: "metadata-client-conflict-fixer",
            description: 'Removed unnecessary "use client" directive from metadata file',
            file: filePath,
          }]
        : [],
    };
  }

  const withoutStaticMetadata = code.replace(STATIC_METADATA_EXPORT_RE, "");
  if (withoutStaticMetadata !== code) {
    const cleaned = stripMetadataImport(withoutStaticMetadata);
    return {
      code: cleaned,
      fixed: true,
      fixes: [{
        fixer: "metadata-client-conflict-fixer",
        description: "Removed static metadata export from client component to keep App Router valid",
        file: filePath,
      }],
    };
  }

  return { code, fixed: false, fixes: [] };
}

function fixLucideLinkImport(code: string, filePath: string): {
  code: string;
  fixed: boolean;
  fixes: RepairEntry[];
} {
  if (!HREF_LINK_USAGE_RE.test(code)) {
    return { code, fixed: false, fixes: [] };
  }

  const importMatch = code.match(LUCIDE_IMPORT_RE);
  if (!importMatch) {
    return { code, fixed: false, fixes: [] };
  }

  const names = importMatch[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (!names.includes("Link")) {
    return { code, fixed: false, fixes: [] };
  }

  const remaining = names.filter((name) => name !== "Link");
  const nextLucideImport = remaining.length > 0
    ? `import { ${remaining.join(", ")} } from "lucide-react";`
    : "";

  let nextCode = code.replace(importMatch[0], nextLucideImport);
  if (!NEXT_LINK_IMPORT_RE.test(nextCode)) {
    nextCode = insertImportAfterDirectives(nextCode, 'import Link from "next/link";');
  }

  return {
    code: nextCode,
    fixed: nextCode !== code,
    fixes: nextCode !== code
      ? [{
          fixer: "link-import-fixer",
          description: "Replaced lucide-react Link import with next/link",
          file: filePath,
        }]
      : [],
  };
}

export function repairGeneratedFiles(files: CodeFile[]): {
  files: CodeFile[];
  fixes: RepairEntry[];
} {
  const fixes: RepairEntry[] = [];
  const exportIndex = buildProjectExportIndex(files);
  const moduleExportIndex = buildProjectModuleExportIndex(files);

  const repairedFiles = files.map((file) => {
    if (!/\.(tsx?|jsx?)$/i.test(file.path)) {
      return file;
    }

    let content = file.content;

    if (NEXT_CONFIG_FILE_RE.test(file.path.replace(/\\/g, "/"))) {
      const tier2BasePathResult = ensureTier2PreviewBasePathInNextConfig(content, file.path);
      if (tier2BasePathResult.fixed) {
        content = tier2BasePathResult.code;
        fixes.push({
          fixer: "tier2-preview-basepath-next-config",
          description: "Injected conditional basePath from SAJTMASKIN_PREVIEW_BASE_PATH for preview-host URLs",
          file: file.path,
        });
      }
      return content === file.content ? file : { ...file, content };
    }

    const defaultImportResult = fixLocalDefaultImportMismatches(content, file.path, files, moduleExportIndex);
    if (defaultImportResult.fixed) {
      content = defaultImportResult.code;
      fixes.push({
        fixer: "local-default-import-fixer",
        description: `Rewired local default imports to named imports: ${defaultImportResult.rewiredImports.join(", ")}`,
        file: file.path,
      });
    }

    const fontResult = fixFontImport(content, file.path);
    if (fontResult.fixed) {
      content = fontResult.code;
      fixes.push(
        ...fontResult.fixes.map((fix) => ({
          fixer: fix.fixer,
          description: fix.description,
          file: fix.file ?? file.path,
        })),
      );
    }

    const linkResult = fixLucideLinkImport(content, file.path);
    if (linkResult.fixed) {
      content = linkResult.code;
      fixes.push(...linkResult.fixes);
    }

    const cnConflictResult = fixCnImportConflict(content, file.path);
    if (cnConflictResult.fixed) {
      content = cnConflictResult.code;
      fixes.push({
        fixer: "cn-import-conflict-fixer",
        description: "Removed conflicting local cn import from @/lib/utils",
        file: file.path,
      });
    }

    const lucideImageResult = fixLucideImageMisuse(content, file.path);
    if (lucideImageResult.fixed) {
      content = lucideImageResult.code;
      fixes.push({
        fixer: "lucide-image-fixer",
        description: "Replaced lucide-react Image with next/image",
        file: file.path,
      });
    }

    const metadataConflictResult = fixMetadataClientConflict(content, file.path);
    if (metadataConflictResult.fixed) {
      content = metadataConflictResult.code;
      fixes.push(...metadataConflictResult.fixes);
    }

    const asConstKeysResult = fixAsConstBooleanKeys(content, file.path);
    if (asConstKeysResult.fixed) {
      content = asConstKeysResult.code;
      fixes.push(...asConstKeysResult.fixes);
    }

    const hookResult = fixReactHookImports(content);
    if (hookResult.fixed) {
      content = hookResult.code;
      fixes.push({
        fixer: "react-hook-import-fixer",
        description: `Added missing React hook imports: ${hookResult.addedHooks.join(", ")}`,
        file: file.path,
      });
    }

    const reactTypeResult = fixMissingReactTypeImports(content);
    if (reactTypeResult.fixed) {
      content = reactTypeResult.code;
      fixes.push({
        fixer: "react-type-import-fixer",
        description: `Added missing React type imports: ${reactTypeResult.addedTypes.join(", ")}`,
        file: file.path,
      });
    }

    const nextImageResult = fixNextImageImport(content);
    if (nextImageResult.fixed) {
      content = nextImageResult.code;
      fixes.push({
        fixer: "next-image-import-fixer",
        description: 'Added missing `import Image from "next/image"`',
        file: file.path,
      });
    }

    if (HTML_SCROLL_SMOOTH_RE.test(content)) {
      const before = content;
      content = content.replace(
        HTML_SCROLL_SMOOTH_RE,
        (_, pre: string, post: string) => {
          const cleaned = `${pre}${post}`.replace(/\s{2,}/g, " ").replace(/"\s+"/, '"');
          return cleaned.replace(/<html\b/, '<html data-scroll-behavior="smooth"');
        },
      );
      if (content !== before) {
        fixes.push({
          fixer: "scroll-smooth-html-fixer",
          description: 'Replaced scroll-smooth className with data-scroll-behavior="smooth" on <html> for Next.js 16 compatibility',
          file: file.path,
        });
      }
    }

    const symbolResult = fixMissingLocalSymbolImports(content, file.path, exportIndex);
    if (symbolResult.fixed) {
      content = symbolResult.code;
      fixes.push({
        fixer: "local-symbol-import-fixer",
        description: `Added missing local symbol imports: ${symbolResult.addedSymbols.join(", ")}`,
        file: file.path,
      });
    }

    return content === file.content ? file : { ...file, content };
  });

  return { files: repairedFiles, fixes };
}
