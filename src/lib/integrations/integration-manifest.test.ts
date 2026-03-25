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

  it("detects Meilisearch from generated code", () => {
    const files = [
      {
        name: "lib/search.ts",
        content: 'import { instantMeiliSearch } from "@meilisearch/instant-meilisearch";\n',
      },
    ];
    const detected = detectIntegrationsFromVersionFiles(files);
    const row = detected.find((d) => d.key === "meilisearch");
    expect(row?.name).toBe("Meilisearch");
    expect(row?.envVars).toContain("NEXT_PUBLIC_MEILISEARCH_HOST");
  });

  it("detects Typesense from generated code", () => {
    const files = [
      {
        name: "lib/search.ts",
        content: 'import Typesense from "typesense";\n',
      },
    ];
    const detected = detectIntegrationsFromVersionFiles(files);
    const row = detected.find((d) => d.key === "typesense");
    expect(row?.name).toBe("Typesense");
    expect(row?.envVars).toContain("NEXT_PUBLIC_TYPESENSE_HOST");
  });

  it("detects Elasticsearch from generated code", () => {
    const files = [
      {
        name: "lib/search.ts",
        content: 'import { Client } from "@elastic/elasticsearch";\n',
      },
    ];
    const detected = detectIntegrationsFromVersionFiles(files);
    const row = detected.find((d) => d.key === "elasticsearch");
    expect(row?.name).toBe("Elasticsearch");
    expect(row?.envVars).toContain("NEXT_PUBLIC_ELASTICSEARCH_NODE_URL");
    expect(row?.envVars).toContain("NEXT_PUBLIC_ELASTICSEARCH_SEARCH_API_KEY");
  });

  it("detects Algolia from generated code", () => {
    const files = [
      {
        name: "components/Search.tsx",
        content: 'import { liteClient as algoliasearch } from "algoliasearch/lite";\n',
      },
    ];
    const detected = detectIntegrationsFromVersionFiles(files);
    const row = detected.find((d) => d.key === "algolia");
    expect(row?.name).toBe("Algolia");
    expect(row?.envVars).toContain("NEXT_PUBLIC_ALGOLIA_APPLICATION_ID");
    expect(row?.envVars).toContain("NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY");
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
