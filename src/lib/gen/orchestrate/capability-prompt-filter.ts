/**
 * Prompt-driven dossier capability filtering (F2 integration-mute, carousel/3D
 * gates, dependency dedup) — moved verbatim from `src/lib/gen/orchestrate.ts`
 * (structural split, no behavior change).
 */
import { explicitlyRequests3D } from "../capability-inference";
import {
  expandDependentCapabilities,
  getF3RequiredCapabilities,
  normalizeCapabilityId,
} from "../dossiers";
import type { BuildSpec } from "../build-spec";

function explicitlyRequestsCarousel(prompt: string): boolean {
  return /\b(carousel|slider|slideshow|swipe|embla|karusell|bildkarusell|bildspel|hero[-\s]?slider|produktkarusell)\b/i.test(prompt);
}

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

export interface DossierCapabilityPromptFilterResult {
  /** Capabilities that survive the filter and reach dossier selection. */
  capabilities: string[];
  /**
   * Capabilities dropped by the F2 integration-mute specifically (NOT the
   * carousel/3D prompt gates or the money-flow dedup — those are "the user
   * never asked for this", while a mute is "the user asked, we defer it").
   *
   * Spår 01 steg 2-3: the F2 contract renders a counter-instruction from this
   * list (build the surface, never the route), and the builder surfaces the
   * same list to the user as "Planerad — kopplas in i nästa steg" instead of
   * letting the mute be silent.
   */
  mutedCapabilities: string[];
}

export function filterDossierCapabilitiesForPrompt(params: {
  capabilities: string[];
  prompt: string;
  previewPolicy: BuildSpec["previewPolicy"];
}): string[] {
  return filterDossierCapabilitiesForPromptWithMutes(params).capabilities;
}

export function filterDossierCapabilitiesForPromptWithMutes(params: {
  capabilities: string[];
  prompt: string;
  previewPolicy: BuildSpec["previewPolicy"];
}): DossierCapabilityPromptFilterResult {
  const f2MutedIntegrationCapabilities = getF2MutedIntegrationCapabilities();
  const mutedCapabilities: string[] = [];
  // Alias-normalize BEFORE the mute check (test-sync finding 2026-07-22): a
  // legacy snapshot can still carry `supabase-auth`, which must hit the F2
  // mute as `auth` — checking the raw id would let the legacy alias bypass
  // the mute and survive into an F2 round. Dedupe keeps order.
  const seenNormalized = new Set<string>();
  const normalizedCapabilities: string[] = [];
  for (const raw of params.capabilities) {
    const capability = normalizeCapabilityId(raw);
    if (seenNormalized.has(capability)) continue;
    seenNormalized.add(capability);
    normalizedCapabilities.push(capability);
  }
  const filtered = normalizedCapabilities.filter((capability) => {
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
      mutedCapabilities.push(capability);
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
  // Dependent-capability expansion (same helper as selectDossiersForRequest —
  // prompt and selection stay in lockstep). `DEPENDENT_CAPABILITIES` is empty
  // since 2026-08-06 (the only entry, `subscriptions` ⇒ auth-pin, left with
  // the parked paddle-billing dossier), but the helper still alias-normalizes
  // legacy ids (`supabase-auth` → `auth`, `command-search` →
  // `command-palette`) so stale snapshots keep resolving. The former
  // ai-tool-calling ⇒ drop ai-chat dedup died with etapp 4. The money-flow
  // dedup subscriptions/payments left with paddle parking — `subscriptions`
  // is no longer a capability, so a recurring ask flows as ordinary
  // content/`payments`.
  result = expandDependentCapabilities(result);
  return { capabilities: result, mutedCapabilities };
}
