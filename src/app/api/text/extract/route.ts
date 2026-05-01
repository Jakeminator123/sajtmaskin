import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { withRateLimit } from "@/lib/rateLimit";

const CONTROL_CHARS_EXCEPT_WHITESPACE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Text Extraction API
 * ===================
 *
 * Extracts text content from PDF files.
 * Uses pdf-parse library for extraction.
 *
 * POST /api/text/extract
 * FormData: { file: File }
 * Returns: { content: string }
 *
 * Note: For production, consider using a more robust PDF library
 * or a dedicated service like Adobe PDF Services API.
 */

export async function POST(request: NextRequest) {
  return withRateLimit(request, "text:extract", async () => {
    try {
      const user = await getCurrentUser(request);
      const sessionId = getSessionIdFromRequest(request);
      if (!user && !sessionId) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json({ success: false, error: "Ingen fil bifogad" }, { status: 400 });
      }

      // Check file type
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        return NextResponse.json(
          { success: false, error: "Endast PDF-filer stöds" },
          { status: 400 },
        );
      }

      // Check file size (max 10MB for PDFs)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return NextResponse.json(
          { success: false, error: "Filen är för stor (max 10MB)" },
          { status: 400 },
        );
      }

      // Read file as buffer
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      let extractedText = "";

      try {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = ((pdfParseModule as { default?: unknown }).default || pdfParseModule) as (
          buffer: Buffer,
        ) => Promise<{ text: string }>;
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text || "";
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : "Unknown error";
        console.warn(`[Text/Extract] pdf-parse failed (${errorMsg}); extraction unsupported`);
        return NextResponse.json(
          {
            success: false,
            error:
              "Kunde inte extrahera text från PDF:en. Filen kan vara skannad, skyddad eller kräva en bättre PDF-parser.",
          },
          { status: 422 },
        );
      }

      // Normalize whitespace and remove control characters while preserving Unicode text.
      extractedText = extractedText
        .replace(/\s+/g, " ")
        .replace(CONTROL_CHARS_EXCEPT_WHITESPACE, "")
        .trim();

      if (!extractedText) {
        return NextResponse.json(
          {
            success: false,
            error: "Kunde inte extrahera text från PDF:en. Filen kan vara skannad eller skyddad.",
          },
          { status: 400 },
        );
      }

      console.info(`[Text/Extract] Extracted ${extractedText.length} chars from ${file.name}`);

      return NextResponse.json({
        success: true,
        content: extractedText,
        filename: file.name,
        charCount: extractedText.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Okänt fel";
      console.error("[API/Text/Extract] Error:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  });
}
