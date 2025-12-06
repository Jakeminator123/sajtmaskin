import { NextRequest, NextResponse } from "next/server";
import { downloadVersionAsZip } from "@/lib/v0-generator";
import JSZip from "jszip";
import { extractContent, generateBackofficeFiles } from "@/lib/backoffice";

/**
 * Download endpoint with optional backoffice injection
 *
 * Query params:
 * - chatId: v0 chat ID
 * - versionId: v0 version ID
 * - includeBackoffice: "true" to include backoffice files (default: false)
 * - password: backoffice admin password (required if includeBackoffice is true)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const chatId = searchParams.get("chatId");
  const versionId = searchParams.get("versionId");
  const includeBackoffice = searchParams.get("includeBackoffice") === "true";
  const password = searchParams.get("password");

  if (!chatId || !versionId) {
    return NextResponse.json(
      { success: false, error: "chatId and versionId are required" },
      { status: 400 }
    );
  }

  try {
    console.log("[API/download] Downloading ZIP for:", chatId, versionId);
    console.log("[API/download] Include backoffice:", includeBackoffice);

    // Validate inputs
    if (!chatId || !versionId) {
      return NextResponse.json(
        { success: false, error: "chatId och versionId krävs" },
        { status: 400 }
      );
    }

    let zipBuffer: ArrayBuffer;
    try {
      zipBuffer = await downloadVersionAsZip(chatId, versionId);
    } catch (downloadError) {
      const errorMessage = downloadError instanceof Error ? downloadError.message : "Okänt fel";
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

    // Inject backoffice files
    console.log("[API/download] Injecting backoffice files...");

    // Load original ZIP
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
    } catch (zipError) {
      const errorMessage = zipError instanceof Error ? zipError.message : "Okänt fel";
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
          file.async("string")
            .then((content) => {
              codeFiles.push({ name: relativePath, content });
            })
            .catch((error) => {
              console.warn(`[API/download] Failed to read file ${relativePath}:`, error);
              // Skip binary files or corrupted files, continue with other files
            })
        );
      }
    });

    await Promise.all(filePromises);

    // Extract content manifest from the code
    const combinedCode = codeFiles.map((f) => f.content).join("\n\n");
    const manifest = extractContent(combinedCode, codeFiles);

    console.log("[API/download] Extracted manifest:", {
      siteType: manifest.siteType,
      contentCount: manifest.content.length,
      productCount: manifest.products.length,
    });

    // Generate backoffice files with user's password
    // Only use password if it's a non-empty string
    const backofficePassword = password && password.trim().length > 0 ? password.trim() : undefined;
    const backoffice = generateBackofficeFiles(manifest, backofficePassword);

    // Add backoffice files to ZIP
    for (const file of backoffice.files) {
      zip.file(file.path, file.content);
    }

    // Add .env.example
    zip.file(".env.example", backoffice.envExample);

    // Add setup instructions
    zip.file("BACKOFFICE-SETUP.md", backoffice.setupInstructions);

    // Generate new ZIP
    const newZipBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    console.log("[API/download] Backoffice injection complete");

    return new NextResponse(newZipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="sajtmaskin-${chatId}-with-backoffice.zip"`,
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[API/download] Error:", error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
