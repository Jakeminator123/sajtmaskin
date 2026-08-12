import { describe, expect, it } from "vitest";
import { resolveDossierLifecycle, type DossierLifecycleRequirementEvidence } from "./lifecycle";
import type { DossierEntry } from "./types";

function dossier(overrides: Partial<DossierEntry> = {}): DossierEntry {
  return {
    class: "hard",
    id: "example-build-integration",
    label: "Example build integration",
    capability: "example-build",
    providers: ["example"],
    codeFidelity: "verbatim",
    complexity: "medium",
    defaultForCapability: true,
    summary: "Synthetic build-enforced integration for lifecycle policy tests.",
    envVars: [
      {
        key: "EXAMPLE_SECRET_KEY",
        required: true,
        enforcement: "build",
        purpose: "Synthetic server authentication.",
      },
    ],
    dependencies: [],
    files: [{ path: "components/api/example/route.ts", role: "server" }],
    lastVerified: "2026-08-01",
    ...overrides,
  };
}

function requirement(
  overrides: Partial<DossierLifecycleRequirementEvidence> = {},
): DossierLifecycleRequirementEvidence {
  return {
    key: "example",
    envKeys: ["EXAMPLE_SECRET_KEY"],
    missingBuildKeys: [],
    ...overrides,
  };
}

function resolve(overrides: Partial<Parameters<typeof resolveDossierLifecycle>[0]> = {}) {
  return resolveDossierLifecycle({
    entry: dossier(),
    configuredBySelection: false,
    materialized: false,
    pending: false,
    realEnvKeys: new Set<string>(),
    requirements: [],
    versionFiles: [],
    ...overrides,
  });
}

describe("resolveDossierLifecycle", () => {
  it("keeps an exact pending dossier planned before the self-contained rule", () => {
    const result = resolve({
      entry: dossier({
        class: "hard",
        providers: ["analytics"],
        envVars: [],
        files: [{ path: "components/analytics.tsx", role: "client" }],
      }),
      configuredBySelection: true,
      pending: true,
    });

    expect(result).toMatchObject({
      overviewStatus: "planned",
      pending: true,
      requiresF3: false,
      configured: true,
    });
  });

  it("marks a materialized keyless hard dossier self-contained once it is no longer pending", () => {
    const result = resolve({
      entry: dossier({
        class: "hard",
        providers: ["analytics"],
        envVars: [],
        files: [{ path: "components/analytics.tsx", role: "client" }],
      }),
      configuredBySelection: true,
      materialized: true,
    });

    expect(result.overviewStatus).toBe("self-contained");
    expect(result.serverEvidenceSatisfied).toBe(true);
  });

  it("keeps an undetected hard dossier planned even when a build key is missing", () => {
    const result = resolve();

    expect(result.overviewStatus).toBe("planned");
    expect(result.detected).toBe(false);
    expect(result.missingBuildKeys).toEqual([]);
    expect(result.buildKeysWithoutRealValue).toEqual(["EXAMPLE_SECRET_KEY"]);
  });

  it("uses the readiness verdict only after a requirement is detected", () => {
    const result = resolve({
      requirements: [requirement({ missingBuildKeys: ["EXAMPLE_SECRET_KEY"] })],
    });

    expect(result).toMatchObject({
      overviewStatus: "blocked-build",
      detected: true,
      matchedRequirementKey: "example",
      missingBuildKeys: ["EXAMPLE_SECRET_KEY"],
    });
  });

  it("keeps placeholder-satisfied build keys in demo until a real value exists", () => {
    const result = resolve({
      requirements: [requirement()],
      versionFiles: [{ path: "app/api/example/route.ts", content: "export {}" }],
    });

    expect(result.overviewStatus).toBe("built-demo");
    expect(result.missingBuildKeys).toEqual([]);
    expect(result.buildKeysWithoutRealValue).toEqual(["EXAMPLE_SECRET_KEY"]);
  });

  it("marks detected code live only with real keys and server evidence", () => {
    const result = resolve({
      configuredBySelection: true,
      materialized: true,
      realEnvKeys: new Set(["EXAMPLE_SECRET_KEY"]),
      requirements: [requirement()],
      versionFiles: [{ path: "app/api/example/route.ts", content: "export {}" }],
    });

    expect(result).toMatchObject({
      overviewStatus: "built-live",
      materialized: true,
      configured: true,
      serverEvidenceSatisfied: true,
    });
  });

  it("preserves unknown file evidence instead of treating it as a known empty version", () => {
    const result = resolve({
      configuredBySelection: true,
      materialized: null,
      realEnvKeys: new Set(["EXAMPLE_SECRET_KEY"]),
      requirements: null,
      versionFiles: null,
    });

    expect(result.overviewStatus).toBe("planned");
    expect(result.materialized).toBeNull();
    expect(result.detected).toBeNull();
    expect(result.serverEvidenceSatisfied).toBeNull();
  });

  it("distinguishes a known empty version from unavailable evidence", () => {
    const result = resolve({
      materialized: false,
      requirements: [],
      versionFiles: [],
    });

    expect(result.overviewStatus).toBe("planned");
    expect(result.materialized).toBe(false);
    expect(result.detected).toBe(false);
    expect(result.serverEvidenceSatisfied).toBe(false);
  });

  it("accepts model-built API evidence without claiming exact materialization", () => {
    const result = resolve({
      configuredBySelection: true,
      materialized: false,
      realEnvKeys: new Set(["EXAMPLE_SECRET_KEY"]),
      requirements: [requirement()],
      versionFiles: [
        {
          path: "app/api/payments/route.ts",
          content: "const key = process.env.EXAMPLE_SECRET_KEY; export { key };",
        },
      ],
    });

    expect(result).toMatchObject({
      overviewStatus: "built-live",
      materialized: false,
      detected: true,
      serverEvidenceSatisfied: true,
    });
  });

  it("does not let partial manifest injection fall through to model-built evidence", () => {
    const result = resolve({
      entry: dossier({
        files: [
          { path: "components/api/example/route.ts", role: "server" },
          { path: "components/api/webhook/route.ts", role: "server" },
        ],
      }),
      configuredBySelection: true,
      realEnvKeys: new Set(["EXAMPLE_SECRET_KEY"]),
      requirements: [requirement()],
      versionFiles: [
        {
          path: "app/api/example/route.ts",
          content: "const key = process.env.EXAMPLE_SECRET_KEY; export { key };",
        },
      ],
    });

    expect(result.overviewStatus).toBe("built-demo");
    expect(result.serverEvidenceSatisfied).toBe(false);
  });

  it("matches the requirement with the largest env-key overlap", () => {
    const result = resolve({
      entry: dossier({
        envVars: [
          {
            key: "OPENAI_API_KEY",
            required: true,
            enforcement: "feature-runtime",
            purpose: "OpenAI auth.",
          },
          {
            key: "DATABASE_URL",
            required: true,
            enforcement: "build",
            purpose: "RAG storage.",
          },
        ],
      }),
      requirements: [
        requirement({ key: "openai", envKeys: ["OPENAI_API_KEY"] }),
        requirement({
          key: "rag-chat",
          envKeys: ["OPENAI_API_KEY", "DATABASE_URL"],
          missingBuildKeys: ["DATABASE_URL"],
        }),
      ],
    });

    expect(result.matchedRequirementKey).toBe("rag-chat");
    expect(result.overviewStatus).toBe("blocked-build");
  });
});
