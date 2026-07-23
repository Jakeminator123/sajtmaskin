import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  buildExportableProject,
  chatUsesVerbatimRepo,
} from "@/lib/gen/export/build-exportable-project";
import { stripGeneratedEnvLocalForZip } from "@/lib/gen/export/strip-env-local-for-zip";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ chatId: string; versionId: string }> },
) {
  try {
    const { chatId, versionId } = await ctx.params;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const codeFiles = await getVersionFiles(scopedVersion.version.id);
    if (codeFiles && codeFiles.length > 0) {
      // Imported repos (v0-templates / ZIP imports) download verbatim — no
      // scaffold merge / baseline dep pins on top of the template's own stack.
      const verbatimRepo = await chatUsesVerbatimRepo(chatId);
      // Strip the verify-lane placeholder `.env.local` at the download boundary
      // (the shared builder keeps it for the verify/quality-gate lane).
      const completeProject = stripGeneratedEnvLocalForZip(
        await buildExportableProject(codeFiles, { verbatimRepo }),
      );
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const file of completeProject) {
        zip.file(file.path, file.content);
      }

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const filename = `version-${scopedVersion.version.id.slice(0, 8)}.zip`;

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
