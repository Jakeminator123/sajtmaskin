/**
 * Extracts text content from uploaded documents (PDF, Word/DOCX).
 * Used by the Company Intelligence pipeline to include document
 * uploads as an information source for AI synthesis.
 */

const MAX_TEXT_CHARS = 50_000;

export type ExtractedDocument = {
  filename: string;
  mimeType: string;
  text: string;
  wordCount: number;
};

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
]);

export function isExtractableDocument(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

export const DOCUMENT_MIME_TYPES = [...SUPPORTED_MIME_TYPES];

export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractedDocument> {
  let text = "";

  if (mimeType === "application/pdf") {
    text = await extractPdf(buffer);
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    text = await extractDocx(buffer);
  } else if (mimeType === "text/plain") {
    text = buffer.toString("utf-8");
  } else {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  text = text.slice(0, MAX_TEXT_CHARS).trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return { filename, mimeType, text, wordCount };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text || "";
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}
