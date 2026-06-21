import { NextResponse } from "next/server";

import {
  generateUniqueFilename,
  uploadBlob,
} from "@/lib/vercel/blob-service";

/**
 * Asset upload for the ported wizard / builder ("Bilder" tab + dialogs + the
 * start-page box).
 *
 * Stores the file via the shared blob-service so it works BOTH on Vercel
 * (Vercel Blob → public URL) and locally (LocalFsProvider → /api/uploads/media).
 * The previous implementation wrote to `public/uploads/` which fails on
 * Vercel's read-only serverless filesystem. No auth required (studio guest
 * sessions), unlike the native authenticated media library.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ogiltig formdata." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const role = (form.get("role") as string | null) ?? "gallery";
  const siteId = (form.get("siteId") as string | null) ?? "";
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Ingen fil bifogad." },
      { status: 400 },
    );
  }

  const mime = file.type;
  const isImage = IMAGE_MIMES.has(mime);
  const isVideo = VIDEO_MIMES.has(mime);
  if (!isImage && !isVideo) {
    return NextResponse.json({
      ok: false,
      error: `Filtypen ${mime || "okänd"} stöds inte. Använd PNG, JPEG, WEBP, SVG eller MP4/WEBM.`,
    });
  }

  try {
    const baseName = (file.name || `${role}`).trim();
    const filename = generateUniqueFilename(baseName, role);
    const buffer = Buffer.from(await file.arrayBuffer());

    // Scopas under siteId om känt, annars en gäst-bucket. blob-service väljer
    // Vercel Blob (hosting) eller lokal FS (dev) automatiskt via env.
    const stored = await uploadBlob({
      userId: siteId.trim() || "studio-guest",
      filename,
      buffer,
      contentType: mime || "application/octet-stream",
      category: "media",
    });

    if (!stored?.url) {
      return NextResponse.json({
        ok: false,
        error:
          "Kunde inte spara filen. På hosting är gränsen ~4,5 MB per fil via servern — prova en mindre fil.",
      });
    }

    const alt = baseName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ");
    const ref = {
      assetId: stored.path,
      filename: baseName || filename,
      mimeType: mime,
      sizeBytes: file.size,
      width: null,
      height: null,
      alt,
      role,
      sourceUrl: stored.url,
    };

    return NextResponse.json({ ok: true, ref });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Uppladdning misslyckades.",
    });
  }
}
