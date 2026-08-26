import { describe, expect, it } from "vitest";

import {
  MAX_GOAL_LENGTH,
  MAX_PLAN_ARRAY_LENGTH,
  parseShadowPlan,
  type ShadowPlan,
} from "./plan-schema";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function validPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    tool: "shadow.plan",
    generationInputPackageHash: HASH_A,
    lineageHash: HASH_B,
    goal: "Describe a bounded follow-up without changing owners.",
    expectedFiles: ["src/app/page.tsx", "src/lib/gen/stream/finalize-version.ts"],
    contracts: ["GenerationInputPackage", "RenderGate", "finalize"],
    risks: ["Scope creep into a new scaffold."],
    checkPlan: ["Typecheck the touched files."],
    notes: ["Shadow only; no version write."],
    ...overrides,
  };
}

describe("parseShadowPlan", () => {
  it("accepts a valid shadow plan", () => {
    const input = validPlan();
    const result = parseShadowPlan(input);

    expect(result).toEqual({
      ok: true,
      plan: {
        schemaVersion: 1,
        tool: "shadow.plan",
        generationInputPackageHash: HASH_A,
        lineageHash: HASH_B,
        goal: "Describe a bounded follow-up without changing owners.",
        expectedFiles: ["src/app/page.tsx", "src/lib/gen/stream/finalize-version.ts"],
        contracts: ["GenerationInputPackage", "RenderGate", "finalize"],
        risks: ["Scope creep into a new scaffold."],
        checkPlan: ["Typecheck the touched files."],
        notes: ["Shadow only; no version write."],
      } satisfies ShadowPlan,
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.plan.expectedFiles).not.toBe(input.expectedFiles);
    expect(result.plan.contracts).not.toBe(input.contracts);
  });

  it("rejects a bad hash", () => {
    expect(
      parseShadowPlan(validPlan({ generationInputPackageHash: "A".repeat(64) })),
    ).toEqual({ ok: false, code: "invalid_plan" });
    expect(parseShadowPlan(validPlan({ lineageHash: "not-a-hash" }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ lineageHash: HASH_B.slice(0, 63) }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
  });

  it("rejects an unknown contract", () => {
    expect(parseShadowPlan(validPlan({ contracts: ["invented_register"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ contracts: ["RenderGate", "NewOwner"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
  });

  it("rejects restricted expectedFiles", () => {
    expect(parseShadowPlan(validPlan({ expectedFiles: [".env"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ expectedFiles: ["keys/id_ed25519"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ expectedFiles: [".git/config"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ expectedFiles: ["vendor/.git/config"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ expectedFiles: [".GIT/config"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
  });

  it("rejects secrets or control characters in risks, checkPlan, and notes", () => {
    expect(
      parseShadowPlan(validPlan({ risks: ["Use sk-live-secret"] })),
    ).toEqual({ ok: false, code: "invalid_plan" });
    expect(
      parseShadowPlan(validPlan({ notes: ["stripe sk_live_example"] })),
    ).toEqual({ ok: false, code: "invalid_plan" });
    expect(
      parseShadowPlan(validPlan({ checkPlan: ["Bearer abc.def"] })),
    ).toEqual({ ok: false, code: "invalid_plan" });
    expect(
      parseShadowPlan(validPlan({ notes: ["bad\0note"] })),
    ).toEqual({ ok: false, code: "invalid_plan" });
  });

  it("rejects path traversal in expectedFiles", () => {
    expect(parseShadowPlan(validPlan({ expectedFiles: ["../secret"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ expectedFiles: ["/etc/passwd"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ expectedFiles: ["foo/../../etc/passwd"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
  });

  it("rejects extra keys, including scaffold/variant/dossier picks", () => {
    expect(parseShadowPlan(validPlan({ extra: true }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ scaffoldId: "landing" }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ variantId: "clean" }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ dossierIds: ["seo"] }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
  });

  it("rejects a secret pattern in goal", () => {
    expect(parseShadowPlan(validPlan({ goal: "Use the Bearer token from env." }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ goal: "Call with sk-test-key" }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(
      parseShadowPlan(validPlan({ goal: "Paste -----BEGIN PRIVATE KEY-----" })),
    ).toEqual({ ok: false, code: "invalid_plan" });
  });

  it("rejects oversize arrays", () => {
    const tooMany = Array.from({ length: MAX_PLAN_ARRAY_LENGTH + 1 }, (_, i) => `src/f${i}.ts`);
    expect(parseShadowPlan(validPlan({ expectedFiles: tooMany }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(
      parseShadowPlan(
        validPlan({
          contracts: Array.from({ length: MAX_PLAN_ARRAY_LENGTH + 1 }, () => "finalize"),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_plan" });
    expect(
      parseShadowPlan(
        validPlan({
          risks: Array.from({ length: MAX_PLAN_ARRAY_LENGTH + 1 }, () => "risk"),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_plan" });
    expect(
      parseShadowPlan(
        validPlan({
          checkPlan: Array.from({ length: MAX_PLAN_ARRAY_LENGTH + 1 }, () => "check"),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_plan" });
    expect(
      parseShadowPlan(
        validPlan({
          notes: Array.from({ length: MAX_PLAN_ARRAY_LENGTH + 1 }, () => "note"),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_plan" });
  });

  it("rejects an empty or oversized goal", () => {
    expect(parseShadowPlan(validPlan({ goal: "" }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
    expect(parseShadowPlan(validPlan({ goal: "x".repeat(MAX_GOAL_LENGTH + 1) }))).toEqual({
      ok: false,
      code: "invalid_plan",
    });
  });
});
