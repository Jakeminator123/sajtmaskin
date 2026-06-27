/**
 * Recursively `Object.freeze` a value and everything it transitively owns.
 *
 * Used to make module-level config registries (scaffolds, scaffold-variants)
 * immutable at load time, so the shared manifest/variant objects that callers
 * receive from `getScaffoldById` / `getVariantById` / etc. can never be mutated
 * in place. This removes a whole class of hard-to-trace global-state drift bugs
 * where one pipeline step accidentally edits an object another step relies on.
 *
 * Idempotent (skips already-frozen values, which also makes it cycle-safe) and
 * a no-op for primitives. Returns the same reference so it can wrap an
 * expression inline: `return deepFreeze(buildManifest());`.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
