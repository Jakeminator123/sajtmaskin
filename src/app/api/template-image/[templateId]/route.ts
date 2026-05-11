import { access, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getTemplateById } from "@/lib/templates/template-data";

let _templateImagesRoot: string | null = null;
function getTemplateImagesRoot(): string {
  if (!_templateImagesRoot) {
    // Narrow Turbopack file tracing: do not union-scan the repo for dynamic image paths.
    _templateImagesRoot = join(
      /* turbopackIgnore: true */ process.cwd(),
      "templates_v0",
      "downloads",
      "template-images",
    );
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
const FALLBACK_CACHE_HEADER = "public, max-age=3600, stale-while-revalidate=86400";

async function canAccess(filePath: string): Promise<boolean> {
  try {
    await access(/* turbopackIgnore: true */ filePath);
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
  const base = join(
    /* turbopackIgnore: true */ getTemplateImagesRoot(),
    template.category,
    templateId,
  );

  for (const subdir of ["listing", "detail"]) {
    const fullPath = join(/* turbopackIgnore: true */ base, subdir, imageFilename);
    if (!(await canAccess(fullPath))) continue;
    try {
      const buffer = await readFile(/* turbopackIgnore: true */ fullPath);
      return { buffer, contentType };
    } catch {
      continue;
    }
  }

  return null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFallbackSvg(templateId: string): string {
  const label = escapeXml(templateId);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="Template preview placeholder">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="55%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#134e4a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)"/>
  <rect x="64" y="64" width="1072" height="672" rx="36" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)"/>
  <text x="96" y="150" fill="#e5e7eb" font-family="system-ui, sans-serif" font-size="44" font-weight="700">Sajtmaskin template</text>
  <text x="96" y="215" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="24">Preview image saknas lokalt</text>
  <text x="96" y="680" fill="#5eead4" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22">${label}</text>
</svg>`;
}

function fallbackImageResponse(templateId: string): NextResponse {
  return new NextResponse(buildFallbackSvg(templateId), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": FALLBACK_CACHE_HEADER,
      "X-Template-Image-Fallback": "1",
    },
  });
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
    return fallbackImageResponse(templateId);
  }

  return new NextResponse(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": CACHE_HEADER,
    },
  });
}
