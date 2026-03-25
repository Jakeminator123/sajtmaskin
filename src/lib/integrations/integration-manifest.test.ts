import { describe, expect, it } from "vitest";
import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";
import {
  SAJTMASKIN_INTEGRATION_MANIFEST_FILENAME,
  tryParseIntegrationManifest,
} from "@/lib/integrations/integration-manifest";

describe("integration manifest", () => {
  it("parses v1 manifest", () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      integrations: [{ key: "stripe", required: true, envVars: ["STRIPE_SECRET_KEY"] }],
    });
    const parsed = tryParseIntegrationManifest(raw);
    expect(parsed?.integrations[0]?.key).toBe("stripe");
  });

  it("prefers manifest over code when manifest is valid", () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      integrations: [{ key: "openai", required: true }],
    });
    const files = [
      { name: SAJTMASKIN_INTEGRATION_MANIFEST_FILENAME, content: manifest },
      {
        name: "app/page.tsx",
        content: "// no integration hints here",
      },
    ];
    const detected = detectIntegrationsFromVersionFiles(files);
    expect(detected.some((d) => d.key === "openai")).toBe(true);
    expect(detected.some((d) => d.key === "stripe")).toBe(false);
  });
});
