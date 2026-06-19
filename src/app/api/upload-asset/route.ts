import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

/**
 * Asset upload for the ported wizard / builder ("Bilder" tab + dialogs).
 *
 * Stores the uploaded file under `public/uploads/<assetId>/<filename>` and
 * returns a viewser `AssetRef` with an absolute `sourceUrl` the generated
 * site + preview can reference. No auth required (studio guest sessions),
 * unlike the native authenticated media library.
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
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function sanitizeName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "asset"
  );
}

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
  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      ok: false,
      error: "Filen är för stor (max 25 MB).",
    });
  }

  try {
    const assetId = randomUUID();
    const ext = EXT_BY_MIME[mime] ?? "bin";
    const baseName = sanitizeName(file.name || `${role}.${ext}`);
    const filename = baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads", assetId);
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    const origin = new URL(req.url).origin;
    const sourceUrl = `${origin}/uploads/${assetId}/${encodeURIComponent(filename)}`;

    const ref = {
      assetId,
      filename,
      mimeType: mime,
      sizeBytes: file.size,
      width: null,
      height: null,
      alt: baseName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " "),
      role,
      sourceUrl,
    };

    return NextResponse.json({ ok: true, ref });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Uppladdning misslyckades.",
    });
  }
}
