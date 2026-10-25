import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const readFile = vi.hoisted(() => vi.fn());

vi.mock("fs/promises", () => ({
  readFile,
  default: { readFile },
}));

vi.mock("@/lib/db/services/shared", () => ({
  getUploadsDir: () => "C:/tmp/sajtmaskin-uploads",
}));

const { GET } = await import("./route");

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/uploads/media/user_1/file.svg");
}

function makeParams(filename: string) {
  return { params: Promise.resolve({ path: ["user_1", filename] }) };
}

describe("GET /api/uploads/media/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFile.mockResolvedValue(Buffer.from("content"));
  });

  it("does not serve local SVG files as active content", async () => {
    const res = await GET(makeReq(), makeParams("logo.svg"));

    expect(res.status).toBe(415);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("does not serve local HTML files as active content", async () => {
    const res = await GET(makeReq(), makeParams("page.html"));

    expect(res.status).toBe(415);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("disables MIME sniffing for safe local files", async () => {
    const res = await GET(makeReq(), makeParams("photo.png"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects oversized path segments before filesystem work", async () => {
    const res = await GET(makeReq(), makeParams("x".repeat(256)));

    expect(res.status).toBe(400);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("maps a missing file to 404 without a separate existence check", async () => {
    readFile.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    const res = await GET(makeReq(), makeParams("missing.png"));

    expect(res.status).toBe(404);
    expect(readFile).toHaveBeenCalledOnce();
  });
});
