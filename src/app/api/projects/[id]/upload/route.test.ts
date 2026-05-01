import { beforeEach, describe, expect, it, vi } from "vitest";

const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const saveImage = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
}));

vi.mock("@/lib/db/services/media", () => ({
  saveImage,
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/vercel/blob-service", () => ({
  generateUniqueFilename: (name: string) => `safe-${name}`,
  uploadBlob,
}));

const { POST } = await import("./route");

const PROJECT_ID = "proj_1";

function makeParams() {
  return { params: Promise.resolve({ id: PROJECT_ID }) };
}

function makeUploadRequest(file: File): Request {
  const formData = new FormData();
  formData.append("file", file);
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/upload`, {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/projects/[id]/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getProjectByIdForOwner.mockResolvedValue({ id: PROJECT_ID });
  });

  it("rejects SVG uploads like the canonical media upload route", async () => {
    const svg = new File(["<svg><script>alert(1)</script></svg>"], "logo.svg", {
      type: "image/svg+xml",
    });

    const res = await POST(makeUploadRequest(svg) as never, makeParams());

    expect(res.status).toBe(415);
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(saveImage).not.toHaveBeenCalled();
  });
});
