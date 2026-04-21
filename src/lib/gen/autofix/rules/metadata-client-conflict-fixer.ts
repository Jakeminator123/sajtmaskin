/**
 * Mechanical fixer: strip `"use client"` from files that export page
 * metadata (Next.js App Router forbids that combo). Falls back to
 * removing the static metadata export when the file genuinely needs
 * client-side hooks/handlers.
 *
 * Extracted from `src/lib/gen/autofix/pipeline.ts` 2026-04-21.
 */

import type { FixEntry } from "../types";

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
    (_full, typePrefix: string | undefined, specifiers: string) => {
      const remaining = specifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part !== "Metadata" && part !== "type Metadata");
      if (remaining.length === 0) return "";
      const prefix = typePrefix ?? "";
      return `import ${prefix}{ ${remaining.join(", ")} } from "next";\n`;
    },
  );
}

export function fixMetadataClientConflict(
  code: string,
  filePath: string,
): { code: string; fixed: boolean; fixes: FixEntry[] } {
  if (!hasUseClientDirective(code) || !hasMetadataExport(code)) {
    return { code, fixed: false, fixes: [] };
  }

  if (!needsUseClient(code)) {
    const nextCode = stripUseClientDirective(code);
    return {
      code: nextCode,
      fixed: nextCode !== code,
      fixes:
        nextCode !== code
          ? [
              {
                fixer: "metadata-client-conflict-fixer",
                category: "mechanical",
                description:
                  'Removed unnecessary "use client" directive from metadata file',
                file: filePath,
              },
            ]
          : [],
    };
  }

  const withoutStaticMetadata = code.replace(STATIC_METADATA_EXPORT_RE, "");
  if (withoutStaticMetadata !== code) {
    const cleaned = stripMetadataImport(withoutStaticMetadata);
    return {
      code: cleaned,
      fixed: true,
      fixes: [
        {
          fixer: "metadata-client-conflict-fixer",
          category: "mechanical",
          description:
            "Removed static metadata export from client component to keep App Router valid",
          file: filePath,
        },
      ],
    };
  }

  return { code, fixed: false, fixes: [] };
}
