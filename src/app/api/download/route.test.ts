import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const parseCodeFilesFromFilesJson = vi.hoisted(() => vi.fn(() => [] as Array<{ path: string; content: string }>));
const buildExportableProject = vi.hoisted(() => vi.fn());

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
  parseCodeFilesFromFilesJson,
}));

vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject,
  chatUsesVerbatimRepo: vi.fn().mockResolvedValue(false),
}));

// NOTE: `stripGeneratedEnvLocalForZip` runs REAL — we exercise the actual strip
// at this owner download boundary.

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

  it("ships a clean ZIP with .gitignore + env.example but never the placeholder .env.local", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver_1", files_json: "[]" },
    });
    parseCodeFilesFromFilesJson.mockReturnValue([
      { path: "app/page.tsx", content: "export default function Page(){ return null; }" },
    ]);
    buildExportableProject.mockResolvedValue([
      { path: "package.json", content: "{}", language: "json" },
      { path: ".gitignore", content: "node_modules\n.env*\n!.env.example\n", language: "text" },
      { path: "env.example", content: "FOO=\n", language: "text" },
      { path: ".env.local", content: "FOO=bar\n", language: "text" },
    ]);

    const req = new NextRequest(
      "http://localhost/api/download?chatId=chat_1&versionId=ver_1",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain(".gitignore");
    expect(names).toContain("env.example");
    expect(names).not.toContain(".env.local");
  });
});
