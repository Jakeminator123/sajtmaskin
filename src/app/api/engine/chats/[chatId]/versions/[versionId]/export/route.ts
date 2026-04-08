import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { buildExportableProject } from "@/lib/gen/build-exportable-project";

export const runtime = "nodejs";

function toSafeSegment(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ chatId: string; versionId: string }> },
) {
  return withRateLimit(req, "blob:export", async () => {
    try {
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
      if (!blobToken) {
        return NextResponse.json(
          {
            error: "Missing BLOB_READ_WRITE_TOKEN",
            setup: "Create a Blob token in Vercel Dashboard → Storage → Blob → Tokens.",
          },
          { status: 500 },
        );
      }

      const { chatId, versionId } = await ctx.params;
      const { searchParams } = new URL(req.url);
      const format = searchParams.get("format") === "tar" ? "tar" : "zip";

      const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
      if (!scopedVersion) {
        return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
      }
      const codeFiles = await getVersionFiles(scopedVersion.version.id);
      if (codeFiles && codeFiles.length > 0) {
        const completeProject = await buildExportableProject(codeFiles);
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const file of completeProject) {
          zip.file(file.path, file.content);
        }

        const buffer = await zip.generateAsync({ type: "nodebuffer" });

        const safeChat = toSafeSegment(chatId) || "chat";
        const safeVersion = toSafeSegment(scopedVersion.version.id) || "version";
        const contentType = "application/zip";
        const pathname = `exports/${safeChat}/${safeVersion}-${Date.now()}.zip`;

        const blob = await put(pathname, buffer, {
          access: "public",
          contentType,
          token: blobToken,
        });

        return NextResponse.json({
          ok: true,
          format: "zip",
          contentType,
          size: buffer.byteLength,
          blob,
        });
      }

      return NextResponse.json({ error: "No files found for version" }, { status: 404 });
    } catch (err) {
      console.error("Blob export error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
