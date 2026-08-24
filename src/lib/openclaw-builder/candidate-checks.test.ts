import { describe, expect, it } from "vitest";

import {
  MAX_ERROR_COUNT,
  createCheckReceipt,
  type CheckReceipt,
  type CheckResult,
} from "./candidate-checks";

const OVERLAY_HASH = "a".repeat(64);

const RECEIPT_KEYS = ["tool", "officialGate", "overlayHash", "checks"] as const;

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    kind: "syntax",
    passed: true,
    errorCount: 0,
    truncated: false,
    ...overrides,
  };
}

function validInput(
  overrides: Partial<Parameters<typeof createCheckReceipt>[0]> = {},
): Parameters<typeof createCheckReceipt>[0] {
  return {
    overlayHash: OVERLAY_HASH,
    checks: [check()],
    ...overrides,
  };
}

describe("createCheckReceipt", () => {
  it("builds a diagnostic receipt from caller-supplied checks", () => {
    const checks: CheckResult[] = [
      check({ kind: "syntax", passed: true, errorCount: 0, truncated: false }),
      check({ kind: "typecheck", passed: false, errorCount: 3, truncated: true }),
      check({ kind: "policy", passed: true, errorCount: 0, truncated: false }),
    ];
    const result = createCheckReceipt(validInput({ checks }));

    expect(result).toEqual({
      ok: true,
      receipt: {
        tool: "candidate.run_checks",
        officialGate: false,
        overlayHash: OVERLAY_HASH,
        checks,
      } satisfies CheckReceipt,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(Object.keys(result.receipt).sort()).toEqual([...RECEIPT_KEYS].sort());
  });

  it("always records officialGate as false", () => {
    const result = createCheckReceipt(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt.officialGate).toBe(false);

    const stuffed = createCheckReceipt({
      ...validInput(),
      ...({ officialGate: true } as { officialGate: true }),
    });
    expect(stuffed.ok).toBe(true);
    if (!stuffed.ok) throw new Error("expected ok");
    expect(stuffed.receipt.officialGate).toBe(false);
  });

  it("rejects duplicate check kinds", () => {
    expect(
      createCheckReceipt(
        validInput({
          checks: [check({ kind: "syntax" }), check({ kind: "syntax", passed: false, errorCount: 1 })],
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_input" });
  });

  it("rejects overlayHash values that are not 64 lowercase hex", () => {
    expect(createCheckReceipt(validInput({ overlayHash: "A".repeat(64) }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createCheckReceipt(validInput({ overlayHash: "not-a-hash" }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createCheckReceipt(validInput({ overlayHash: OVERLAY_HASH.slice(0, 63) }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(createCheckReceipt(validInput({ overlayHash: `${OVERLAY_HASH}ff` }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects empty checks", () => {
    expect(createCheckReceipt(validInput({ checks: [] }))).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });

  it("rejects unknown kinds, extra results, and out-of-range error counts", () => {
    expect(
      createCheckReceipt(
        validInput({
          checks: [{ ...check(), kind: "lint" as CheckResult["kind"] }],
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_input" });

    expect(
      createCheckReceipt(
        validInput({
          checks: [
            check({ kind: "syntax" }),
            check({ kind: "typecheck" }),
            check({ kind: "policy" }),
            check({ kind: "syntax" }),
          ],
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_input" });

    expect(
      createCheckReceipt(validInput({ checks: [check({ errorCount: -1 })] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      createCheckReceipt(validInput({ checks: [check({ errorCount: MAX_ERROR_COUNT + 1 })] })),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      createCheckReceipt(validInput({ checks: [check({ errorCount: 1.5 })] })),
    ).toEqual({ ok: false, code: "invalid_input" });

    const atCap = createCheckReceipt(validInput({ checks: [check({ errorCount: MAX_ERROR_COUNT })] }));
    expect(atCap.ok).toBe(true);
  });
});
