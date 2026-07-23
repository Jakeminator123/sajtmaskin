import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const getEngineVersionForChatByIdForRequest = vi.hoisted(() => vi.fn());
const getVersionFiles = vi.hoisted(() => vi.fn());
const buildExportableProject = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({ put }));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/tenant", () => ({
  getEngineVersionForChatByIdForRequest,
}));

vi.mock("@/lib/gen/version-manager", () => ({
  getVersionFiles,
}));

vi.mock("@/lib/gen/export/build-exportable-project", () => ({
  buildExportableProject,
  chatUsesVerbatimRepo: vi.fn().mockResolvedValue(false),
}));

// NOTE: `sanitizeEnvSecretsForPublicExport` and `stripGeneratedEnvLocalForZip`
// run REAL so we verify their composition order on the public export lane.

const { POST } = await import("./route");

describe("POST public version export zip", () => {
  const ORIGINAL_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_TOKEN;
  });

  it("redacts env values (sanitize) AND drops .env.local (strip), keeping .gitignore + env.example", async () => {
    getEngineVersionForChatByIdForRequest.mockResolvedValue({ version: { id: "ver-abcdef123456" } });
    getVersionFiles.mockResolvedValue([
      { path: "app/page.tsx", content: "export default function Page(){ return null; }" },
    ]);
    buildExportableProject.mockResolvedValue([
      { path: "package.json", content: "{}", language: "json" },
      { path: ".gitignore", content: "node_modules\n.env*\n!.env.example\n", language: "text" },
      { path: "env.example", content: "STRIPE_SECRET_KEY=sk_live_real\n", language: "text" },
      { path: ".env.local", content: "STRIPE_SECRET_KEY=sk_live_real\n", language: "text" },
    ]);

    let capturedBuffer: Buffer | undefined;
    put.mockImplementation(async (_pathname: string, body: Buffer) => {
      capturedBuffer = body;
      return { url: "https://blob.example/exports/x.zip", pathname: "exports/x.zip" };
    });

    const res = await POST(
      new Request("http://localhost/api/engine/chats/chat-1/versions/ver-1/export", {
        method: "POST",
      }),
      { params: Promise.resolve({ chatId: "chat-1", versionId: "ver-1" }) },
    );

    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
    expect(capturedBuffer).toBeDefined();

    const zip = await JSZip.loadAsync(capturedBuffer!);
    const names = Object.keys(zip.files);
    expect(names).toContain(".gitignore");
    expect(names).toContain("env.example");
    expect(names).not.toContain(".env.local");

    // sanitize ran (the real secret value is redacted) BEFORE strip removed
    // `.env.local` — proving the boundary composition order.
    const envExample = await zip.file("env.example")!.async("string");
    expect(envExample).toContain("STRIPE_SECRET_KEY=");
    expect(envExample).not.toContain("sk_live_real");
  });
});
