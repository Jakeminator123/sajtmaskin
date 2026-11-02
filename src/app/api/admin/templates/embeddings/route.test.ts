import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const regenerateTemplateEmbeddings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/gen/embeddings/embeddings-storage", () => ({
  getBlobReadWriteToken: () => "test-token",
}));
vi.mock("@/lib/templates/template-embeddings-refresh", () => ({
  regenerateTemplateEmbeddings,
}));

import { POST } from "./route";

describe("admin template embeddings API", () => {
  it("does not expose storage errors", async () => {
    regenerateTemplateEmbeddings.mockRejectedValue(
      new Error("blob token=secret storage.internal"),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/admin/templates/embeddings", {
        method: "POST",
        body: JSON.stringify({ dryRun: false }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Kunde inte bygga om inbäddningar",
    });
  });
});
