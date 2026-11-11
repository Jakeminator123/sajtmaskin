// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const pdfParse = vi.hoisted(() => vi.fn());
const pdfGetText = vi.hoisted(() => vi.fn());
const pdfDestroy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest,
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

vi.mock("pdf-parse", () => ({
  PDFParse: pdfParse,
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
    pdfParse.mockImplementation(function () {
      return { getText: pdfGetText, destroy: pdfDestroy };
    });
    pdfGetText.mockResolvedValue({ text: "Hello" });
    pdfDestroy.mockResolvedValue(undefined);
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
    pdfGetText.mockResolvedValue({ text: "Hej 日本 😀\u0000\nny rad" });

    const res = await POST(makePdfRequest());
    const body = (await res.json()) as { content: string };

    expect(res.status).toBe(200);
    expect(body.content).toBe("Hej 日本 😀 ny rad");
    expect(pdfParse).toHaveBeenCalledWith({ data: expect.any(Buffer) });
    expect(pdfGetText).toHaveBeenCalledWith({ pageJoiner: "" });
    expect(pdfDestroy).toHaveBeenCalledTimes(1);
  });

  it("extracts a valid PDF with the installed pdf-parse v2 implementation", async () => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    const { PDFParse } = await vi.importActual<typeof import("pdf-parse")>("pdf-parse");
    pdfParse.mockImplementationOnce(function (options) { return new PDFParse(options); });
    const stream = "BT /F1 12 Tf 72 720 Td (Installed parser works) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, i) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    const form = new FormData();
    form.append("file", new File([pdf], "valid.pdf", { type: "application/pdf" }));

    const response = await POST(new NextRequest("http://localhost/api/text/extract", {
      method: "POST", body: form,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, content: "Installed parser works", filename: "valid.pdf",
    });
  });

  it("preserves long text from an accepted PDF instead of imposing a new prompt limit", async () => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    pdfGetText.mockResolvedValue({ text: "x".repeat(100_001) });

    const res = await POST(makePdfRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, content: "x".repeat(100_001) });
  });

  it("rejects an oversized declared multipart body before parsing it", async () => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    const req = makePdfRequest();
    req.headers.set("content-length", String(11 * 1024 * 1024 + 1));

    const res = await POST(req);

    expect(res.status).toBe(413);
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it.each([null, "1"])("limits actual multipart bytes with Content-Length %s", async (declaredLength) => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    const form = new FormData();
    form.append("file", new File(["%PDF-1.7"], "document.pdf", { type: "application/pdf" }));
    form.append("ignored-padding", "x".repeat(11 * 1024 * 1024));
    const request = new NextRequest("http://localhost/api/text/extract", { method: "POST", body: form });
    if (declaredLength !== null) request.headers.set("content-length", declaredLength);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(pdfParse).not.toHaveBeenCalled();
  });

  it("returns unsupported instead of guessing text with the basic PDF regex fallback", async () => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    pdfGetText.mockRejectedValue(new Error("unsupported xref"));

    const res = await POST(makePdfRequest());
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error).toContain("bättre PDF-parser");
    expect(pdfDestroy).toHaveBeenCalledTimes(1);
  });

  it("does not expose malformed form-data parser failures", async () => {
    getSessionIdFromRequest.mockReturnValue("sess_1");
    const req = new NextRequest("http://localhost/api/text/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not multipart form data",
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Kunde inte läsa PDF-filen",
    });
  });
});
