import type { DetectedIntegration } from "@/lib/gen/detect-integrations";

/**
 * Structured, UI-renderable warning for an env key that is NOT blocking
 * deploy but does degrade one integration. Product decision: publishing a
 * demo site with an info sign is allowed — see `buildDeployReadiness` for the
 * (separate) hard-block path on `missingEnvKeys`.
 *
 * `reason`:
 *  - "placeholder": the key is unconfigured but covered by a preview
 *    placeholder, so the integration runs against fake/tier-3-stub data.
 *  - "feature-runtime": the key is unconfigured and the dossier's component
 *    self-mounts a "configuration required" banner at runtime.
 */
export type EnvDegradationWarning = {
  key: string;
  /** Vendor-neutral integration display name (e.g. "Stripe", "E-post (kontakt-/bokningsformulär)"). */
  integration: string;
  reason: "placeholder" | "feature-runtime";
  message: string;
};

function buildIntegrationNameByKey(
  detectedIntegrations: DetectedIntegration[],
): Map<string, string> {
  const nameByKey = new Map<string, string>();
  for (const integration of detectedIntegrations) {
    for (const key of integration.envVars) {
      if (!nameByKey.has(key)) nameByKey.set(key, integration.name);
    }
  }
  return nameByKey;
}

/**
 * Build the structured, Swedish, vendor-neutral env-degradation warning list
 * for the deploy response. Never includes `missingEnvKeys` (those hard-block
 * separately) — only the two non-blocking buckets that previously surfaced
 * as flat strings.
 */
export function buildEnvDegradationWarnings(params: {
  placeholderCoveredKeys: string[];
  featureRuntimeKeys: string[];
  detectedIntegrations: DetectedIntegration[];
}): EnvDegradationWarning[] {
  const nameByKey = buildIntegrationNameByKey(params.detectedIntegrations);
  const unknownIntegrationLabel = "okänd integration";

  const placeholderWarnings: EnvDegradationWarning[] = params.placeholderCoveredKeys.map(
    (key) => {
      const integration = nameByKey.get(key) ?? unknownIntegrationLabel;
      return {
        key,
        integration,
        reason: "placeholder",
        message: `${key} saknar ett riktigt värde och publiceras med en preview-platshållare — ${integration} fungerar inte med skarpa data förrän du fyller i ett riktigt värde under Miljövariabler.`,
      };
    },
  );

  const featureRuntimeWarnings: EnvDegradationWarning[] = params.featureRuntimeKeys.map((key) => {
    const integration = nameByKey.get(key) ?? unknownIntegrationLabel;
    return {
      key,
      integration,
      reason: "feature-runtime",
      message: `${key} är inte konfigurerad — ${integration} visar en infoskylt för besökaren tills du fyller i ett värde under Miljövariabler.`,
    };
  });

  return [...placeholderWarnings, ...featureRuntimeWarnings];
}
