import { FEATURES, SECRETS } from "@/lib/config";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type FigmaParsedUrl = {
  fileKey: string;
  nodeId?: string;
};

type FigmaNode = {
  id?: string;
  name?: string;
  type?: string;
  children?: FigmaNode[];
};

type FigmaFileResponse = {
  name?: string;
  document?: FigmaNode;
};

type FigmaImagesResponse = {
  images?: Record<string, string | null>;
  err?: string;
};

const FIGMA_API_BASE = "https://api.figma.com/v1";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

type PreviewCacheEntry = {
  imageUrl: string;
  nodeId: string;
  fileKey: string;
  fileName: string;
  expiresAt: number;
};

type FileMetaCacheEntry = {
  nodeId: string;
  fileName: string;
  expiresAt: number;
};

const previewCache = new Map<string, PreviewCacheEntry>();
const fileMetaCache = new Map<string, FileMetaCacheEntry>();

function parseFigmaUrl(rawUrl: string): FigmaParsedUrl | null {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.includes("figma.com")) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const fileIndex = parts.findIndex((p) =>
      ["file", "design", "proto"].includes(p)
    );
    if (fileIndex === -1 || !parts[fileIndex + 1]) return null;

    const fileKey = parts[fileIndex + 1];
    const nodeId =
      url.searchParams.get("node-id") ||
      url.searchParams.get("node_id") ||
      undefined;
    return {
      fileKey,
      nodeId: nodeId ? decodeURIComponent(nodeId) : undefined,
    };
  } catch {
    return null;
  }
}

function findFirstCanvasId(node?: FigmaNode): string | null {
  if (!node) return null;
  if (node.type === "CANVAS" && node.id) return node.id;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findFirstCanvasId(child);
    if (found) return found;
  }
  return null;
}

function sanitizeFileName(value: string | undefined): string {
  const base = (value || "figma-preview").trim();
  const normalized = base.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized.slice(0, 40) : "figma-preview";
}

function getCacheEntry<T extends { expiresAt: number }>(
  store: Map<string, T>,
  key: string
): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry;
}

function setCacheEntry<T extends { expiresAt: number }>(
  store: Map<string, T>,
  key: string,
  entry: Omit<T, "expiresAt">
): void {
  store.set(key, {
    ...entry,
    expiresAt: Date.now() + CACHE_TTL_MS,
  } as T);
}

async function fetchWithTimeout(url: string, options: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, "figma:preview", async () => {
    const botError = requireNotBot(request);
    if (botError) return botError;

    const body = await request.json().catch(() => null);
    const figmaUrl = typeof body?.url === "string" ? body.url : "";
    if (!figmaUrl) {
      return NextResponse.json(
        { success: false, error: "Figma URL is required" },
        { status: 400 }
      );
    }

    if (!FEATURES.useFigmaApi) {
      return NextResponse.json(
        {
          success: false,
          error: "Figma API token not configured",
        },
        { status: 400 }
      );
    }

    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: "Invalid Figma URL" },
        { status: 400 }
      );
    }

    try {
      const headers = {
        "X-Figma-Token": SECRETS.figmaAccessToken,
      };

      let nodeId = parsed.nodeId;
      let fileName = "figma-preview";

      if (!nodeId) {
        const cachedMeta = getCacheEntry(fileMetaCache, parsed.fileKey);
        if (cachedMeta) {
          nodeId = cachedMeta.nodeId;
          fileName = cachedMeta.fileName;
        }
      }

      if (!nodeId) {
        const fileResponse = await fetchWithTimeout(
          `${FIGMA_API_BASE}/files/${parsed.fileKey}?depth=2`,
          { headers }
        );
        if (!fileResponse.ok) {
          if (fileResponse.status === 401 || fileResponse.status === 403) {
            return NextResponse.json(
              {
                success: false,
                error: "Figma token invalid or missing access",
              },
              { status: 401 }
            );
          }
          return NextResponse.json(
            {
              success: false,
              error: "Unable to access Figma file",
            },
            { status: 502 }
          );
        }

        const fileData = (await fileResponse.json()) as FigmaFileResponse;
        fileName = sanitizeFileName(fileData?.name);
        nodeId = findFirstCanvasId(fileData?.document) || undefined;
        if (nodeId) {
          setCacheEntry(fileMetaCache, parsed.fileKey, {
            nodeId,
            fileName,
          });
        }
      }

      if (!nodeId) {
        return NextResponse.json(
          {
            success: false,
            error: "No canvas found in Figma file",
          },
          { status: 404 }
        );
      }

      const cacheKey = `${parsed.fileKey}:${nodeId}`;
      const cachedPreview = getCacheEntry(previewCache, cacheKey);
      if (cachedPreview) {
        return NextResponse.json({
          success: true,
          imageUrl: cachedPreview.imageUrl,
          nodeId: cachedPreview.nodeId,
          fileKey: cachedPreview.fileKey,
          fileName: cachedPreview.fileName,
          cached: true,
        });
      }

      const imagesResponse = await fetchWithTimeout(
        `${FIGMA_API_BASE}/images/${parsed.fileKey}?ids=${encodeURIComponent(
          nodeId
        )}&format=png&scale=1`,
        { headers }
      );

      if (!imagesResponse.ok) {
        if (imagesResponse.status === 401 || imagesResponse.status === 403) {
          return NextResponse.json(
            {
              success: false,
              error: "Figma token invalid or missing access",
            },
            { status: 401 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: "Failed to render Figma preview",
          },
          { status: 502 }
        );
      }

      const imagesData = (await imagesResponse.json()) as FigmaImagesResponse;
      const imageUrl = imagesData.images?.[nodeId] || null;

      if (!imageUrl) {
        return NextResponse.json(
          {
            success: false,
            error: imagesData.err || "No preview image returned",
          },
          { status: 502 }
        );
      }

      setCacheEntry(previewCache, cacheKey, {
        imageUrl,
        nodeId,
        fileKey: parsed.fileKey,
        fileName,
      });

      return NextResponse.json({
        success: true,
        imageUrl,
        nodeId,
        fileKey: parsed.fileKey,
        fileName,
        cached: false,
      });
    } catch (error) {
      console.error("[API/figma-preview] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch Figma preview" },
        { status: 500 }
      );
    }
  });
}
