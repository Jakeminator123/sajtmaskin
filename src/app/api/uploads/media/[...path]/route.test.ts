import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const existsSync = vi.hoisted(() => vi.fn());
const readFile = vi.hoisted(() => vi.fn());

vi.mock("fs", () => ({
  existsSync,
  default: { existsSync },
}));

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
    existsSync.mockReturnValue(true);
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
});
