import { NextRequest, NextResponse } from "next/server";

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
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Ingen fil bifogad" },
        { status: 400 }
      );
    }

    // Check file type
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { success: false, error: "Endast PDF-filer stöds" },
        { status: 400 }
      );
    }

    // Check file size (max 10MB for PDFs)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: "Filen är för stor (max 10MB)" },
        { status: 400 }
      );
    }

    // Read file as buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let extractedText = "";

    try {
      // Try to use pdf-parse if available
      const pdfParseModule = await import("pdf-parse");
      // pdf-parse can be exported as default or as the module itself
      // Use type assertion to handle different export formats
      const pdfParse = ((pdfParseModule as { default?: unknown }).default ||
        pdfParseModule) as (buffer: Buffer) => Promise<{ text: string }>;
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text || "";
    } catch (parseError) {
      // pdf-parse not installed or failed, try basic extraction
      const errorMsg =
        parseError instanceof Error ? parseError.message : "Unknown error";
      console.warn(
        `[Text/Extract] pdf-parse failed (${errorMsg}), using basic extraction`
      );

      // Basic text extraction from PDF (very limited fallback)
      // This looks for text streams in the PDF
      // Note: This is a simple fallback - for production, install pdf-parse
      const pdfString = buffer.toString("latin1");

      // Extract text between stream markers (basic approach)
      const streamMatches = pdfString.matchAll(
        /stream\s*([\s\S]*?)\s*endstream/g
      );

      for (const match of streamMatches) {
        const streamContent = match[1];
        // Try to extract readable text (filter out binary/encoded content)
        const textMatch = streamContent.match(/\(([^)]+)\)/g);
        if (textMatch) {
          const texts = textMatch.map((t) =>
            t.slice(1, -1).replace(/\\(.)/g, "$1")
          );
          extractedText += texts.join(" ") + "\n";
        }
      }

      // Also try to find text in BT/ET blocks (text objects)
      const textBlocks = pdfString.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
      for (const block of textBlocks) {
        const blockContent = block[1];
        // Look for TJ (text array) operators
        const tjMatches = blockContent.matchAll(/\[(.*?)\]\s*TJ/g);
        for (const tj of tjMatches) {
          const parts = tj[1].match(/\(([^)]*)\)/g);
          if (parts) {
            extractedText += parts.map((p) => p.slice(1, -1)).join("") + " ";
          }
        }
        // Also look for Tj (text string) operators
        const tjSingleMatches = blockContent.matchAll(/\(([^)]+)\)\s*Tj/g);
        for (const match of tjSingleMatches) {
          extractedText += match[1].replace(/\\(.)/g, "$1") + " ";
        }
      }
    }

    // Clean up extracted text
    extractedText = extractedText
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "") // Remove non-printable chars
      .trim();

    if (!extractedText) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Kunde inte extrahera text från PDF:en. Filen kan vara skannad eller skyddad.",
        },
        { status: 400 }
      );
    }

    console.log(
      `[Text/Extract] Extracted ${extractedText.length} chars from ${file.name}`
    );

    return NextResponse.json({
      success: true,
      content: extractedText,
      filename: file.name,
      charCount: extractedText.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[API/Text/Extract] Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
