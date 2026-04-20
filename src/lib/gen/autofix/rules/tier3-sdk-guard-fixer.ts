/**
 * F2 SDK guard — strip imports of tier-3 backend SDKs from F2 ("design")
 * generations. F2 is meant to iterate visually with mocks; importing
 * Stripe/Supabase/Clerk/etc. in F2 just bloats output and confuses
 * users (the buttons appear to do something but the SDK is inert).
 *
 * Activated whenever the autofix context's `previewPolicy` is anything other
 * than `"fidelity3"` — including absent/undefined, which we treat as F2 so
 * legacy callers without an explicit buildSpec still get the guard.
 * In F3 ("bygg integrationer") this fixer is a no-op so the LLM output
 * passes through verbatim.
 *
 * Categorised as `mechanical` so it shows up in the deterministic-fix
 * telemetry alongside other autofix steps.
 *
 * The deny-list itself lives in `config/integrations/tier3-sdk-deny.json`
 * and is read via `src/lib/integrations/tier3-sdk-deny.ts`. The same loader
 * also feeds the `## Generation Stage: F2 / Design (HARD CONTRACT)` block in
 * `system-prompt.ts`, so the LLM instruction and this mechanical strip can
 * never drift apart.
 */

import {
  isTier3SdkModule,
  listTier3SdkModules as loaderListTier3SdkModules,
} from "@/lib/integrations/tier3-sdk-deny";

/**
 * Names of the tier-3 SDK modules. Re-exported so Core Rules and prompt
 * blocks can be generated from the same source.
 */
export function listTier3SdkModules(): readonly string[] {
  return loaderListTier3SdkModules();
}

const IMPORT_LINE_RE =
  /^\s*import\s+(?:type\s+)?(?:[\w*${},\s]+from\s+)?["']([^"']+)["'];?\s*$/;

export interface Tier3SdkGuardResult {
  code: string;
  removedModules: string[];
}

/**
 * Remove top-level `import …from "<tier-3 sdk>"` statements. Leaves
 * any other code alone — call sites that depended on the import will
 * still fail typecheck, which is intentional: the LLM should not have
 * emitted them in F2 in the first place, and the guard surfaces that
 * via the next pass (jsx-checker / tsc) rather than silently masking it.
 */
export function fixTier3SdkImports(code: string): Tier3SdkGuardResult {
  const removed: string[] = [];
  const lines = code.split(/\r?\n/);
  const kept: string[] = [];

  for (const line of lines) {
    const match = line.match(IMPORT_LINE_RE);
    if (match && isTier3SdkModule(match[1])) {
      removed.push(match[1]);
      continue;
    }
    kept.push(line);
  }

  if (removed.length === 0) {
    return { code, removedModules: [] };
  }
  return { code: kept.join("\n"), removedModules: removed };
}
