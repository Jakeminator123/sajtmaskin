// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), select: vi.fn(), run: vi.fn(), limit: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/tenant", () => ({ getEngineVersionForChatByIdForRequest: mocks.owner }));
vi.mock("@/lib/rate-limit", () => ({ withRateLimit: mocks.limit }));
vi.mock("@/lib/db/chat-repository-pg", () => ({ listServerPostcheckCandidates: mocks.select }));
vi.mock("@/lib/gen/verify/server-verify", () => ({ runVersionPostchecks: mocks.run }));
import { POST, maxDuration } from "./route";

describe("tenant-scoped postcheck wakeup", () => {
  const ctx = { params: Promise.resolve({ chatId: "own-chat" }) };
  const req = (body: unknown = { versionId: "own-version" }) => new Request("https://preview.sajtmaskin.se/api/engine/chats/own-chat/postchecks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  beforeEach(() => {
    vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(10_000);
    mocks.owner.mockResolvedValue({ chat: {}, version: {} });
    mocks.select.mockResolvedValue([{ chatId: "own-chat", versionId: "own-version" }]);
    mocks.run.mockResolvedValue({ kind: "stop", reason: "starting", retryable: true });
    mocks.limit.mockImplementation((_req, _key, handler) => handler());
  });
  afterEach(() => vi.restoreAllMocks());
  it("authenticates the exact pair before selection and schedules the canonical resume with the original deadline", async () => {
    const request = req(); const response = await POST(request, ctx);
    const deadlineEpochMs = 10_000 + (maxDuration - 20) * 1000;
    expect(mocks.owner).toHaveBeenCalledWith(request, "own-chat", "own-version");
    expect(mocks.select).toHaveBeenCalledWith(1, deadlineEpochMs, { chatId: "own-chat", versionId: "own-version" });
    expect(mocks.limit).toHaveBeenCalledWith(request, "engine:postchecks", expect.any(Function), { failClosedOnTimeout: true });
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ accepted: true });
    expect(mocks.run).not.toHaveBeenCalled();
    vi.mocked(Date.now).mockReturnValue(20_000);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.run).toHaveBeenCalledWith({ chatId: "own-chat", versionId: "own-version", entry: "resume", deadlineEpochMs });
  });
  it("does no work for another guest/user or a mismatched chat-version pair", async () => {
    mocks.owner.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled();
  });
  it.each([{}, null, { versionId: "" }, { versionId: "v", files: [] }, { versionId: "v", userId: "other" }, { versionId: "v", deadlineEpochMs: 999999 }])("rejects invalid or authority-bearing payload %j", async body => {
    expect((await POST(req(body), ctx)).status).toBe(400); expect(mocks.owner).not.toHaveBeenCalled();
  });
  it.each([{ candidates: [] }, { candidates: [{ chatId: "foreign", versionId: "own-version" }] }, { candidates: [{ chatId: "own-chat", versionId: "other" }] }])("never substitutes another candidate %j", async ({ candidates }) => {
    mocks.select.mockResolvedValue(candidates);
    expect(await (await POST(req(), ctx)).json()).toEqual({ accepted: false }); expect(mocks.after).not.toHaveBeenCalled();
  });
  it("does not queue work if authorization/selection exhausts the deadline", async () => {
    mocks.select.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(999_999); return [{ chatId: "own-chat", versionId: "own-version" }]; });
    expect(await (await POST(req(), ctx)).json()).toEqual({ accepted: false }); expect(mocks.after).not.toHaveBeenCalled();
  });
  it("fails closed on lookup errors and on rate limiting", async () => {
    mocks.select.mockRejectedValueOnce(new Error("db unavailable"));
    expect((await POST(req(), ctx)).status).toBe(503); expect(mocks.after).not.toHaveBeenCalled();
    mocks.owner.mockClear(); mocks.limit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await POST(req(), ctx)).status).toBe(429); expect(mocks.owner).not.toHaveBeenCalled();
  });
});
