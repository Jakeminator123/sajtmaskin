/**
 * Tier-3 ("tredje gradens") build specification.
 *
 * The structured contract that drives F3 ("bygg integrationer"):
 * which integrations need to be wired up, exactly which env keys must
 * have real values before the F3 build can succeed at runtime, and a
 * compact list of build instructions per integration that becomes a
 * dynamic-context block for the F3 LLM.
 *
 * Derivation pipeline:
 *
 *   PreGenerationContractContext  ─┐
 *                                  │  deriveTier3BuildSpec()
 *   integrationRegistry            ├──────────────────────► Tier3BuildSpec
 *                                  │
 *   PLACEHOLDER_HARMLESS_ENV_KEYS ─┘
 *
 * Used by:
 *  - `POST /api/engine/chats/[chatId]/finalize-design` — calls
 *    `validateTier3Readiness()` and refuses to start F3 generation
 *    when required real env keys are missing.
 *  - F3 dynamic context — `## Tier-3 Integration Build Plan` block
 *    rendering `requirements[].buildInstructions`.
 *  - F3 placeholder merge — tier-3 stub layer is dropped via
 *    `resolvePreviewEnvLayers({ lifecycleStage: "integrations" })`.
 */
import type {
  PlanContracts,
  PlanIntegrationContract,
} from "@/lib/gen/plan/schema";
import {
  integrationRegistry,
  integrationRegistryByKey,
  type IntegrationDefinition,
} from "@/lib/integrations/registry";
import { partitionEnvKeysByTier } from "@/lib/integrations/placeholder-harmless";

export interface Tier3IntegrationRequirement {
  /** Integration key, matches `IntegrationDefinition.key`. */
  key: string;
  /** Human-readable name. */
  name: string;
  /** Provider id (often equal to key; from `IntegrationDefinition.provider`). */
  provider: string;
  /**
   * Env keys that MUST have real values before F3 can succeed.
   * Subset of `IntegrationDefinition.envVars` excluding placeholder-harmless keys.
   */
  requiredRealEnvKeys: string[];
  /**
   * Env keys that may keep their placeholder value even in F3.
   * Subset of `IntegrationDefinition.envVars` matching `PLACEHOLDER_HARMLESS_ENV_KEYS`.
   */
  placeholderOkEnvKeys: string[];
  /** 4-8 concrete build steps for the F3 LLM. */
  buildInstructions: string[];
  /** Vendor setup guide (re-exported from `IntegrationDefinition.setupGuide`). */
  setupGuide: string;
}

export interface Tier3BuildSpec {
  /** Required tier-3 integrations, sorted alphabetically by key for stable output. */
  requirements: Tier3IntegrationRequirement[];
}

export interface Tier3ReadinessReport {
  /** True when every required real env key has a non-empty value. */
  ready: boolean;
  /** Per-integration breakdown of missing keys. Empty array when ready. */
  missingByIntegration: Array<{
    key: string;
    name: string;
    missing: string[];
  }>;
}

/**
 * Build instructions per integration. Conservative defaults — each list is
 * enough to wire the integration end-to-end without dictating UI choices.
 * Unknown integrations fall back to a generic "wire env vars" instruction.
 */
const BUILD_INSTRUCTIONS: Record<string, string[]> = {
  stripe: [
    "Add a `/api/checkout/route.ts` POST handler that constructs a Stripe checkout session from `STRIPE_SECRET_KEY`.",
    "Wire the primary CTA on the pricing/plans page to POST to `/api/checkout` and redirect to the returned `url`.",
    "Add a `/api/stripe/webhook/route.ts` POST handler that verifies signatures with `STRIPE_WEBHOOK_SECRET`.",
    "Add `/checkout/success` and `/checkout/cancel` pages that read the session id from the URL and render the outcome.",
    "Use `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` only in client components, never the secret key.",
    "Document the required env vars in a top-of-file comment in `/api/checkout/route.ts`.",
  ],
  supabase: [
    "Initialize a Supabase server client in `lib/supabase/server.ts` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.",
    "Initialize a Supabase browser client in `lib/supabase/browser.ts` for client components.",
    "Add a typed `Database` interface stub in `lib/supabase/types.ts` to be replaced with generated types.",
    "Wire data fetches in server components/route handlers to the server client; use the browser client only for realtime/auth.",
    "Add a top-of-file comment listing required env vars in each `lib/supabase/*.ts` file.",
  ],
  clerk: [
    "Wrap `app/layout.tsx` in `<ClerkProvider>` from `@clerk/nextjs`.",
    "Add `middleware.ts` at project root with `clerkMiddleware()` and matcher excluding static assets.",
    "Add `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx` rendering Clerk's `<SignIn />` / `<SignUp />`.",
    "Use `auth()` from `@clerk/nextjs/server` in protected route handlers and server components.",
    "Document `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in a top-of-file comment in `middleware.ts`.",
  ],
  "next-auth": [
    "Add `app/api/auth/[...nextauth]/route.ts` exporting `GET`/`POST` from `NextAuth(authOptions)`.",
    "Define `authOptions` in `lib/auth.ts` with provider list and session strategy.",
    "Use `auth()` (or `getServerSession`) in server components and route handlers to gate access.",
    "Wrap client components needing session data in `<SessionProvider>`.",
    "Document required `AUTH_SECRET` and provider env vars in a top-of-file comment in `lib/auth.ts`.",
  ],
  "vercel-blob": [
    "Add `/api/upload/route.ts` POST handler using `@vercel/blob` `put()` with `BLOB_READ_WRITE_TOKEN`.",
    "Wire upload UI to POST FormData to `/api/upload` and store returned URL.",
    "Add a top-of-file comment listing required env vars.",
  ],
  upstash: [
    "Initialize an Upstash Redis client in `lib/redis.ts` from `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.",
    "Wire rate-limit / cache helpers to use the client.",
    "Add a top-of-file comment listing required env vars.",
  ],
  mongodb: [
    "Add a `lib/mongodb.ts` that exports a singleton `MongoClient` connected via `MONGODB_URI`.",
    "Use the singleton in server components and route handlers; never expose the URI to the client.",
    "Add a top-of-file comment documenting `MONGODB_URI` and SSL/IP allowlist requirements.",
  ],
  resend: [
    "Add a `lib/email.ts` that initializes a Resend client from `RESEND_API_KEY`.",
    "Add `/api/contact/route.ts` (or similar) that calls `resend.emails.send(...)`.",
    "Document `RESEND_API_KEY` and `EMAIL_FROM` in a top-of-file comment.",
  ],
  openai: [
    "Initialize an OpenAI client in `lib/openai.ts` from `OPENAI_API_KEY`.",
    "Wire AI features to a server-side route handler; never expose the key to the client.",
    "Document `OPENAI_API_KEY` in a top-of-file comment.",
  ],
};

