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
 */

/** Module specifiers that indicate a tier-3 backend SDK. */
const TIER3_SDK_MODULES: readonly string[] = [
  "stripe",
  "@stripe/stripe-js",
  "@stripe/react-stripe-js",
  "@clerk/nextjs",
  "@clerk/clerk-sdk-node",
  "@clerk/clerk-react",
  "next-auth",
  "@auth/core",
  "@auth/nextjs",
  "@auth0/nextjs-auth0",
  "@auth0/auth0-react",
  "@supabase/supabase-js",
  "@supabase/ssr",
  "@supabase/auth-helpers-nextjs",
  "mongodb",
  "mongoose",
  "redis",
  "ioredis",
  "@upstash/redis",
  "@upstash/ratelimit",
  "resend",
  "@react-email/render",
  "openai",
];

/**
 * Names of the tier-3 SDK modules. Re-exportable so Core Rules and prompt
 * blocks can be generated from the same source.
 */
export function listTier3SdkModules(): readonly string[] {
  return TIER3_SDK_MODULES;
}

const TIER3_MODULE_SET = new Set(TIER3_SDK_MODULES);

function isTier3Module(specifier: string): boolean {
  if (TIER3_MODULE_SET.has(specifier)) return true;
  // Match scoped subpath imports too (e.g. "@stripe/stripe-js/server").
  for (const mod of TIER3_SDK_MODULES) {
    if (mod.startsWith("@") && specifier.startsWith(`${mod}/`)) return true;
  }
  return false;
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
    if (match && isTier3Module(match[1])) {
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
