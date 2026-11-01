import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const readFile = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({ default: { readFile }, readFile }));
vi.mock("@/lib/config", () => ({ PATHS: { uploads: "C:/tmp/sajtmaskin-uploads" } }));

const { GET } = await import("./route");

function request(filename: string) {
  return GET(new NextRequest(`http://localhost/api/uploads/${filename}`), {
    params: Promise.resolve({ filename }),
  });
}

describe("GET /api/uploads/[filename]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFile.mockResolvedValue(Buffer.from("content"));
  });

  it.each(["payload.svg", "payload.html"])(
    "does not serve the active document %s",
    async (filename) => {
      const response = await request(filename);

      expect(response.status).toBe(415);
      expect(readFile).not.toHaveBeenCalled();
    },
  );

  it("serves safe files with MIME sniffing disabled", async () => {
    const response = await request("photo.png");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects oversized filenames before filesystem access", async () => {
    const response = await request(`${"x".repeat(252)}.png`);

    expect(response.status).toBe(400);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing file without a separate exists race", async () => {
    readFile.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const response = await request("missing.png");

    expect(response.status).toBe(404);
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
