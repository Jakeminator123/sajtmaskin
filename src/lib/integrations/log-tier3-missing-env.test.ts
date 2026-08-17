import { beforeEach, describe, expect, it, vi } from "vitest";

const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn(async () => null));
const after = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

vi.mock("next/server", () => ({ after }));

import {
  F3_READINESS_MISSING_ENV_CATEGORY,
  formatTier3MissingEnvMessage,
  logTier3MissingEnvBlocked,
  logTier3MissingEnvBlockedDetached,
} from "./log-tier3-missing-env";

describe("formatTier3MissingEnvMessage", () => {
  it("lists a few missing keys", () => {
    expect(
      formatTier3MissingEnvMessage([
        { key: "resend", name: "Resend", missing: ["RESEND_API_KEY", "EMAIL_FROM"] },
      ]),
    ).toBe("Integrationsbygget spärrat: saknar RESEND_API_KEY, EMAIL_FROM");
  });

  it("truncates long lists", () => {
    const message = formatTier3MissingEnvMessage([
      {
        key: "db",
        name: "DB",
        missing: ["A", "B", "C", "D", "E"],
      },
    ]);
    expect(message).toContain("(+1 till)");
  });
});

describe("logTier3MissingEnvBlocked", () => {
  beforeEach(() => {
    createEngineVersionErrorLogs.mockReset();
    createEngineVersionErrorLogs.mockResolvedValue(null);
  });

  it("persists chatId, versionId and missingByIntegration under the R7 category", async () => {
    const missingByIntegration = [
      { key: "resend", name: "Resend", missing: ["RESEND_API_KEY"] },
    ];
    await logTier3MissingEnvBlocked({
      chatId: "chat_1",
      versionId: "ver_1",
      projectId: "proj_1",
      missingByIntegration,
      source: "finalize-design",
    });

    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1);
    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          chatId: "chat_1",
          versionId: "ver_1",
          level: "info",
          category: F3_READINESS_MISSING_ENV_CATEGORY,
          meta: expect.objectContaining({
            error: "tier3_env_not_ready",
            source: "finalize-design",
            projectId: "proj_1",
            missingByIntegration,
          }),
        }),
      ],
      undefined,
    );
  });

  it("no-ops without chat/version ids", async () => {
    await logTier3MissingEnvBlocked({
      chatId: "  ",
      versionId: "ver_1",
      missingByIntegration: [],
      source: "stream",
    });
    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
  });

  it("forwards lockTimeoutMs for the quality-gate path", async () => {
    await logTier3MissingEnvBlocked({
      chatId: "chat_1",
      versionId: "ver_parent",
      f3VersionId: "ver_f3",
      missingByIntegration: [],
      source: "quality-gate",
      lockTimeoutMs: 3000,
    });
    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          versionId: "ver_parent",
          meta: expect.objectContaining({ f3VersionId: "ver_f3" }),
        }),
      ],
      { lockTimeoutMs: 3000 },
    );
  });

  it("swallows persist failures", async () => {
    createEngineVersionErrorLogs.mockRejectedValueOnce(new Error("db down"));
    await expect(
      logTier3MissingEnvBlocked({
        chatId: "chat_1",
        versionId: "ver_1",
        missingByIntegration: [],
        source: "stream",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("logTier3MissingEnvBlockedDetached", () => {
  beforeEach(() => {
    createEngineVersionErrorLogs.mockReset();
    createEngineVersionErrorLogs.mockResolvedValue(null);
    after.mockReset();
  });

  /**
   * The 412 callsites return immediately after scheduling. Without `after()`
   * a serverless invocation can freeze before the INSERT runs, and the old
   * tests could not see that: they mocked this module and only asserted that
   * it had been called.
   */
  it("hands the pending write to after() so the invocation stays alive", async () => {
    logTier3MissingEnvBlockedDetached({
      chatId: "chat_1",
      versionId: "ver_1",
      missingByIntegration: [{ key: "resend", name: "Resend", missing: ["RESEND_API_KEY"] }],
      source: "finalize-design",
    });

    expect(after).toHaveBeenCalledTimes(1);
    const registered = after.mock.calls[0]?.[0] as Promise<void> | undefined;
    expect(registered).toBeInstanceOf(Promise);
    await expect(registered).resolves.toBeUndefined();
    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1);
  });

  it("still writes when after() is unavailable (no request scope)", async () => {
    after.mockImplementation(() => {
      throw new Error("after() outside request scope");
    });

    expect(() =>
      logTier3MissingEnvBlockedDetached({
        chatId: "chat_1",
        versionId: "ver_1",
        missingByIntegration: [],
        source: "stream",
      }),
    ).not.toThrow();

    await vi.waitFor(() => expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1));
  });

  it("never rejects the registered promise when the write fails", async () => {
    createEngineVersionErrorLogs.mockRejectedValueOnce(new Error("db down"));

    logTier3MissingEnvBlockedDetached({
      chatId: "chat_1",
      versionId: "ver_1",
      missingByIntegration: [],
      source: "quality-gate",
    });

    const registered = after.mock.calls[0]?.[0] as Promise<void> | undefined;
    await expect(registered).resolves.toBeUndefined();
  });
});
