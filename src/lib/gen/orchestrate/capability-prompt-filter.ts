/**
 * Prompt-driven dossier capability filtering (F2 integration-mute, carousel/3D
 * gates, dependency dedup) — moved verbatim from `src/lib/gen/orchestrate.ts`
 * (structural split, no behavior change).
 */
import { explicitlyRequests3D } from "../capability-inference";
import {
  expandDependentCapabilities,
  getF3RequiredCapabilities,
} from "../dossiers";
import type { BuildSpec } from "../build-spec";

function explicitlyRequestsCarousel(prompt: string): boolean {
  return /\b(carousel|slider|slideshow|swipe|embla|karusell|bildkarusell|bildspel|hero[-\s]?slider|produktkarusell)\b/i.test(prompt);
}

/**
 * Explicit one-off / card-checkout intent (stripe-checkout `payments`). Used to
 * KEEP `payments` when a prompt asks for both memberships and a one-off purchase
 * (Codex P2 dossier-batch) — the subscriptions/payments dedup only drops
 * `payments` when it was inferred, never when the shopper explicitly asked to
 * buy something once. Unicode-safe lookarounds (not \b) so åäö-adjacent words
 * are handled correctly.
 */
const EXPLICIT_ONE_OFF_PAYMENT_RE =
  /(?<![\p{L}\p{N}_])(?:eng(?:å|a)ngs(?:betalning(?:ar|en)?|k(?:ö|o)p(?:et)?|belopp)?|one-?time|one-?off|single\s+payment|betala\s+en\s+g(?:å|a)ng|k(?:ö|o)p\s+(?:en\s+)?(?:produkt|vara|artikel)|one-?off\s+checkout)(?![\p{L}\p{N}_])/iu;

/**
 * Non-secret integration capabilities that F2 mutes by POLICY
 * (`.cursor/rules/env-flow-f2-mute.mdc`) even though their dossier has no
 * build-enforced env secret AND no server-file surface — today only
 * analytics (`<Analytics/>` needs no build key and ships no server file).
 * Everything else is derived from each dossier's own contract via
 * `getF3RequiredCapabilities()` (see `dossierRequiresF3`: build-enforced
 * env var OR a `files[].role === "server"` file — the latter now covers
 * contact-form/resend, newsletter-subscribe/mailchimp and
 * error-tracking/sentry). Keep this residual minimal; prefer expressing
 * "needs F3" through the dossier manifest.
 */
const F2_MUTE_POLICY_ONLY_CAPABILITIES = new Set(["analytics"]);

/**
 * Integration capabilities muted from the F2 dossier prompt injection.
 * Canonical F3 signal = `dossierRequiresF3` (build-enforced envVars OR
 * server-file surface), enumerated as capabilities by
 * `getF3RequiredCapabilities()`, unioned with the small non-secret policy
 * residual above. Replaces the former hardcoded `F3_ONLY_DOSSIER_CAPABILITIES`
 * list so the boundary tracks the dossier contract instead of a duplicated
 * constant.
 */
export function getF2MutedIntegrationCapabilities(): Set<string> {
  const caps = new Set<string>(getF3RequiredCapabilities());
  for (const cap of F2_MUTE_POLICY_ONLY_CAPABILITIES) caps.add(cap);
  return caps;
}

export function filterDossierCapabilitiesForPrompt(params: {
  capabilities: string[];
  prompt: string;
  previewPolicy: BuildSpec["previewPolicy"];
}): string[] {
  const f2MutedIntegrationCapabilities = getF2MutedIntegrationCapabilities();
  const filtered = params.capabilities.filter((capability) => {
    // F2 integration-mute. Note: `contact-form` (resend) and
    // `newsletter-subscribe` (mailchimp) are covered by the derived set via
    // the server-file rule in `dossierRequiresF3` — the former per-prompt
    // escape hatch (`explicitlyRequestsContactDelivery`) is removed: it used
    // to inject the resend dossier into F2 whenever the prompt mentioned
    // sending email, contradicting the F2 SDK deny-list (`resend` is a
    // forbidden F2 import) so the guard stripped the import out of the
    // verbatim route and shipped a broken `/api/contact`. Email delivery is
    // now strictly F3; F2 renders the form as a visual mockup (see the F2
    // contract's Forms guidance in `session-contracts.ts`).
    if (
      params.previewPolicy !== "fidelity3" &&
      f2MutedIntegrationCapabilities.has(capability)
    ) {
      return false;
    }
    if (capability === "carousel" && !explicitlyRequestsCarousel(params.prompt)) {
      return false;
    }
    // `visual-3d` can arrive from the Deep-Brief LLM on "cinematic"/"immersive"/
    // "dramatic" prompts that never asked for 3D, which produced WebGL heroes
    // that crashed with THREE.WebGLRenderer context-loss + CSP unsafe-eval.
    // Drop it unless the prompt literally asks for 3D/WebGL/Canvas, mirroring
    // the carousel gate above.
    if (capability === "visual-3d" && !explicitlyRequests3D(params.prompt)) {
      return false;
    }
    return true;
  });

  // `physics-3d` depends on the same Three.js shell/deps that `visual-3d`
  // provides. If visual-3d was gated out (the prompt never asked for 3D) but the
  // Deep-Brief still emitted physics-3d, drop physics-3d too — otherwise we ship
  // a physics dossier with no 3D renderer (dependency collision / dead WebGL). #198
  let result = filtered;
  if (result.includes("physics-3d") && !result.includes("visual-3d")) {
    result = result.filter((capability) => capability !== "physics-3d");
  }
  // Dependent capabilities (Codex P1 #475): `subscriptions` requires
  // `supabase-auth` (paddle's customer-portal needs a signed-in Supabase
  // user). Expanded AFTER the F2 mute (subscriptions never survives F2, so
  // this only fires in F3) and BEFORE the supabase-auth/auth dedup below so a
  // tag-along generic `auth` is correctly dropped in favor of the required
  // Supabase stack. Same helper as selectDossiersForRequest — prompt and
  // selection stay in lockstep.
  result = expandDependentCapabilities(result);
  // Dossier wave 3: `supabase-auth` only enters the set via an EXPLICIT
  // Supabase ask (brief is explicit-ask-only; follow-up vocabulary triggers on
  // Supabase-specific phrases), while generic `auth` can tag along from the
  // inferred-capability bridge (`needsAuth` matches the "login"/"auth" inside
  // the same "supabase login" prompt). Both dossiers ship a root middleware.ts
  // — injecting both would collide, and clerk-auth must never ride along on an
  // explicit Supabase choice. Explicit provider wins: drop generic `auth`.
  if (result.includes("supabase-auth") && result.includes("auth")) {
    result = result.filter((capability) => capability !== "auth");
  }
  // Money-flow dedup (bugbot high, dossier-batch): a recurring/subscriptions ask
  // can drag generic `payments` along (brief, inferred `needsPayments`, or a
  // prompt mentioning both "prenumeration" and "betala med kort"). stripe-checkout
  // (payments) and paddle-billing (subscriptions) ship DISTINCT output paths (no
  // build collision, Codex P2), so we drop `payments` only when it was inferred/
  // ambiguous — an EXPLICIT one-off checkout ask alongside memberships keeps both.
  if (
    result.includes("subscriptions") &&
    result.includes("payments") &&
    !EXPLICIT_ONE_OFF_PAYMENT_RE.test(params.prompt ?? "")
  ) {
    result = result.filter((capability) => capability !== "payments");
  }
  return result;
}
