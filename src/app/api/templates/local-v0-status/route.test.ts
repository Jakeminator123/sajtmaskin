import { beforeEach, describe, expect, it, vi } from "vitest";

const getAvailableLocalV0TemplateIds = vi.hoisted(() => vi.fn());

vi.mock("@/lib/templates/local-v0-template-source", () => ({
  getAvailableLocalV0TemplateIds,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

import { POST } from "./route";

describe("POST /api/templates/local-v0-status", () => {
  beforeEach(() => {
    getAvailableLocalV0TemplateIds.mockReset();
  });

  it("returns available local v0 template ids", async () => {
    getAvailableLocalV0TemplateIds.mockResolvedValue(new Set(["tmpl_1", "tmpl_3"]));

    const response = await POST(
      new Request("https://example.com/api/templates/local-v0-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["tmpl_3", "tmpl_1", "tmpl_2"] }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      availableIds: ["tmpl_1", "tmpl_3"],
    });
    expect(getAvailableLocalV0TemplateIds).toHaveBeenCalledWith([
      "tmpl_3",
      "tmpl_1",
      "tmpl_2",
    ]);
  });

  it("rejects empty ids payloads", async () => {
    const response = await POST(
      new Request("https://example.com/api/templates/local-v0-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: "Missing or empty 'ids' field",
    });
  });
});
