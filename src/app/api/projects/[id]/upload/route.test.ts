// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const saveImage = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
const uploadBlob = vi.hoisted(() => vi.fn());
const deleteBlob = vi.hoisted(() => vi.fn());

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
  deleteBlob,
}));

const { POST } = await import("./route");

const PROJECT_ID = "proj_1";

function makeParams(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
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
    uploadBlob.mockResolvedValue({
      url: "https://blob.example/project.png",
      path: "user_1/projects/proj_1/project-files/project.png",
      storageType: "blob",
    });
    deleteBlob.mockResolvedValue(true);
    saveImage.mockResolvedValue({ id: "image_1" });
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

  it("rejects oversized project ids and filenames before upload", async () => {
    const png = new File([new Uint8Array([1])], "project.png", { type: "image/png" });
    const badProject = await POST(makeUploadRequest(png) as never, makeParams("x".repeat(201)));
    expect(badProject.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();

    const longName = new File([new Uint8Array([1])], `${"x".repeat(300)}.png`, {
      type: "image/png",
    });
    const badName = await POST(
      makeUploadRequest(longName) as never,
      makeParams(),
    );
    expect(badName.status).toBe(400);
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(saveImage).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared multipart body before parsing it", async () => {
    const png = new File([new Uint8Array([1])], "project.png", { type: "image/png" });
    const request = makeUploadRequest(png);
    request.headers.set("content-length", String(5 * 1024 * 1024 + 1));

    const res = await POST(request as never, makeParams());

    expect(res.status).toBe(413);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it.each([null, "1"])("limits actual multipart bytes with Content-Length %s", async (declaredLength) => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1])], "project.png", { type: "image/png" }));
    form.append("ignored-padding", "x".repeat(5 * 1024 * 1024));
    const request = new Request("http://localhost/api/projects/proj_1/upload", { method: "POST", body: form });
    if (declaredLength !== null) request.headers.set("content-length", declaredLength);

    const response = await POST(request as never, makeParams());

    expect(response.status).toBe(413);
    expect(uploadBlob).not.toHaveBeenCalled();
    expect(saveImage).not.toHaveBeenCalled();
  });

  it("rejects a text form field in place of a file", async () => {
    const formData = new FormData();
    formData.append("file", "not-a-file");

    const request = new Request("http://localhost/api/projects/proj_1/upload", { method: "POST", body: formData });
    const res = await POST(request as never, makeParams());

    expect(res.status).toBe(400);
    expect(uploadBlob).not.toHaveBeenCalled();
  });

  it("preserves the blob when the metadata write outcome is unknown", async () => {
    saveImage.mockRejectedValue(new Error("connection closed after commit"));
    const png = new File([new Uint8Array([1, 2, 3])], "project.png", { type: "image/png" });

    const res = await POST(makeUploadRequest(png) as never, makeParams());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "Failed to save uploaded file" });
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});
