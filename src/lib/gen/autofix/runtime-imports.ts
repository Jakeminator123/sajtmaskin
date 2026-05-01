/**
 * Canonical list of imports that are provided by the runtime environment
 * and should never be persisted as generated project files.
 *
 * Shared across:
 *  - cross-file-import-checker (skip stubbing)
 *  - preview renderer (skip traversal / provide built-in stubs)
 *  - snapshot repair (strip wrongly persisted files)
 *
 * `@/hooks/use-reduced-motion` is shipped verbatim by `buildCompleteProject`
 * (`hooks/use-reduced-motion.ts` baseline). It MUST stay in this list so the
 * checker never creates a competing `.tsx` stub that returns `{}` (truthy)
 * — the resolver would pick the `.tsx` and silently disable every motion
 * component that reads the hook. See plan
 * `.cursor/plans/3d-motion-stub-fix_1125d129.plan.md` for the full repro.
 */

export const RUNTIME_PROVIDED_PREFIXES = ["@/components/ui/"] as const;

export const RUNTIME_PROVIDED_EXACT = [
  "@/lib/utils",
  "@/lib/hooks/use-mobile",
  "@/lib/hooks/use-toast",
  "@/hooks/use-mobile",
  "@/hooks/use-toast",
  "@/hooks/use-reduced-motion",
] as const;

export function isRuntimeProvidedImport(source: string): boolean {
  if (RUNTIME_PROVIDED_PREFIXES.some((p) => source.startsWith(p))) return true;
  return (RUNTIME_PROVIDED_EXACT as readonly string[]).includes(source);
}
