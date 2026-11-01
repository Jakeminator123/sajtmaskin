import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const parseCodeFilesFromFilesJson = vi.hoisted(() =>
  vi.fn(() => [] as Array<{ path: string; content: string }>),
);
const buildExportableProject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/rate-limit", () => ({
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

const { GET, POST } = await import("./route");

function post(body: string): NextRequest {
  return new NextRequest("http://localhost/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("GET /api/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
  });

  it("uses tenant-scoped version lookup instead of global version access", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/download?chatId=chat_1&versionId=ver_other");

    const res = await GET(req);

    expect(getEngineVersionForChatByIdForRequest).toHaveBeenCalledWith(req, "chat_1", "ver_other");
    expect(res.status).toBe(404);
  });

  it("requires authentication before resolving a download", async () => {
    getCurrentUser.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/download?chatId=chat_1&versionId=ver_1");

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(getEngineVersionForChatByIdForRequest).not.toHaveBeenCalled();
  });

  it.each([
    `chatId=${"x".repeat(129)}&versionId=ver_1`,
    `chatId=chat_1&versionId=${"x".repeat(129)}`,
    `chatId=chat_1&versionId=ver_1&password=${"x".repeat(257)}`,
  ])("rejects oversized GET fields before version lookup: %s", async (query) => {
    const res = await GET(new NextRequest(`http://localhost/api/download?${query}`));
    expect(res.status).toBe(400);
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
      { path: "public/logo.png", content: "base64:iVBORwD/", language: "binary" },
      { path: "public/binary.txt", content: "base64:iVBORwD/", language: "binary" },
      { path: "README.md", content: "base64:YWJj", language: "text" },
    ]);

    const req = new NextRequest("http://localhost/api/download?chatId=chat_1&versionId=ver_1");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain(".gitignore");
    expect(names).toContain("env.example");
    expect(names).not.toContain(".env.local");
    expect(await zip.file("public/logo.png")!.async("nodebuffer")).toEqual(
      Buffer.from([137, 80, 78, 71, 0, 255]),
    );
    expect(await zip.file("public/binary.txt")!.async("nodebuffer")).toEqual(
      Buffer.from([137, 80, 78, 71, 0, 255]),
    );
    expect(await zip.file("README.md")!.async("string")).toBe("base64:YWJj");
  });

  it.each([
    ["invalid JSON", "not-json"],
    ["null", "null"],
    ["array", "[]"],
    ["object chat id", '{"chatId":{},"versionId":"ver_1"}'],
    [
      "string includeBackoffice",
      '{"chatId":"chat_1","versionId":"ver_1","includeBackoffice":"false"}',
    ],
    ["object password", '{"chatId":"chat_1","versionId":"ver_1","password":{}}'],
    [
      "oversized chat id",
      JSON.stringify({ chatId: "x".repeat(129), versionId: "ver_1" }),
    ],
    [
      "oversized version id",
      JSON.stringify({ chatId: "chat_1", versionId: "x".repeat(129) }),
    ],
    [
      "oversized password",
      JSON.stringify({ chatId: "chat_1", versionId: "ver_1", password: "x".repeat(257) }),
    ],
  ])("rejects POST payload with %s before version lookup", async (_label, body) => {
    const res = await POST(post(body));

    expect(res.status).toBe(400);
    expect(getEngineVersionForChatByIdForRequest).not.toHaveBeenCalled();
  });

  it("does not expose export failures", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({
      version: { id: "ver_1", files_json: "[]" },
    });
    parseCodeFilesFromFilesJson.mockReturnValue([{ path: "app/page.tsx", content: "page" }]);
    buildExportableProject.mockRejectedValue(new Error("secret filesystem path"));

    const req = new NextRequest("http://localhost/api/download?chatId=chat_1&versionId=ver_1");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Nedladdning misslyckades." });
    expect(JSON.stringify(body)).not.toContain("filesystem");
  });
});
