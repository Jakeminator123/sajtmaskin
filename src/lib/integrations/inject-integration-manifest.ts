import { detectIntegrations } from "@/lib/gen/detect-integrations";
import {
  buildManifestJsonFromDetected,
  isIntegrationManifestPath,
  SAJTMASKIN_INTEGRATION_MANIFEST_FILENAME,
} from "@/lib/integrations/integration-manifest";

/**
 * Recompute manifest from current files (excluding any existing manifest) and merge into `filesJson`.
 */
export function injectIntegrationManifestIntoFilesJson(filesJson: string): string {
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
  const combined = withoutManifest
    .map((f) => `// File: ${f.path}\n${f.content}`)
    .join("\n\n");
  const detected = combined.trim() ? detectIntegrations(combined) : [];
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
