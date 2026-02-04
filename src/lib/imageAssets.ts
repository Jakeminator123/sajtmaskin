import { put } from "@vercel/blob";
import crypto from "crypto";

export type ImageAssetStrategy = "external" | "blob";

export type TextFile = { name: string; content: string };

export type MaterializeImagesLimits = {
  maxImages: number;
  maxBytesPerImage: number;
  maxTotalBytes: number;
  timeoutMs: number;
};

export type MaterializeImagesResult = {
  files: TextFile[];
  strategyUsed: ImageAssetStrategy;
  warnings: string[];
  summary: {
    scannedFiles: number;
    foundUrls: number;
    uploaded: number;
    replaced: number;
    skipped: number;
    totalBytesUploaded: number;
  };
  assets: Array<{
    sourceUrl: string;
    blobUrl: string;
    contentType: string | null;
    size: number;
  }>;
};

const DEFAULT_LIMITS: MaterializeImagesLimits = {
  maxImages: 25,
  maxBytesPerImage: 4 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  timeoutMs: 15_000,
};

function toSafeSegment(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

function extractHttpUrls(text: string): string[] {
  const re = /\bhttps?:\/\/[^\s"'<>\\)]+/g;
  return text.match(re) ?? [];
}

function looksLikeImageUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  if (rawUrl.startsWith("data:")) return false;

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host.includes(".blob.vercel-storage.com")) return false;
  if (host === "localhost" || host === "127.0.0.1") return false;
  // v0 preview assets are often hosted on vusercontent.net without extensions.
  if (host.endsWith("vusercontent.net")) return true;

  const path = u.pathname.toLowerCase();

  const nonImageExts = [
    ".js",
    ".mjs",
    ".cjs",
    ".css",
    ".map",
    ".json",
    ".txt",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
    ".zip",
    ".tar",
    ".gz",
  ];
  if (nonImageExts.some((ext) => path.endsWith(ext))) return false;

  const imageExts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif", ".bmp", ".ico"];
  if (imageExts.some((ext) => path.endsWith(ext))) return true;

  if (path.includes("/_next/image")) return true;

  const fmt = (u.searchParams.get("fm") || u.searchParams.get("format") || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"].includes(fmt)) return true;

  return false;
}

function guessExtension(contentType: string | null, fallbackUrl: string): string {
  const ct = (contentType || "").toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/bmp": ".bmp",
  };
  if (ct && map[ct]) return map[ct];

  try {
    const u = new URL(fallbackUrl);
    const p = u.pathname.toLowerCase();
    const idx = p.lastIndexOf(".");
    if (idx >= 0 && idx < p.length - 1) {
      const ext = p.slice(idx);
      if (ext.length <= 6) return ext;
    }
  } catch {
    // ignore
  }

  return ".img";
}

async function fetchWithLimits(
  url: string,
  limits: MaterializeImagesLimits,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), limits.timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "sajtmaskin/1.0 (+https://localhost)",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type");
    const contentLengthHeader = res.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    if (
      contentLength != null &&
      Number.isFinite(contentLength) &&
      contentLength > limits.maxBytesPerImage
    ) {
      throw new Error(`Image too large (${contentLength} bytes)`);
    }

    const body = res.body;
    if (!body || typeof (body as any).getReader !== "function") {
      const arrayBuffer = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      if (buf.byteLength > limits.maxBytesPerImage)
        throw new Error(`Image too large (${buf.byteLength} bytes)`);
      return { buffer: buf, contentType };
    }

    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const chunks: Buffer[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > limits.maxBytesPerImage) {
        try {
          reader.cancel();
        } catch {
          // ignore
        }
        throw new Error(`Image too large (>${limits.maxBytesPerImage} bytes)`);
      }
      chunks.push(Buffer.from(value));
    }

    return { buffer: Buffer.concat(chunks), contentType };
  } finally {
    clearTimeout(t);
  }
}

export async function materializeImagesInTextFiles(params: {
  files: TextFile[];
  strategy: ImageAssetStrategy;
  blobToken: string | null | undefined;
  namespace: { chatId: string; versionId: string };
  limits?: Partial<MaterializeImagesLimits>;
}): Promise<MaterializeImagesResult> {
  const limits: MaterializeImagesLimits = { ...DEFAULT_LIMITS, ...(params.limits || {}) };
  const warnings: string[] = [];

  if (params.strategy !== "blob") {
    return {
      files: params.files,
      strategyUsed: params.strategy,
      warnings,
      summary: {
        scannedFiles: params.files.length,
        foundUrls: 0,
        uploaded: 0,
        replaced: 0,
        skipped: 0,
        totalBytesUploaded: 0,
      },
      assets: [],
    };
  }

  const blobToken = params.blobToken;
  if (!blobToken) {
    warnings.push("Missing BLOB_READ_WRITE_TOKEN; falling back to external image URLs.");
    return {
      files: params.files,
      strategyUsed: "external",
      warnings,
      summary: {
        scannedFiles: params.files.length,
        foundUrls: 0,
        uploaded: 0,
        replaced: 0,
        skipped: 0,
        totalBytesUploaded: 0,
      },
      assets: [],
    };
  }

  const urlSet = new Set<string>();
  for (const f of params.files) {
    const urls = extractHttpUrls(f.content);
    for (const u of urls) {
      urlSet.add(u);
    }
  }

  const candidates = Array.from(urlSet).filter(looksLikeImageUrl);

  const assets: MaterializeImagesResult["assets"] = [];
  let uploaded = 0;
  let replaced = 0;
  let skipped = 0;
  let totalBytesUploaded = 0;

  const urlToBlob = new Map<
    string,
    { blobUrl: string; contentType: string | null; size: number }
  >();

  for (const url of candidates.slice(0, limits.maxImages)) {
    try {
      const { buffer, contentType } = await fetchWithLimits(url, limits);
      const size = buffer.byteLength;
      totalBytesUploaded += size;
      if (totalBytesUploaded > limits.maxTotalBytes) {
        warnings.push("Reached max total image upload size. Remaining images are skipped.");
        skipped += 1;
        break;
      }

      const ext = guessExtension(contentType, url);
      const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 12);
      const safeChat = toSafeSegment(params.namespace.chatId);
      const safeVersion = toSafeSegment(params.namespace.versionId);
      const pathname = `images/${safeChat}/${safeVersion}/${hash}${ext}`;

      const blob = await put(pathname, buffer, {
        access: "public",
        contentType: contentType || undefined,
        token: blobToken,
      });

      urlToBlob.set(url, { blobUrl: blob.url, contentType: contentType || null, size });
      assets.push({ sourceUrl: url, blobUrl: blob.url, contentType: contentType || null, size });
      uploaded += 1;
    } catch (err) {
      skipped += 1;
      warnings.push(
        `Failed to upload image ${url}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  const files = params.files.map((f) => {
    let content = f.content;
    for (const [url, blob] of urlToBlob.entries()) {
      if (content.includes(url)) {
        content = content.split(url).join(blob.blobUrl);
        replaced += 1;
      }
    }
    return { ...f, content };
  });

  return {
    files,
    strategyUsed: "blob",
    warnings,
    summary: {
      scannedFiles: params.files.length,
      foundUrls: candidates.length,
      uploaded,
      replaced,
      skipped,
      totalBytesUploaded,
    },
    assets,
  };
}
