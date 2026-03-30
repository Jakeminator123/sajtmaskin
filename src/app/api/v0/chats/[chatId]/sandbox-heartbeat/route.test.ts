import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActiveSandboxSessionAsync = vi.hoisted(() => vi.fn());
const touchSandboxSessionAsync = vi.hoisted(() => vi.fn());
const isSandboxConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/gen/sandbox-session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gen/sandbox-session-store")>(
    "@/lib/gen/sandbox-session-store",
  );
  return {
    ...actual,
    getActiveSandboxSessionAsync,
    touchSandboxSessionAsync,
  };
});

vi.mock("@/lib/mcp/runtime-url", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp/runtime-url")>("@/lib/mcp/runtime-url");
  return {
    ...actual,
    isSandboxConfigured,
  };
});

vi.mock("@/lib/gen/sandbox-lifecycle-telemetry", () => ({
  logSandboxLifecycleTelemetry: vi.fn(),
}));

import { POST } from "./route";

describe("POST sandbox-heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSandboxConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
  });

  it("rejects when session missing", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", sandboxId: "sb1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no_session");
    expect(touchSandboxSessionAsync).not.toHaveBeenCalled();
  });

  it("touches session when ids match", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", sandboxId: "sb1", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(touchSandboxSessionAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "c1",
        sandboxId: "sb1",
        versionId: "v1",
      }),
    );
  });

  it("rejects on sandboxId mismatch", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://x.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: "v1", sandboxId: "other", viewerId: "tab1" }),
      }),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("session_mismatch");
  });
});
