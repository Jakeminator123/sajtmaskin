export {
  createSuspenseTransform,
  type SuspenseRule,
  type StreamContext,
} from "./transform";

export { shadcnImportFix } from "./rules/shadcn-import-fix";
export { lucideIconFix } from "./rules/lucide-icon-fix";
export { urlAliasExpand } from "./rules/url-alias-expand";
export { typeAnnotationFix } from "./rules/type-annotation-fix";
export { tailwindClassFix } from "./rules/tailwind-class-fix";
export { createDuplicateImportRule } from "./rules/duplicate-import-fix";
export { missingExportFix } from "./rules/missing-export-fix";
export { nextOgStrip } from "./rules/next-og-strip";
export { imageSrcFix } from "./rules/image-src-fix";
export { forbiddenImportStrip } from "./rules/forbidden-import-strip";
export { jsxAttributeFix } from "./rules/jsx-attribute-fix";
export { relativeImportFix } from "./rules/relative-import-fix";

import { createSuspenseTransform, type StreamContext } from "./transform";
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

/**
 * Build a fresh rule set. Called per-stream so stateful rules
 * (like duplicate-import-fix) start with a clean slate.
 */
export function createDefaultRules(): SuspenseRule[] {
  return [
    shadcnImportFix,
    lucideIconFix,
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

/**
 * Creates a TransformStream pre-configured with all standard rules.
 *
 * Usage in a route handler:
 * ```ts
 * const transform = createDefaultSuspenseTransform({ urlMap });
 * const processed = rawStream.pipeThrough(transform);
 * ```
 */
export function createDefaultSuspenseTransform(
  context: StreamContext = {},
): TransformStream<string, string> {
  return createSuspenseTransform(createDefaultRules(), context);
}
