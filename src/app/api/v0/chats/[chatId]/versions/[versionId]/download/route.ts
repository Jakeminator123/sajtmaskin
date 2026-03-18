import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { buildCompleteProject } from "@/lib/gen/project-scaffold";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ chatId: string; versionId: string }> },
) {
  try {
    const { chatId, versionId } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "zip";

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const codeFiles = await getVersionFiles(scopedVersion.version.id);
    if (codeFiles && codeFiles.length > 0) {
      const completeProject = repairGeneratedFiles(buildCompleteProject(codeFiles)).files;
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const file of completeProject) {
        zip.file(file.path, file.content);
      }

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const ext = format === "tar" ? "zip" : "zip";
      const filename = `version-${scopedVersion.version.id.slice(0, 8)}.${ext}`;

      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: "No files found for version" }, { status: 404 });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
