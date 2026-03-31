import { beforeEach, describe, expect, it, vi } from "vitest";

const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getActiveSandboxSessionAsync = vi.hoisted(() => vi.fn());
const tryResumeSandboxById = vi.hoisted(() => vi.fn());
const isSandboxConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
}));

vi.mock("@/lib/gen/sandbox/session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gen/sandbox/session-store")>(
    "@/lib/gen/sandbox/session-store",
  );
  return {
    ...actual,
    getActiveSandboxSessionAsync,
  };
});

vi.mock("@/lib/mcp/runtime-url", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp/runtime-url")>("@/lib/mcp/runtime-url");
  return {
    ...actual,
    isSandboxConfigured,
    tryResumeSandboxById,
  };
});

vi.mock("@/lib/gen/sandbox/lifecycle-telemetry", () => ({
  logSandboxLifecycleTelemetry: vi.fn(),
}));

import { GET } from "./route";

describe("GET sandbox-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSandboxConfigured.mockReturnValue(true);
    getEngineChatByIdForRequest.mockResolvedValue({ id: "c1" });
  });

  it("returns 400 without versionId", async () => {
    const res = await GET(new Request("http://localhost/api"), { params: Promise.resolve({ chatId: "c1" }) });
    expect(res.status).toBe(400);
  });

  it("returns missing when no session", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api?versionId=v1"), {
      params: Promise.resolve({ chatId: "c1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("missing");
  });

  it("returns version_mismatch when session version differs", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://old.example",
      versionId: "v0",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    const res = await GET(
      new Request("http://localhost/api?versionId=v1"),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { status: string; versionId: string | null };
    expect(body.status).toBe("version_mismatch");
    expect(body.versionId).toBe("v0");
  });

  it("returns running when resume succeeds", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://stored.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeSandboxById.mockResolvedValue({ sandboxId: "sb1", primaryUrl: "https://live.example" });
    const res = await GET(
      new Request("http://localhost/api?versionId=v1"),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { status: string; sandboxUrl: string | null };
    expect(body.status).toBe("running");
    expect(body.sandboxUrl).toBe("https://live.example");
  });

  it("returns stopped when resume fails", async () => {
    getActiveSandboxSessionAsync.mockResolvedValue({
      sandboxId: "sb1",
      sandboxUrl: "https://stored.example",
      versionId: "v1",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    tryResumeSandboxById.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api?versionId=v1"),
      { params: Promise.resolve({ chatId: "c1" }) },
    );
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("stopped");
  });
});
