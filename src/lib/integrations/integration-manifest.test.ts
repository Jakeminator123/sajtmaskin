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

  it("detects Sentry from version files via registry pipeline", () => {
    const files = [{ name: "instrumentation.ts", content: 'import * as Sentry from "@sentry/nextjs";\n' }];
    const detected = detectIntegrationsFromVersionFiles(files);
    const sentry = detected.find((d) => d.key === "sentry");
    expect(sentry?.name).toBe("Sentry");
    expect(sentry?.envVars).toContain("SENTRY_DSN");
  });

  it("detects Sanity and MongoDB from generated code", () => {
    const files = [
      {
        name: "lib/sanity.ts",
        content: 'import { createClient } from "next-sanity";\nexport const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;\n',
      },
      { name: "lib/db.ts", content: "import mongoose from \"mongoose\";\nawait mongoose.connect(process.env.MONGODB_URI!);\n" },
    ];
    const detected = detectIntegrationsFromVersionFiles(files);
    expect(detected.some((d) => d.key === "sanity")).toBe(true);
    expect(detected.find((d) => d.key === "sanity")?.envVars).toContain("SANITY_API_TOKEN");
    expect(detected.some((d) => d.key === "mongodb")).toBe(true);
    expect(detected.find((d) => d.key === "mongodb")?.envVars).toContain("MONGODB_URI");
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
