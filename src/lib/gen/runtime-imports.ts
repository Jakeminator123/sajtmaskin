/**
 * Canonical list of imports that are provided by the runtime environment
 * and should never be persisted as generated project files.
 *
 * Shared across:
 *  - cross-file-import-checker (skip stubbing)
 *  - preview renderer (skip traversal / provide built-in stubs)
 *  - snapshot repair (strip wrongly persisted files)
 */

export const RUNTIME_PROVIDED_PREFIXES = ["@/components/ui/"] as const;

export const RUNTIME_PROVIDED_EXACT = [
  "@/lib/utils",
  "@/hooks/use-mobile",
  "@/hooks/use-toast",
] as const;

export function isRuntimeProvidedImport(source: string): boolean {
  if (RUNTIME_PROVIDED_PREFIXES.some((p) => source.startsWith(p))) return true;
  return (RUNTIME_PROVIDED_EXACT as readonly string[]).includes(source);
}

export function isRuntimeProvidedFilePath(filePath: string): boolean {
  const normalized = filePath.replace(/^\//, "");
  if (normalized.startsWith("components/ui/")) return true;
  if (normalized === "lib/utils.ts" || normalized === "lib/utils.tsx") return true;
  if (normalized.startsWith("hooks/use-mobile") || normalized.startsWith("hooks/use-toast"))
    return true;
  return false;
}
