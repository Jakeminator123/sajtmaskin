import { beforeEach, describe, expect, it, vi } from "vitest";

const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());
const appendErrorLogEvent = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs,
}));

vi.mock("@/lib/logging/error-log-rag", () => ({
  appendErrorLogEvent,
}));

vi.mock("@/lib/logging/event-bus", () => ({
  emit,
}));

const { logDeployError } = await import("./deploy-error-log");

describe("logDeployError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEngineVersionErrorLogs.mockResolvedValue([]);
  });

  it("persists a deploy-category error-log row, a RAG event, and a bus event", async () => {
    await logDeployError({
      chatId: "chat_1",
      versionId: "ver_1",
      deploymentId: "dep_1",
      vercelDeploymentId: "dpl_1",
      inspectorUrl: "https://vercel.com/inspect/dpl_1",
      message: "next build failed: Type error",
      source: "webhook",
    });

    // 1) DB row — category "deploy".
    expect(createEngineVersionErrorLogs).toHaveBeenCalledTimes(1);
    const [payloads] = createEngineVersionErrorLogs.mock.calls[0];
    expect(payloads[0]).toMatchObject({
      chatId: "chat_1",
      versionId: "ver_1",
      level: "error",
      category: "deploy",
    });
    expect(payloads[0].meta).toMatchObject({
      fault: "vercel-build-error",
      source: "webhook",
      deploymentId: "dep_1",
      vercelDeploymentId: "dpl_1",
      inspectorUrl: "https://vercel.com/inspect/dpl_1",
    });

    // 2) RAG producer — fault "vercel-build-error".
    expect(appendErrorLogEvent).toHaveBeenCalledTimes(1);
    expect(appendErrorLogEvent.mock.calls[0][0]).toMatchObject({
      phase: "server",
      subphase: "deploy",
      fault: "vercel-build-error",
      result: "still-failing",
      chatId: "chat_1",
      versionId: "ver_1",
    });

    // 3) Bus event — version.build.error, category "deploy". Does NOT trigger
    //    any repair (Ö3: repair only on the manual button).
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      t: "version.build.error",
      versionId: "ver_1",
      chatId: "chat_1",
      category: "deploy",
      error: { stage: "vercel-deploy" },
    });
  });

  it("no-ops when chatId or versionId is missing (legacy rows)", async () => {
    await logDeployError({
      chatId: null,
      versionId: "ver_1",
      deploymentId: "dep_1",
      source: "webhook",
    });
    await logDeployError({
      chatId: "chat_1",
      versionId: undefined,
      deploymentId: "dep_1",
      source: "poll",
    });

    expect(createEngineVersionErrorLogs).not.toHaveBeenCalled();
    expect(appendErrorLogEvent).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("never throws even when the DB write rejects (best-effort)", async () => {
    createEngineVersionErrorLogs.mockRejectedValue(new Error("db down"));

    await expect(
      logDeployError({
        chatId: "chat_1",
        versionId: "ver_1",
        source: "poll",
      }),
    ).resolves.toBeUndefined();

    // The RAG + bus signals still fire even if the DB row failed.
    expect(appendErrorLogEvent).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when none is supplied", async () => {
    await logDeployError({ chatId: "chat_1", versionId: "ver_1", source: "poll" });
    const [payloads] = createEngineVersionErrorLogs.mock.calls[0];
    expect(payloads[0].message).toMatch(/Vercel-bygget misslyckades/);
  });
});
