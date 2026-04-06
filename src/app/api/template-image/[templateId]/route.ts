import { readdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

const TEMPLATE_IMAGES_ROOT = resolve(
  process.cwd(),
  "templates_v0/downloads/template-images",
);

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const CACHE_HEADER = "public, max-age=86400, stale-while-revalidate=604800";

async function tryReadDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function findFirstImage(
  templateId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const categories = await tryReadDir(TEMPLATE_IMAGES_ROOT);
  if (categories.length === 0) return null;

  for (const category of categories) {
    const templateDir = resolve(
      TEMPLATE_IMAGES_ROOT,
      category,
      templateId,
    );

    for (const subdir of ["listing", "detail"]) {
      const dir = resolve(templateDir, subdir);
      const files = await tryReadDir(dir);
      const imageFile = files
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()[0];

      if (imageFile) {
        const fullPath = resolve(dir, imageFile);
        const ext = extname(imageFile).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        try {
          const buffer = await readFile(fullPath);
          return { buffer, contentType };
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  if (!templateId || !/^[A-Za-z0-9_-]+$/.test(templateId)) {
    return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
  }

  const image = await findFirstImage(templateId);
  if (!image) {
    return NextResponse.json(
      { error: "Image not found" },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": CACHE_HEADER,
    },
  });
}