const FALLBACK_INSTRUCTIONS = (def: IntegrationDefinition): string[] => [
  `Wire ${def.name} using its standard SDK and the env keys: ${def.envVars.join(", ") || "(none required)"}.`,
  `Initialize the client in a dedicated module (e.g. \`lib/${def.key}.ts\`) and reuse the instance.`,
  `Document required env vars in a top-of-file comment.`,
];

function resolveBuildInstructions(def: IntegrationDefinition): string[] {
  const explicit = BUILD_INSTRUCTIONS[def.key];
  if (explicit && explicit.length > 0) return explicit;
  return FALLBACK_INSTRUCTIONS(def);
}

function uniqueProviderIntegrations(
  contracts: PlanContracts,
): PlanIntegrationContract[] {
  const seen = new Set<string>();
  const out: PlanIntegrationContract[] = [];
  for (const integration of contracts.integrations) {
    const id = integration.provider || integration.name;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(integration);
  }
  return out;
}

function findIntegrationDefinition(
  integration: PlanIntegrationContract,
): IntegrationDefinition | undefined {
  const byProviderId = integrationRegistryByKey.get(integration.provider);
  if (byProviderId) return byProviderId;
  for (const def of integrationRegistry) {
    if (def.provider === integration.provider) return def;
    if (def.name.toLowerCase() === (integration.name ?? "").toLowerCase()) {
      return def;
    }
  }
  return undefined;
}

/**
 * Build a Tier-3 spec from the contracts the orchestrator already inferred.
 * Only `chosen` (or unresolved-but-named) integrations contribute; `optional`
 * integrations without a status are skipped because the user hasn't asked
 * for them yet.
 */
export function deriveTier3BuildSpec(
  contracts: PlanContracts,
): Tier3BuildSpec {
  const requirements: Tier3IntegrationRequirement[] = [];

  for (const integration of uniqueProviderIntegrations(contracts)) {
    if (integration.status === "optional") continue;
    const def = findIntegrationDefinition(integration);
    if (!def) continue;

    const envKeys = integration.envVars && integration.envVars.length > 0
      ? integration.envVars
      : def.envVars;
    const { harmless, tier3 } = partitionEnvKeysByTier(envKeys);

    requirements.push({
      key: def.key,
      name: def.name,
      provider: def.provider ?? def.key,
      requiredRealEnvKeys: tier3,
      placeholderOkEnvKeys: harmless,
      buildInstructions: resolveBuildInstructions(def),
      setupGuide: def.setupGuide,
    });
  }

  requirements.sort((a, b) => a.key.localeCompare(b.key));
  return { requirements };
}

/**
 * Validate F3 readiness against the project's stored env vars.
 * `projectEnvVars` should already be decrypted (e.g. from
 * `getStoredProjectEnvVarMap`). A key is satisfied when it has a non-empty
 * trimmed value.
 */
export function validateTier3Readiness(
  spec: Tier3BuildSpec,
  projectEnvVars: Record<string, string>,
): Tier3ReadinessReport {
  const missingByIntegration: Tier3ReadinessReport["missingByIntegration"] = [];

  for (const req of spec.requirements) {
    const missing: string[] = [];
    for (const key of req.requiredRealEnvKeys) {
      const value = projectEnvVars[key];
      if (typeof value !== "string" || value.trim() === "") {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      missingByIntegration.push({
        key: req.key,
        name: req.name,
        missing,
      });
    }
  }

  return {
    ready: missingByIntegration.length === 0,
    missingByIntegration,
  };
}

/**
 * Render the Tier-3 build plan as a Markdown block for injection into the
 * F3 system prompt's dynamic context. Returns null when there are no
 * requirements (i.e. nothing to wire).
 */
export function renderTier3BuildPlanBlock(spec: Tier3BuildSpec): string | null {
  if (spec.requirements.length === 0) return null;
  const lines: string[] = [
    "## Tier-3 Integration Build Plan",
    "",
    "You are now in F3 (\"bygg integrationer\"). Wire each integration below end-to-end.",
    "Use the listed env keys; assume real values are present at runtime.",
    "",
  ];
  for (const req of spec.requirements) {
    lines.push(`### ${req.name} (\`${req.key}\`)`);
    if (req.requiredRealEnvKeys.length > 0) {
      lines.push(`Required env: \`${req.requiredRealEnvKeys.join("`, `")}\``);
    }
    if (req.placeholderOkEnvKeys.length > 0) {
      lines.push(`Public/placeholder-OK env: \`${req.placeholderOkEnvKeys.join("`, `")}\``);
    }
    lines.push("Steps:");
    for (const step of req.buildInstructions) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
