import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createPlanReceipt, type PlanReceipt } from "./plan-receipt";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const CREATED_AT = "2026-08-24T17:02:00.000Z";

const RECEIPT_KEYS = [
  "schemaVersion",
  "generationInputPackageHash",
  "lineageHash",
  "planHash",
  "modelLane",
  "jobId",
  "createdAt",
] as const;

function validPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    tool: "shadow.plan",
    generationInputPackageHash: HASH_A,
    lineageHash: HASH_B,
    goal: "Describe a bounded follow-up without changing owners.",
    expectedFiles: ["src/app/page.tsx"],
    contracts: ["finalize"],
    risks: ["Scope creep."],
    checkPlan: ["Typecheck the touched files."],
    notes: ["Shadow only."],
    ...overrides,
  };
}

function validInput(
  overrides: Partial<Parameters<typeof createPlanReceipt>[0]> = {},
): Parameters<typeof createPlanReceipt>[0] {
  return {
    generationInputPackageHash: HASH_A,
    lineageHash: HASH_B,
    plan: validPlan(),
    jobId: "job-1",
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : sortKeys(item)));
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) continue;
      sorted[key] = sortKeys(child);
    }
    return sorted;
  }
  return value;
}

function expectedPlanHash(plan: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortKeys(plan)), "utf8").digest("hex");
}

describe("createPlanReceipt", () => {
  it("builds a shadow receipt with hashes and bound identity only", () => {
    const plan = validPlan();
    const result = createPlanReceipt(validInput({ plan }));

    expect(result).toEqual({
      ok: true,
      receipt: {
        schemaVersion: 1,
        generationInputPackageHash: HASH_A,
        lineageHash: HASH_B,
        planHash: expectedPlanHash(plan),
        modelLane: "shadow",
        jobId: "job-1",
        createdAt: CREATED_AT,
      } satisfies PlanReceipt,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receipt).not.toHaveProperty("plan");
    expect(result.receipt).not.toHaveProperty("goal");
    expect(result.receipt).not.toHaveProperty("userPrompt");
    expect(result.receipt).not.toHaveProperty("engineSystemPrompt");
    expect(Object.keys(result.receipt).sort()).toEqual([...RECEIPT_KEYS].sort());
  });

  it("hashes the same plan regardless of object key order", () => {
    const left = {
      goal: "Keep the hero compact.",
      expectedFiles: ["src/app/page.tsx"],
      nested: { z: 2, a: 1 },
    };
    const right = {
      nested: { a: 1, z: 2 },
      expectedFiles: ["src/app/page.tsx"],
      goal: "Keep the hero compact.",
    };

    const leftResult = createPlanReceipt(validInput({ plan: left }));
    const rightResult = createPlanReceipt(validInput({ plan: right }));

    expect(leftResult.ok).toBe(true);
    expect(rightResult.ok).toBe(true);
    if (!leftResult.ok || !rightResult.ok) throw new Error("expected ok");
    expect(leftResult.receipt.planHash).toBe(rightResult.receipt.planHash);
    expect(leftResult.receipt.planHash).toBe(expectedPlanHash(right));
  });

  it("rejects a secret-like plan", () => {
    expect(
      createPlanReceipt(validInput({ plan: validPlan({ notes: ["Authorization: Bearer abc"] }) })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      createPlanReceipt(validInput({ plan: validPlan({ goal: "Call with sk-test-key" }) })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      createPlanReceipt(
        validInput({ plan: validPlan({ notes: ["-----BEGIN PRIVATE KEY-----"] }) }),
      ),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      createPlanReceipt(
        validInput({ plan: validPlan({ notes: ["See https://example.com/docs"] }) }),
      ),
    ).toEqual({ ok: false, code: "invalid_input" });
  });

  it("rejects hashes that are not 64 lowercase hex", () => {
    expect(
      createPlanReceipt(validInput({ generationInputPackageHash: "A".repeat(64) })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(createPlanReceipt(validInput({ lineageHash: "not-a-hash" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ lineageHash: HASH_B.slice(0, 63) }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ generationInputPackageHash: `${HASH_A}ff` }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects a createdAt that is not an ISO datetime with offset", () => {
    expect(createPlanReceipt(validInput({ createdAt: "not-a-timestamp" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ createdAt: "2026-08-24T17:02:00" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ createdAt: "2026-08-24" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ createdAt: "2026-08-24 17:02:00Z" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("keeps receipt.modelLane as shadow", () => {
    const result = createPlanReceipt(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt.modelLane).toBe("shadow");

    const stuffed = createPlanReceipt({
      ...validInput(),
      ...({ modelLane: "classic" } as { modelLane: "classic" }),
    });
    expect(stuffed.ok).toBe(true);
    if (!stuffed.ok) throw new Error("expected ok");
    expect(stuffed.receipt.modelLane).toBe("shadow");
  });

  it("accepts a numeric offset and keeps the supplied createdAt", () => {
    const createdAt = "2026-08-24T19:02:00+02:00";
    const result = createPlanReceipt(validInput({ createdAt }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt.createdAt).toBe(createdAt);
  });

  it("rejects an empty, overlong, or non-opaque jobId", () => {
    expect(createPlanReceipt(validInput({ jobId: "" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ jobId: "job/1" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ jobId: "job 1" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createPlanReceipt(validInput({ jobId: "x".repeat(257) }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    const maxId = createPlanReceipt(validInput({ jobId: "job:1_ok.2-3" }));
    expect(maxId.ok).toBe(true);
  });
});
