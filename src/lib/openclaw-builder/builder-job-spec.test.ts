import { readFileSync } from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
  BUILDER_LANE_GRANTS,
  BUILDER_JOB_ALLOWED_TOOLS,
  BUILDER_JOB_TOOL_SCOPES,
  BUILDER_TOOL_REQUIRED_SCOPE,
  parseBuilderJobClientIntent,
  parseBuilderJobSpec,
} from "./builder-job-spec";
import { resolveOpenClawBuilderLane } from "./lane-policy";

const HASH = "a".repeat(64);
const validSpec = {
  schemaVersion: 1,
  jobId: "job:1",
  lane: "classic",
  tenantId: "tenant:1",
  projectId: "project:1",
  chatId: "chat:1",
  baseVersionId: "version:1",
  baseFilesRevision: "b".repeat(40),
  generationInputPackageHash: HASH,
  lineageHash: HASH,
  sourceReceiptHash: HASH,
  toolScopes: ["job:read"],
  allowedTools: ["job.get"],
  budgets: {
    maxModelTurns: 0,
    maxToolCalls: 0,
    maxWallTimeMs: 0,
    maxPreviewLoops: 0,
    maxChangedFiles: 0,
    maxCandidateBytes: 0,
    maxReadBytes: 0,
  },
  lease: {
    issuedAt: "2026-08-24T10:00:00.000Z",
    expiresAt: "2026-08-24T10:01:00.000Z",
    absoluteExpiresAt: "2026-08-24T10:05:00.000Z",
    heartbeatIntervalMs: 15_000,
  },
  idempotencyKey: "idem:1",
  attempt: 1,
  maxAttempts: 3,
  createdAt: "2026-08-24T10:00:00.000Z",
} as const;

