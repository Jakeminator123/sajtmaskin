import { describe, expect, it } from "vitest";
import {
  FIX_LESSON_DETERMINISTIC_IMPORT_REPAIR,
  FIX_LESSON_REPAIR_LOOP_DETERMINISTIC,
  FIX_LESSON_VERIFIER_FIXER_REWRITE,
  isCrossTenantSafeFixText,
  repairLoopLlmFixLesson,
} from "./error-log-fix-lessons";

describe("isCrossTenantSafeFixText (A#1 allowlist)", () => {
  it("accepts the platform-authored constant lessons", () => {
    expect(isCrossTenantSafeFixText(FIX_LESSON_DETERMINISTIC_IMPORT_REPAIR)).toBe(true);
    expect(isCrossTenantSafeFixText(FIX_LESSON_VERIFIER_FIXER_REWRITE)).toBe(true);
    expect(isCrossTenantSafeFixText(FIX_LESSON_REPAIR_LOOP_DETERMINISTIC)).toBe(true);
  });

  it("accepts the repair-loop LLM lesson for any pass count", () => {
    expect(isCrossTenantSafeFixText(repairLoopLlmFixLesson(1))).toBe(true);
    expect(isCrossTenantSafeFixText(repairLoopLlmFixLesson(12))).toBe(true);
  });

  it("rejects free-form / tenant-specific fix text (default-deny)", () => {
    expect(isCrossTenantSafeFixText("Set STRIPE_SECRET_KEY for acme-corp")).toBe(false);
    expect(isCrossTenantSafeFixText("Added import React from react")).toBe(false);
  });

  it("rejects null / empty / whitespace", () => {
    expect(isCrossTenantSafeFixText(null)).toBe(false);
    expect(isCrossTenantSafeFixText(undefined)).toBe(false);
    expect(isCrossTenantSafeFixText("")).toBe(false);
    expect(isCrossTenantSafeFixText("   ")).toBe(false);
  });

  it("rejects near-miss injections that append to a safe prefix (anchored match)", () => {
    expect(
      isCrossTenantSafeFixText(`${FIX_LESSON_DETERMINISTIC_IMPORT_REPAIR}; leaked SECRET=abc`),
    ).toBe(false);
    expect(
      isCrossTenantSafeFixText(
        "repair-loop LLM fixer resolved the quality-gate failure after 3 pass(es) for acme-corp",
      ),
    ).toBe(false);
  });

  it("tolerates surrounding whitespace on an otherwise exact lesson", () => {
    expect(isCrossTenantSafeFixText(`  ${FIX_LESSON_VERIFIER_FIXER_REWRITE}  `)).toBe(true);
  });
});
