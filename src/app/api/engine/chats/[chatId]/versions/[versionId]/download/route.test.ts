import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const buildExportableProject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject,
}));

// NOTE: `stripGeneratedEnvLocalForZip` is intentionally NOT mocked — we exercise
// the real strip at the download boundary.

const { GET } = await import("./route");

describe("GET owner version download zip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ships a clean ZIP with .gitignore + env.example but never the placeholder .env.local", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "ver-abcdef123456" } });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){ return null; }" },
    ]);
    // Mirror what the shared builder produces: scaffold injects `.gitignore` +
    // the verify-lane placeholder `.env.local`; the version carries `env.example`.
    buildExportableProject.mockResolvedValue([
      { path: "package.json", content: "{}", language: "json" },
      { path: "app/page.tsx", content: "export default function Page(){ return null; }", language: "tsx" },
      { path: ".gitignore", content: "node_modules\n.env*\n!.env.example\n", language: "text" },
      { path: "env.example", content: "STRIPE_SECRET_KEY=\n", language: "text" },
      { path: ".env.local", content: "STRIPE_SECRET_KEY=sk_live_x\n", language: "text" },
    ]);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat-1/versions/ver-1/download"),
      { params: Promise.resolve({ chatId: "chat-1", versionId: "ver-1" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");

    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toContain(".gitignore");
    expect(names).toContain("env.example");
    expect(names).not.toContain(".env.local");
  });

  it("returns 404 when the version is not scoped to the chat", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/engine/chats/chat-1/versions/ver-1/download"),
      { params: Promise.resolve({ chatId: "chat-1", versionId: "ver-1" }) },
    );

    expect(res.status).toBe(404);
    expect(buildExportableProject).not.toHaveBeenCalled();
  });
});
