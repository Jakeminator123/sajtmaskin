import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner, getProjectData }));
const { GET } = await import("./route");

describe("owner project ZIP binary transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getProjectByIdForOwner.mockResolvedValue({ id: "project_1", name: "Demo" });
  });
  it("rejects an oversized project id before authentication", async () => {
    const response = await GET(new NextRequest("http://localhost/api/projects/x/download"), {
      params: Promise.resolve({ id: "x".repeat(201) }),
    });
    expect(response.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
  });
  it("preserves binary bytes, text and placeholder filtering", async () => {
    const files = [
      { name: "public/logo.png", content: "base64:iVBORwD/" },
      { name: "public/custom.asset", content: "base64:iVBORwD/" },
      { name: "public/binary.txt", content: "base64:iVBORwD/", language: "binary" },
      { name: "README.md", content: "base64:YWJj" },
      { name: "public/missing.png", content: "[BASE64_IMAGE:missing.png]" },
    ];
    getProjectData.mockResolvedValue({ files });
    const before = JSON.stringify(files);
    const response = await GET(new NextRequest("http://localhost/api/projects/project_1/download"), { params: Promise.resolve({ id: "project_1" }) });
    expect(response.status).toBe(200);
    expect(getProjectByIdForOwner).toHaveBeenCalledWith("project_1", { userId: "user_1" });
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    expect(await zip.file("public/logo.png")!.async("nodebuffer")).toEqual(Buffer.from([137, 80, 78, 71, 0, 255]));
    expect(await zip.file("public/custom.asset")!.async("nodebuffer")).toEqual(Buffer.from([137, 80, 78, 71, 0, 255]));
    expect(await zip.file("public/binary.txt")!.async("nodebuffer")).toEqual(Buffer.from([137, 80, 78, 71, 0, 255]));
    expect(await zip.file("README.md")!.async("string")).toBe("base64:YWJj");
    expect(zip.file("public/missing.png")).toBeNull();
    expect(JSON.stringify(files)).toBe(before);
  });
  it("rejects invalid file records instead of building a partial archive", async () => {
    getProjectData.mockResolvedValue({ files: [{ name: { nested: true }, content: "text" }] });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project_1/download"),
      { params: Promise.resolve({ id: "project_1" }) },
    );

    expect(response.status).toBe(400);
  });
  it("bounds the number of files before ZIP generation", async () => {
    getProjectData.mockResolvedValue({
      files: Array.from({ length: 601 }, (_, index) => ({
        name: `file-${index}.txt`,
        content: "x",
      })),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/projects/project_1/download"),
      { params: Promise.resolve({ id: "project_1" }) },
    );

    expect(response.status).toBe(413);
  });
  it("does not load project data without an owned project", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost/api/projects/project_1/download"), { params: Promise.resolve({ id: "project_1" }) });
    expect(response.status).toBe(404);
    expect(getProjectData).not.toHaveBeenCalled();
  });
});
