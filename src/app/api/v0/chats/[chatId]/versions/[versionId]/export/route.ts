import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { withRateLimit } from "@/lib/rateLimit";
import { assertV0Key, v0 } from "@/lib/v0";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getVersionFiles } from "@/lib/gen/version-manager";

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

      // -----------------------------------------------------------------
      // Non-fallback: build archive from SQLite files, upload to Blob
      // -----------------------------------------------------------------
      if (!shouldUseV0Fallback()) {
        const codeFiles = getVersionFiles(versionId);
        if (!codeFiles || codeFiles.length === 0) {
          return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }

        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const file of codeFiles) {
          zip.file(file.path, file.content);
        }

        const buffer = await zip.generateAsync({ type: "nodebuffer" });

        const safeChat = toSafeSegment(chatId) || "chat";
        const safeVersion = toSafeSegment(versionId) || "version";
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

      // -----------------------------------------------------------------
      // V0 fallback: existing v0 API download + Blob upload flow
      // -----------------------------------------------------------------
      assertV0Key();

      const includeDefaultFiles = searchParams.get("includeDefaultFiles") !== "false";

      const chat = await getChatByV0ChatIdForRequest(req, chatId);
      if (!chat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }

      let version = await db
        .select()
        .from(versions)
        .where(and(eq(versions.chatId, chat.id), eq(versions.id, versionId)))
        .limit(1);

      if (version.length === 0) {
        version = await db
          .select()
          .from(versions)
          .where(and(eq(versions.chatId, chat.id), eq(versions.v0VersionId, versionId)))
          .limit(1);
      }

      if (version.length === 0) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }

      const v0VersionId = version[0].v0VersionId;
      const downloadFormat = format === "tar" ? "tarball" : "zip";

      const downloadResult = await v0.chats.downloadVersion({
        chatId,
        versionId: v0VersionId,
        format: downloadFormat as "zip" | "tarball",
        includeDefaultFiles,
      });

      const arrayBuffer =
        typeof downloadResult === "string"
          ? await (async () => {
              const res = await fetch(downloadResult);
              if (!res.ok) {
                throw new Error(`Failed to fetch v0 download URL (HTTP ${res.status})`);
              }
              return await res.arrayBuffer();
            })()
          : await new Response(downloadResult as any).arrayBuffer();

      const buffer = Buffer.from(arrayBuffer);

      const safeChat = toSafeSegment(chatId) || "chat";
      const safeVersion = toSafeSegment(v0VersionId) || "version";
      const ext = format === "tar" ? "tar" : "zip";
      const contentType = format === "tar" ? "application/x-tar" : "application/zip";

      const pathname = `exports/${safeChat}/${safeVersion}-${Date.now()}.${ext}`;

      const blob = await put(pathname, buffer, {
        access: "public",
        contentType,
        token: blobToken,
      });

      return NextResponse.json({
        ok: true,
        format: ext,
        contentType,
        size: buffer.byteLength,
        blob,
      });
    } catch (err) {
      console.error("Blob export error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
