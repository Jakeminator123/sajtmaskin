import { NextRequest, NextResponse } from "next/server";
import { downloadVersionAsZip } from "@/lib/v0/v0-generator";
import JSZip from "jszip";
import { extractContent, generateBackofficeFiles } from "@/lib/backoffice";

/**
 * Download endpoint with optional backoffice injection
 *
 * Supports both GET (without password) and POST (with password for security)
 *
 * GET params: chatId, versionId, includeBackoffice
 * POST body: { chatId, versionId, includeBackoffice, password }
 */

// Helper to process download request
async function processDownload(
  chatId: string,
  versionId: string,
  includeBackoffice: boolean,
  password?: string
): Promise<NextResponse> {
  try {
    let zipBuffer: ArrayBuffer;
    try {
      zipBuffer = await downloadVersionAsZip(chatId, versionId);
    } catch (downloadError) {
      const errorMessage =
        downloadError instanceof Error ? downloadError.message : "Okänt fel";
      console.error("[API/download] Failed to download ZIP:", errorMessage);
      return NextResponse.json(
        { success: false, error: `Kunde inte ladda ner ZIP: ${errorMessage}` },
        { status: 500 }
      );
    }

    // If backoffice not requested, return original ZIP
    if (!includeBackoffice) {
      return new NextResponse(zipBuffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="sajtmaskin-${chatId}.zip"`,
        },
      });
    }

    // Load original ZIP
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
    } catch (zipError) {
      const errorMessage =
        zipError instanceof Error ? zipError.message : "Okänt fel";
      console.error("[API/download] Failed to load ZIP:", errorMessage);
      return NextResponse.json(
        { success: false, error: `Ogiltig ZIP-fil: ${errorMessage}` },
        { status: 400 }
      );
    }

    // Extract all code from the ZIP to analyze
    const codeFiles: { name: string; content: string }[] = [];
    const filePromises: Promise<void>[] = [];

    zip.forEach((relativePath, file) => {
      if (
        !file.dir &&
        (relativePath.endsWith(".tsx") ||
          relativePath.endsWith(".ts") ||
          relativePath.endsWith(".jsx") ||
          relativePath.endsWith(".js"))
      ) {
        filePromises.push(
          file
            .async("string")
            .then((content) => {
              codeFiles.push({ name: relativePath, content });
            })
            .catch((error) => {
              console.warn(
                `[API/download] Failed to read file ${relativePath}:`,
                error
              );
            })
        );
      }
    });

    await Promise.all(filePromises);

    // Extract content manifest from the code
    const MAX_COMBINED_CODE_SIZE = 5 * 1024 * 1024; // 5MB
    let combinedCode = codeFiles.map((f) => f.content).join("\n\n");
    if (combinedCode.length > MAX_COMBINED_CODE_SIZE) {
      combinedCode = combinedCode.substring(0, MAX_COMBINED_CODE_SIZE);
    }
    const manifest = extractContent(combinedCode, codeFiles);

    // Generate backoffice files with user's password
    const backofficePassword =
      password && password.trim().length > 0 ? password.trim() : undefined;
    const backoffice = generateBackofficeFiles(manifest, backofficePassword);

    // Add backoffice files to ZIP
    for (const file of backoffice.files) {
      zip.file(file.path, file.content);
    }

    zip.file(".env.example", backoffice.envExample);
    zip.file("BACKOFFICE-SETUP.md", backoffice.setupInstructions);

    // Generate new ZIP
    const newZipBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new NextResponse(newZipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="sajtmaskin-${chatId}-with-backoffice.zip"`,
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[API/download] Unexpected error:", errorMessage);
    return NextResponse.json(
      { success: false, error: `Nedladdning misslyckades: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// POST handler - secure way to send password
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatId, versionId, includeBackoffice, password } = body;

    if (!chatId || !versionId) {
      return NextResponse.json(
        { success: false, error: "chatId and versionId are required" },
        { status: 400 }
      );
    }

    return processDownload(chatId, versionId, !!includeBackoffice, password);
  } catch (error) {
    console.error("[API/download] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// GET handler - for simple downloads without password (backwards compatible)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const chatId = searchParams.get("chatId");
  const versionId = searchParams.get("versionId");
  const includeBackoffice = searchParams.get("includeBackoffice") === "true";
  // NOTE: Password in URL is deprecated for security reasons - use POST instead
  const password = searchParams.get("password");

  if (!chatId || !versionId) {
    return NextResponse.json(
      { success: false, error: "chatId and versionId are required" },
      { status: 400 }
    );
  }

  return processDownload(
    chatId,
    versionId,
    includeBackoffice,
    password || undefined
  );
}
