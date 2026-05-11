import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const pdfParse = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest,
}));

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("pdf-parse", () => ({
  default: pdfParse,
}));

const { POST } = await import("./route");

function makePdfRequest(): NextRequest {
  const formData = new FormData();
  formData.append("file", new File(["%PDF-1.7"], "document.pdf", { type: "application/pdf" }));
  return new NextRequest("http://localhost/api/text/extract", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/text/extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(null);
    getSessionIdFromRequest.mockReturnValue(null);
    pdfParse.mockResolvedValue({ text: "Hello" });
  });

  it("requires an authenticated user or existing guest session before parsing PDFs", async () => {
    const req = new NextRequest("http://localhost/api/text/extract", {
      method: "POST",
      body: new FormData(),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("preserves Unicode text from pdf-parse while removing control characters", async () => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    pdfParse.mockResolvedValue({ text: "Hej 日本 😀\u0000\nny rad" });

    const res = await POST(makePdfRequest());
    const body = (await res.json()) as { content: string };

    expect(res.status).toBe(200);
    expect(body.content).toBe("Hej 日本 😀 ny rad");
  });

  it("returns unsupported instead of guessing text with the basic PDF regex fallback", async () => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    pdfParse.mockRejectedValue(new Error("unsupported xref"));

    const res = await POST(makePdfRequest());
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error).toContain("bättre PDF-parser");
  });
});
