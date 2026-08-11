/**
 * F2 integration-mute: which capabilities F2 defers to F3.
 *
 * Canonical owner of the mute set. Lives next to the registry (not in
 * `orchestrate/`) so tooling that only needs the F2 disposition —
 * `scripts/dossiers/regenerate-capability-map.ts` and
 * `scripts/docs/contract-docs-core.mjs` — can import it without pulling the
 * prompt-filter's transitive graph (build-spec, autofix, capability-inference:
 * ~98 modules) into a plain `tsx` script.
 */
import { getF3RequiredCapabilities } from "./registry";

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
 *
 * The mute (`f2Disposition`) and the build/server contract
 * (`dossierRequiresF3`) are separate axes: analytics is muted in F2 while
 * requiring neither a build env var nor a server file.
 */
export function getF2MutedIntegrationCapabilities(): Set<string> {
  const caps = new Set<string>(getF3RequiredCapabilities());
  for (const cap of F2_MUTE_POLICY_ONLY_CAPABILITIES) caps.add(cap);
  return caps;
}
