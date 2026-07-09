import { beforeEach, describe, expect, it, vi } from "vitest";

const emitVersionErrorLogs = vi.hoisted(() => vi.fn());
const appendErrorLogEvent = vi.hoisted(() => vi.fn());

// OMTAG-06 single-writer: logDeployError persists the durable row via the bus
// sink (`emitVersionErrorLogs`), NOT a direct `createEngineVersionErrorLogs`
// call + a separate `version.build.error` emit (that double-wrote when the sink
// was loaded in the same process).
vi.mock("@/lib/logging/event-bus-error-log-sink", () => ({
  emitVersionErrorLogs,
}));

vi.mock("@/lib/logging/error-log-rag", () => ({
  appendErrorLogEvent,
}));

const { logDeployError } = await import("./deploy-error-log");

describe("logDeployError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitVersionErrorLogs.mockReturnValue([]);
  });

  it("persists a single deploy-category error-log row (via bus sink) + a RAG event", async () => {
    await logDeployError({
      chatId: "chat_1",
      versionId: "ver_1",
      deploymentId: "dep_1",
      vercelDeploymentId: "dpl_1",
      inspectorUrl: "https://vercel.com/inspect/dpl_1",
      message: "next build failed: Type error",
      source: "webhook",
    });

    // 1) Exactly ONE durable write, routed through the bus sink (single writer).
    expect(emitVersionErrorLogs).toHaveBeenCalledTimes(1);
    const [payloads] = emitVersionErrorLogs.mock.calls[0];
    expect(payloads).toHaveLength(1);
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

    expect(emitVersionErrorLogs).not.toHaveBeenCalled();
    expect(appendErrorLogEvent).not.toHaveBeenCalled();
  });

  it("never throws even when the bus write rejects (best-effort)", async () => {
    emitVersionErrorLogs.mockImplementation(() => {
      throw new Error("bus down");
    });

    await expect(
      logDeployError({
        chatId: "chat_1",
        versionId: "ver_1",
        source: "poll",
      }),
    ).resolves.toBeUndefined();

    // The RAG signal still fires even if the durable write failed.
    expect(appendErrorLogEvent).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when none is supplied", async () => {
    await logDeployError({ chatId: "chat_1", versionId: "ver_1", source: "poll" });
    const [payloads] = emitVersionErrorLogs.mock.calls[0];
    expect(payloads[0].message).toMatch(/Hosting-bygget misslyckades/);
  });
});
