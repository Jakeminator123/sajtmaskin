import type { SuspenseRule } from "./transform";
import { shadcnImportFix } from "./rules/shadcn-import-fix";
import { lucideIconFix } from "./rules/lucide-icon-fix";
import { urlAliasExpand } from "./rules/url-alias-expand";
import { typeAnnotationFix } from "./rules/type-annotation-fix";
import { tailwindClassFix } from "./rules/tailwind-class-fix";
import { createDuplicateImportRule } from "./rules/duplicate-import-fix";
import { missingExportFix } from "./rules/missing-export-fix";
import { nextOgStrip } from "./rules/next-og-strip";
import { imageSrcFix } from "./rules/image-src-fix";
import { forbiddenImportStrip } from "./rules/forbidden-import-strip";
import { jsxAttributeFix } from "./rules/jsx-attribute-fix";
import { relativeImportFix } from "./rules/relative-import-fix";
import { radixImportFix } from "./rules/radix-import-fix";

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

