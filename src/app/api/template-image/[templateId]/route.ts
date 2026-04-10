import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getTemplateById } from "@/lib/templates/template-data";

let _templateImagesRoot: string | null = null;
function getTemplateImagesRoot(): string {
  if (!_templateImagesRoot) {
    _templateImagesRoot = join(process.cwd(), "templates_v0", "downloads", "template-images");
  }
  return _templateImagesRoot;
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const CACHE_HEADER = "public, max-age=86400, stale-while-revalidate=604800";

async function canAccess(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findFirstImage(
  templateId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const template = getTemplateById(templateId);
  if (!template) return null;

  const imageFilename =
    typeof template.imageFilename === "string" && template.imageFilename.trim()
      ? template.imageFilename.trim()
      : `${templateId}.jpg`;
  const ext = extname(imageFilename).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const base = join(getTemplateImagesRoot(), template.category, templateId);

  for (const subdir of ["listing", "detail"]) {
    const fullPath = join(base, subdir, imageFilename);
    if (!(await canAccess(fullPath))) continue;
    try {
      const buffer = await readFile(fullPath);
      return { buffer, contentType };
    } catch {
      continue;
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
