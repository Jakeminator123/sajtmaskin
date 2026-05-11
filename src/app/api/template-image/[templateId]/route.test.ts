import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/templates/template-data", () => ({
  getTemplateById: (id: string) =>
    id === "missing_image"
      ? {
          id,
          title: "Missing image",
          slug: "missing-image",
          imageFilename: "missing.png",
          previewImageUrl: `/api/template-image/${id}`,
          category: "website-templates",
        }
      : null,
}));

import { GET } from "./route";

describe("GET /api/template-image/[templateId]", () => {
  it("returns a cacheable SVG fallback instead of 404 when the local thumbnail is missing", async () => {
    const response = await GET(
      new Request("https://example.com/api/template-image/missing_image") as never,
      { params: Promise.resolve({ templateId: "missing_image" }) },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("x-template-image-fallback")).toBe("1");
    expect(body).toContain("missing_image");
  });

  it("still rejects invalid template ids", async () => {
    const response = await GET(
      new Request("https://example.com/api/template-image/../bad") as never,
      { params: Promise.resolve({ templateId: "../bad" }) },
    );

    expect(response.status).toBe(400);
  });
});
