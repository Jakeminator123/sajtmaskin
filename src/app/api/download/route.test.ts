import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  parseCodeFilesFromFilesJson: vi.fn(() => []),
}));

vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject: vi.fn(),
}));

const { GET } = await import("./route");

describe("GET /api/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
  });

  it("uses tenant-scoped version lookup instead of global version access", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    const req = new NextRequest(
      "http://localhost/api/download?chatId=chat_1&versionId=ver_other",
    );

    const res = await GET(req);

    expect(getEngineVersionForChatByIdForRequest).toHaveBeenCalledWith(
      req,
      "chat_1",
      "ver_other",
    );
    expect(res.status).toBe(404);
  });

  it("requires authentication before resolving a download", async () => {
    getCurrentUser.mockResolvedValue(null);
    const req = new NextRequest(
      "http://localhost/api/download?chatId=chat_1&versionId=ver_1",
    );

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(getEngineVersionForChatByIdForRequest).not.toHaveBeenCalled();
  });
});
