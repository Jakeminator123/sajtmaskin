import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getTelemetryForVersion = vi.hoisted(() => vi.fn());
const updateTelemetryRecord = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({ getEngineVersionForChatByIdForRequest }));
vi.mock("@/lib/db/services/generation-telemetry", () => ({
  getTelemetryForVersion,
  updateTelemetryRecord,
}));
vi.mock("@/lib/db/services/version-errors", () => ({ createEngineVersionErrorLogs }));

const { POST } = await import("./route");
const context = { params: Promise.resolve({ chatId: "chat_1", versionId: "version_1" }) };

function request(body: unknown) {
  return new Request("http://localhost/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("version feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      chat: { id: "chat_internal" },
      version: { id: "version_internal" },
    });
    getTelemetryForVersion.mockResolvedValue([]);
    createEngineVersionErrorLogs.mockResolvedValue(undefined);
  });

  it.each([
    { rating: "negative", categories: "not-an-array" },
    { rating: "negative", categories: ["x".repeat(101)] },
    { rating: "negative", comment: "x".repeat(2_001) },
  ])("rejects malformed feedback metadata %#", async (body) => {
    const response = await POST(request(body), context);

    expect(response.status).toBe(400);
    expect(getTelemetryForVersion).not.toHaveBeenCalled();
  });

  it("normalizes valid feedback before persistence", async () => {
    const response = await POST(
      request({ rating: "negative", categories: ["  layout  "], comment: "  needs work  " }),
      context,
    );

    expect(response.status).toBe(200);
    expect(createEngineVersionErrorLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        meta: { rating: "negative", categories: ["layout"], comment: "needs work" },
      }),
    ]);
  });
});
