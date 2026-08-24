import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUILDER_BENCHMARK_SCENARIOS,
  observeBuilderBenchmark,
  type BuilderBenchmarkFixture,
} from "./benchmark/harness";
import { hashCanonicalJson } from "./canonical-json";
import { hashBuilderAuditTenant, redactBuilderAuditMetadata } from "./audit";
import { createGenerationInputPackageReceipt } from "./package-receipt";
import { createClassicBuilderExecutionTrace } from "./telemetry";
import type { GenerationInputPackage } from "@/lib/gen/generation-input-package";

function packageFixture(extra: Record<string, unknown> = {}): GenerationInputPackage {
  return {
    userPrompt: "Bygg en säker sajt",
    rawPrompt: "Bygg en säker sajt",
    engineSystemPrompt: "private system prompt",
    dynamicContext: "private dynamic context",
    buildSpec: { buildIntent: "app", previewPolicy: "fidelity2" },
    resolvedScaffold: {
      id: "saas",
      files: [{ path: "app/page.tsx", content: "export default function Page() {}" }],
    },
    variantId: "grid",
    variantTemplateId: null,
    variantTemplateReferenceAttachments: [],
    sources: [
      {
        kind: "dossier",
        id: "clerk-auth",
        origin: "dossier",
        reason: "auth",
        authority: "krav",
        reachedPrompt: true,
      },
    ],
    importedRepoMode: false,
    importedRepoContractHashes: null,
    lineageHash: "a".repeat(64),
    ...extra,
  } as unknown as GenerationInputPackage;
}

describe("GenerationInputPackage receipt", () => {
  it("is deterministic, order-stable and sensitive to relevant package changes", () => {
    expect(hashCanonicalJson({ b: 2, a: { y: 2, x: 1 } })).toBe(
      hashCanonicalJson({ a: { x: 1, y: 2 }, b: 2 }),
    );
    const first = createGenerationInputPackageReceipt(packageFixture());
    const replay = createGenerationInputPackageReceipt(packageFixture());
    const changed = createGenerationInputPackageReceipt(
      packageFixture({ userPrompt: "Bygg en annan säker sajt" }),
    );
    const changedSystemPrompt = createGenerationInputPackageReceipt(
      packageFixture({ engineSystemPrompt: "different private system prompt" }),
    );
    const changedScaffold = createGenerationInputPackageReceipt(
      packageFixture({
        resolvedScaffold: {
          id: "saas",
          files: [{ path: "app/page.tsx", content: "export default function Changed() {}" }],
        },
      }),
    );
    expect(replay).toEqual(first);
    expect(changed.generationInputPackageHash).not.toBe(first.generationInputPackageHash);
    expect(changedSystemPrompt.generationInputPackageHash).not.toBe(
      first.generationInputPackageHash,
    );
    expect(changedScaffold.generationInputPackageHash).not.toBe(
      first.generationInputPackageHash,
    );
    expect(JSON.stringify(first)).not.toContain("private system prompt");
    expect(JSON.stringify(first)).not.toContain("Bygg en säker sajt");
  });

  it("keeps the classic package immutable and emits only the existing scrubbed trace", () => {
    const pkg = packageFixture({
      userPrompt: "prompt-with-TEST_SECRET_SENTINEL_DO_NOT_LOG",
      engineSystemPrompt: "system-with-TEST_AUTH_SENTINEL_DO_NOT_LOG",
      resolvedScaffold: {
        id: "saas",
        files: [{ path: "app/private-page.tsx", content: "const secret = 'do-not-log'" }],
      },
    });
    const before = structuredClone(pkg);
    const trace = createClassicBuilderExecutionTrace(
      createGenerationInputPackageReceipt(pkg),
    );

    expect(pkg).toEqual(before);
    expect(trace).toMatchObject({ lane: "classic", executionEngine: "own-engine" });
    expect(Object.keys(trace).sort()).toEqual(
      [
        "checkpoints",
        "executionEngine",
        "generationInputPackageHash",
        "lane",
        "lineageHash",
        "qualityGateCorrelation",
        "schemaVersion",
        "sourceReceiptHash",
      ].sort(),
    );
    const persisted = JSON.stringify(trace);
    expect(persisted).not.toContain("do-not-log");
    expect(persisted).not.toContain("private-page.tsx");
  });

  it("keeps receipt telemetry additive for legacy classic route fixtures", () => {
    const legacyFixture = packageFixture({
      rawPrompt: undefined,
      sources: undefined,
      variantTemplateReferenceAttachments: undefined,
    });

    expect(() => createGenerationInputPackageReceipt(legacyFixture)).not.toThrow();
    expect(createGenerationInputPackageReceipt(legacyFixture)).toMatchObject({
      lineageHash: "a".repeat(64),
      sourceCount: 0,
      promptChars: "Bygg en säker sajt".length,
    });
  });
});

describe("audit redaction", () => {
  it("keeps allowlisted scalar evidence but removes secrets, code and arbitrary payloads", () => {
    const redacted = redactBuilderAuditMetadata({
      attempt: 2,
      reason: "import { secret } from './project';\nconst token = 'sk-live-secret';",
      tool: "project.read_file",
      authorization: "Bearer abc.def",
      fullProjectFiles: [{ path: "app/page.tsx", content: "export default function X(){}" }],
      requestHash: "a".repeat(64),
      checkpoint: ["package_frozen", "Bearer token-value"],
      resultClass: "user@example.com",
      policyDecision: "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    });
    expect(redacted).toEqual({
      attempt: 2,
      reason: "[REDACTED]",
      tool: "project.read_file",
      requestHash: "a".repeat(64),
      checkpoint: ["package_frozen", "[REDACTED]"],
      resultClass: "[REDACTED]",
      policyDecision: "[REDACTED]",
    });
    expect(JSON.stringify(redacted)).not.toContain("page.tsx");
    expect(JSON.stringify(redacted)).not.toContain("sk-live-secret");
    expect(hashBuilderAuditTenant("tenant:1", "local-test-salt")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("P0 fixture benchmark", () => {
  it("covers init, follow-up, F2, F3 and import with deterministic package observations", () => {
    const observations = BUILDER_BENCHMARK_SCENARIOS.map((scenario) => {
      const fixturePath = path.join(
        process.cwd(),
        "src/lib/openclaw-builder/benchmark/fixtures",
        `${scenario}.json`,
      );
      const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as BuilderBenchmarkFixture;
      const first = observeBuilderBenchmark(fixture);
      expect(observeBuilderBenchmark(fixture)).toEqual(first);
      return first;
    });
    expect(observations.map((item) => item.scenario)).toEqual([
      "init",
      "follow-up",
      "f2",
      "f3",
      "import",
    ]);
    expect(observations.every((item) => item.selectedLane === "classic")).toBe(true);
    expect(new Set(observations.map((item) => item.frozenPackageHash)).size).toBe(5);
  });
});
