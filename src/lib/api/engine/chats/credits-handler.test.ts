import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attachVersionToPendingUsageAsync = vi.hoisted(() => vi.fn());
const getLlmUsageContext = vi.hoisted(() => vi.fn(() => ({ claimKey: "claim_1" })));
const establishGenerationBilling = vi.hoisted(() => vi.fn());
const settleGenerationBilling = vi.hoisted(() => vi.fn());

vi.mock("@/lib/observability/llm-usage", () => ({
  attachVersionToPendingUsageAsync,
  getLlmUsageContext,
}));
vi.mock("@/lib/db/services/generation-billing", () => ({
  establishGenerationBilling,
  settleGenerationBilling,
}));
vi.mock("@/lib/db/services/transactions", () => ({
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    readonly code = "INSUFFICIENT_CREDITS";
    constructor(
      readonly required: number,
      readonly available: number,
    ) {
      super(`Insufficient credits: need ${required}, have ${available}`);
      this.name = "InsufficientCreditsError";
    }
  },
}));

const { createCommitCreditsOnce } = await import("./credits-handler");

function creditCheck(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    cost: 10,
    action: "prompt.create" as const,
    context: {},
    user: { id: "user_1" },
    isTest: false,
    sessionId: "session_1",
    guestUsageType: null,
    commit: vi.fn(async () => undefined),
    refund: vi.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  attachVersionToPendingUsageAsync.mockResolvedValue(undefined);
  establishGenerationBilling.mockResolvedValue(undefined);
  settleGenerationBilling.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  establishGenerationBilling.mockReset();
  settleGenerationBilling.mockReset();
  vi.restoreAllMocks();
});

describe("createCommitCreditsOnce", () => {
  it("uses usage settlement instead of the fixed debit for a finalized version", async () => {
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);

    await commit({ chatId: "chat_1", versionId: "version_1" });
    await commit({ chatId: "chat_1", versionId: "version_1" });

    expect(attachVersionToPendingUsageAsync).toHaveBeenCalledTimes(1);
    expect(attachVersionToPendingUsageAsync).toHaveBeenCalledWith("chat_1", "version_1", "claim_1");
    expect(settleGenerationBilling).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "version_1",
      userId: "user_1",
      isTest: false,
    });
    expect(establishGenerationBilling).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "version_1",
      userId: "user_1",
      isTest: false,
      claimKey: "claim_1",
    });
    expect(check.commit).not.toHaveBeenCalled();
  });

  it("settles an account-bound free generation through the same version ledger", async () => {
    const check = creditCheck({ usingFreeGeneration: true });
    const commit = createCommitCreditsOnce(check as never);
    await commit({ chatId: "chat_1", versionId: "version_1" });

    expect(check.commit).not.toHaveBeenCalled();
    expect(settleGenerationBilling).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", isTest: false }),
    );
  });

  it("uses the existing fixed charge for non-version actions", async () => {
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);
    await commit();
    expect(check.commit).toHaveBeenCalledTimes(1);
    expect(establishGenerationBilling).not.toHaveBeenCalled();
    expect(settleGenerationBilling).not.toHaveBeenCalled();
  });

  it("guards a targetless fixed commit against a raced negative balance", async () => {
    const { InsufficientCreditsError } = await import("@/lib/db/services/transactions");
    const error = new InsufficientCreditsError(4, 0);
    const check = creditCheck({ commit: vi.fn().mockRejectedValue(error) });
    const commit = createCommitCreditsOnce(check as never, {
      rejectIfNegativeFixedCommit: true,
    });

    await expect(commit()).rejects.toBe(error);
    expect(check.commit).toHaveBeenCalledOnce();
    expect(check.commit).toHaveBeenCalledWith({ rejectIfNegative: true });
    expect(establishGenerationBilling).not.toHaveBeenCalled();
  });

  it("keeps the historical targetless charge-after path tolerant", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("fixed debit unavailable");
    const check = creditCheck({ commit: vi.fn().mockRejectedValue(error) });
    const commit = createCommitCreditsOnce(check as never);

    await expect(commit()).resolves.toBeUndefined();
    expect(check.commit).toHaveBeenCalledWith();
    expect(errorSpy).toHaveBeenCalledWith("[credits] Failed to charge:", error);
  });

  it("establishes the retry marker before attachment and leaves attachment failure pending", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    attachVersionToPendingUsageAsync.mockRejectedValue(new Error("usage attachment unavailable"));
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);

    await commit({ chatId: "chat_1", versionId: "version_1" });

    expect(establishGenerationBilling).toHaveBeenCalledOnce();
    expect(attachVersionToPendingUsageAsync).toHaveBeenCalledOnce();
    expect(settleGenerationBilling).not.toHaveBeenCalled();
    expect(establishGenerationBilling.mock.invocationCallOrder[0]).toBeLessThan(
      attachVersionToPendingUsageAsync.mock.invocationCallOrder[0]!,
    );
    expect(check.commit).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[generation-billing] Kunde inte efterstämpla usage:",
      expect.any(Error),
    );
  });

  it("retries a transient marker failure before attachment and settlement", async () => {
    establishGenerationBilling.mockRejectedValueOnce(new Error("marker unavailable"));
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);

    await commit({ chatId: "chat_1", versionId: "version_1" });

    expect(establishGenerationBilling).toHaveBeenCalledTimes(2);
    expect(attachVersionToPendingUsageAsync).toHaveBeenCalledOnce();
    expect(settleGenerationBilling).toHaveBeenCalledOnce();
    expect(check.commit).not.toHaveBeenCalled();
  });

  it("stops before attachment and settlement when the marker persistently fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    establishGenerationBilling.mockRejectedValue(new Error("marker unavailable"));
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);

    await expect(commit({ chatId: "chat_1", versionId: "version_1" })).rejects.toThrow(
      "marker unavailable",
    );

    expect(establishGenerationBilling).toHaveBeenCalledTimes(3);
    expect(attachVersionToPendingUsageAsync).not.toHaveBeenCalled();
    expect(settleGenerationBilling).not.toHaveBeenCalled();
    expect(check.commit).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[generation-billing] Kunde inte spara completion-markören:",
      expect.any(Error),
    );
  });

  it("retries a transient settlement error without a standalone debit", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    settleGenerationBilling.mockRejectedValueOnce(new Error("db unavailable"));
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);
    await commit({ chatId: "chat_1", versionId: "version_1" });
    expect(check.commit).not.toHaveBeenCalled();
    expect(settleGenerationBilling).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("propagates insufficient credits immediately instead of retrying or overdrafting", async () => {
    const { InsufficientCreditsError } = await import("@/lib/db/services/transactions");
    const error = new InsufficientCreditsError(2, 0);
    settleGenerationBilling.mockRejectedValue(error);
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);

    await expect(commit({ chatId: "chat_1", versionId: "version_1" })).rejects.toBe(error);
    expect(settleGenerationBilling).toHaveBeenCalledOnce();
    expect(check.commit).not.toHaveBeenCalled();
  });

  it("keeps a persistent failure out of the standalone credit ledger", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    settleGenerationBilling.mockRejectedValue(new Error("db unavailable"));
    const check = creditCheck();
    const commit = createCommitCreditsOnce(check as never);
    await commit({ chatId: "chat_1", versionId: "version_1" });
    expect(settleGenerationBilling).toHaveBeenCalledTimes(3);
    expect(check.commit).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[generation-billing] Kunde inte debitera completion-markören:",
      expect.any(Error),
    );
  });
});
