import { z } from "zod";
import {
  integrationRegistryByKey,
  type IntegrationRuntime,
} from "@/lib/integrations/registry";
import type { DetectedIntegration } from "@/lib/gen/detect-integrations";

/** Written into each generated version; read first by integration detection. */
export const SAJTMASKIN_INTEGRATION_MANIFEST_FILENAME = "sajtmaskin.integration-manifest.json";

const manifestIntegrationSchema = z.object({
  key: z.string().min(1),
  required: z.boolean().optional(),
  envVars: z.array(z.string()).optional(),
  runtime: z.enum(["browser", "server", "edge", "deploy"]).optional(),
});

const manifestFileSchema = z.object({
  schemaVersion: z.literal(1),
  integrations: z.array(manifestIntegrationSchema),
});

export type IntegrationManifestFile = z.infer<typeof manifestFileSchema>;
export type ManifestIntegrationEntry = z.infer<typeof manifestIntegrationSchema>;

export function isIntegrationManifestPath(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  return base === SAJTMASKIN_INTEGRATION_MANIFEST_FILENAME;
}

export function tryParseIntegrationManifest(
  raw: string,
): IntegrationManifestFile | null {
  try {
    const data = JSON.parse(raw) as unknown;
    const parsed = manifestFileSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function defaultRuntimeForKey(key: string): IntegrationRuntime {
  return integrationRegistryByKey.get(key)?.runtime ?? "server";
}

/**
 * Turn manifest rows into UI/detection rows, enriching from `integrationRegistry` when possible.
 */
export function detectedIntegrationsFromManifest(
  manifest: IntegrationManifestFile,
): DetectedIntegration[] {
  const out: DetectedIntegration[] = [];
  const seen = new Set<string>();

  for (const row of manifest.integrations) {
    const def = integrationRegistryByKey.get(row.key);
    const providerId = def?.provider ?? def?.key ?? row.key;
    if (seen.has(providerId)) continue;
    seen.add(providerId);

    const envVars =
      row.envVars && row.envVars.length > 0
        ? row.envVars
        : (def?.envVars ?? []);

    out.push({
      key: def?.key ?? row.key,
      name: def?.name ?? row.key,
      provider: providerId,
      intent: "env_vars",
      envVars,
      status: "Kräver konfiguration",
      setupGuide: def?.setupGuide,
    });
  }

  return out;
}

export function buildManifestJsonFromDetected(
  detected: DetectedIntegration[],
): string {
  const integrations: ManifestIntegrationEntry[] = [];

  for (const d of detected) {
    if (d.key === "custom-env") continue;
    const def = integrationRegistryByKey.get(d.key);
    integrations.push({
      key: d.key,
      required: def ? !def.optional : true,
      envVars: d.envVars.length > 0 ? d.envVars : undefined,
      runtime: def?.runtime ?? defaultRuntimeForKey(d.key),
    });
  }

  const payload: IntegrationManifestFile = {
    schemaVersion: 1,
    integrations,
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

