import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";
import {
  buildManifestJsonFromDetected,
  isIntegrationManifestPath,
  SAJTMASKIN_INTEGRATION_MANIFEST_FILENAME,
} from "@/lib/integrations/integration-manifest";
import type { PreviewLifecycleStage } from "@/lib/gen/preview/env-local";

/**
 * Recompute manifest from current files (excluding any existing manifest) and merge into `filesJson`.
 *
 * F2 (`design`) policy: integrations should not exist at all in design
 * stage — the user is iterating on visuals and shouldn't have to know
 * which API keys their imports demand. We strip any existing manifest
 * file and skip recomputation entirely. F3 (`integrations`) builds the
 * full manifest as before so readiness/deploy can validate tier-3 keys.
 *
 * Detection goes through `detectIntegrationsFromVersionFiles` so F2 auto-
 * stubs in env artifacts (e.g. `STRIPE_SECRET_KEY=sk_test_placeholder_…`)
 * are filtered before provider regexes run — same path as version-file
 * detection. See `.cursor/rules/env-flow-f2-mute.mdc`.
 */
export function injectIntegrationManifestIntoFilesJson(
  filesJson: string,
  options: { lifecycleStage?: PreviewLifecycleStage } = {},
): string {
  let files: Array<{ path: string; content: string; language?: string }>;
  try {
    files = JSON.parse(filesJson) as Array<{
      path: string;
      content: string;
      language?: string;
    }>;
  } catch {
    return filesJson;
  }

  if (!Array.isArray(files)) return filesJson;

  const withoutManifest = files.filter((f) => !isIntegrationManifestPath(f.path));

  if (options.lifecycleStage === "design") {
    // F2: drop the manifest entirely. It's a Sajtmaskin-internal artifact
    // that confuses users and serves no purpose in design stage.
    return JSON.stringify(withoutManifest);
  }

  const detected = detectIntegrationsFromVersionFiles(
    withoutManifest.map((f) => ({ name: f.path, content: f.content })),
    { lifecycleStage: options.lifecycleStage },
  );
  const manifestContent = buildManifestJsonFromDetected(detected);

  const next = [
    ...withoutManifest,
    {
      path: SAJTMASKIN_INTEGRATION_MANIFEST_FILENAME,
      content: manifestContent,
      language: "json",
    },
  ];

  return JSON.stringify(next);
}