describe("BuilderJobSpec", () => {
  function compileStrictSchema() {
    const schemaPath = path.join(
      process.cwd(),
      "docs/schemas/strict/openclaw-builder-job-spec.schema.json",
    );
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    return { schema, validate: ajv.compile(schema) };
  }

  it("accepts the server-owned envelope in both Zod and the strict JSON Schema", () => {
    expect(parseBuilderJobSpec(validSpec)).toEqual(validSpec);

    const { schema, validate } = compileStrictSchema();
    expect(validate(validSpec), JSON.stringify(validate.errors)).toBe(true);
    expect(schema.properties.toolScopes.items.enum).toEqual([...BUILDER_JOB_TOOL_SCOPES]);
    expect(schema.properties.allowedTools.items.enum).toEqual([...BUILDER_JOB_ALLOWED_TOOLS]);
    const shadowSchema = schema.allOf.find(
      (entry: { if?: { properties?: { lane?: { const?: string } } } }) =>
        entry.if?.properties?.lane?.const === "openclaw_shadow",
    );
    expect(shadowSchema.then.properties.toolScopes.items.enum).toEqual([
      ...BUILDER_LANE_GRANTS.openclaw_shadow.toolScopes,
    ]);
    expect(shadowSchema.then.properties.allowedTools.items.enum).toEqual([
      ...BUILDER_LANE_GRANTS.openclaw_shadow.allowedTools,
    ]);
  });

  it("keeps mutating tools off read scopes and the shadow lane read-only", () => {
    const mutatingToolName =
      /(?:^|[._])(apply|cancel|heartbeat|patch|replace|submit|write)(?:[._]|$)/;
    const mutatingTools = BUILDER_JOB_ALLOWED_TOOLS.filter((tool) =>
      mutatingToolName.test(tool),
    );

    expect(mutatingTools).not.toHaveLength(0);
    for (const tool of mutatingTools) {
      expect(BUILDER_TOOL_REQUIRED_SCOPE[tool]).not.toMatch(/:read$/);
    }

    const shadowScopes = new Set<string>(BUILDER_LANE_GRANTS.openclaw_shadow.toolScopes);
    expect([...shadowScopes].every((scope) => scope.endsWith(":read"))).toBe(true);
    for (const tool of BUILDER_LANE_GRANTS.openclaw_shadow.allowedTools) {
      const requiredScope = BUILDER_TOOL_REQUIRED_SCOPE[tool];
      expect(requiredScope).toMatch(/:read$/);
      expect(shadowScopes.has(requiredScope)).toBe(true);
    }
  });

  it("requires both base identity fields and rejects duplicate grants", () => {
    const { baseVersionId: _version, ...withoutVersion } = validSpec;
    const { baseFilesRevision: _revision, ...withoutRevision } = validSpec;
    expect(() => parseBuilderJobSpec(withoutVersion)).toThrow();
    expect(() => parseBuilderJobSpec(withoutRevision)).toThrow();
    expect(() =>
      parseBuilderJobSpec({
        ...validSpec,
        toolScopes: ["job:read", "job:read"],
      }),
    ).toThrow(/duplicates/);

    const { validate } = compileStrictSchema();
    expect(validate(withoutVersion)).toBe(false);
    expect(validate(withoutRevision)).toBe(false);
    expect(validate({ ...validSpec, allowedTools: ["job.get", "job.get"] })).toBe(false);
  });

  it("rejects client-forged identity, base, scopes, tools and budgets", () => {
    for (const forged of [
      { tenantId: "other" },
      { baseVersionId: "version:other" },
      { toolScopes: ["candidate:write"] },
      { allowedTools: ["candidate.apply_patch"] },
      { budgets: { maxToolCalls: 500 } },
    ]) {
      expect(() => parseBuilderJobClientIntent(forged)).toThrow();
    }
    expect(parseBuilderJobClientIntent({})).toEqual({});
  });

  it("cross-validates lane grants and exact server-owned budgets", () => {
    expect(() =>
      parseBuilderJobSpec({ ...validSpec, toolScopes: ["candidate:write"] }),
    ).toThrow(/lane policy/);
    expect(() =>
      parseBuilderJobSpec({ ...validSpec, allowedTools: ["candidate.apply_patch"] }),
    ).toThrow(/lane policy/);
    expect(() =>
      parseBuilderJobSpec({
        ...validSpec,
        budgets: { ...validSpec.budgets, maxToolCalls: 1 },
      }),
    ).toThrow(/server-owned classic lane policy/);

    const { validate } = compileStrictSchema();
    expect(validate({ ...validSpec, toolScopes: ["candidate:write"] })).toBe(false);
    expect(validate({ ...validSpec, allowedTools: ["candidate.apply_patch"] })).toBe(false);
    expect(
      validate({
        ...validSpec,
        budgets: { ...validSpec.budgets, maxToolCalls: 1 },
      }),
    ).toBe(false);

    const shadowWithoutProjectScope = {
      ...validSpec,
      lane: "openclaw_shadow",
      toolScopes: ["job:read"],
      allowedTools: ["job.get", "project.read_file"],
      budgets: {
        maxModelTurns: 3,
        maxToolCalls: 25,
        maxWallTimeMs: 120_000,
        maxPreviewLoops: 0,
        maxChangedFiles: 0,
        maxCandidateBytes: 0,
        maxReadBytes: 2_000_000,
      },
    } as const;
    expect(() => parseBuilderJobSpec(shadowWithoutProjectScope)).toThrow(/requires scope/);
    expect(validate(shadowWithoutProjectScope)).toBe(false);
  });
});

describe("P0 lane policy", () => {
  it("keeps classic as default and fails closed when unavailable lanes are requested", () => {
    expect(resolveOpenClawBuilderLane({})).toMatchObject({
      lane: "classic",
      requestedLane: "classic",
      enabled: true,
      reason: "default_classic",
    });
    expect(
      resolveOpenClawBuilderLane({ SAJTMASKIN_OPENCLAW_BUILDER_SHADOW: "true" }),
    ).toMatchObject({
      lane: "classic",
      requestedLane: "openclaw_shadow",
      enabled: false,
      reason: "lane_unavailable",
    });
    expect(
      resolveOpenClawBuilderLane({ SAJTMASKIN_OPENCLAW_BUILDER_CANDIDATE: "1" }),
    ).toMatchObject({
      lane: "classic",
      requestedLane: "openclaw_candidate",
      enabled: false,
      reason: "lane_unavailable",
    });
  });
});
