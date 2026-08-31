/**
 * Shared storage for platform embedding JSON artifacts.
 *
 * Source of truth in prod: Vercel Blob (`embeddings/*.json`).
 * Local JSON paths are a writable cache for CLI/dev/tests — not committed.
 * Public URLs live in `config/embeddings-blob-manifest.json` (committed, no secrets)
 * so CI/prebuild can fetch without BLOB_READ_WRITE_TOKEN.
 */
import { promises as fs } from "fs";
import path from "path";
import { LocalFsProvider } from "@/lib/storage/local-fs-provider";
import { VercelBlobProvider } from "@/lib/storage/vercel-blob-provider";

export type EmbeddingsArtifactId = "template" | "scaffold" | "variant";

export const EMBEDDINGS_ARTIFACTS: Record<
  EmbeddingsArtifactId,
  { localRelPath: string; blobKey: string }
> = {
  template: {
    localRelPath: "src/lib/templates/template-embeddings.json",
    blobKey: "embeddings/template-embeddings.json",
  },
  scaffold: {
    localRelPath: "src/lib/gen/scaffolds/scaffold-embeddings.json",
    blobKey: "embeddings/scaffold-embeddings.json",
  },
  variant: {
    localRelPath: "config/scaffold-variants/_index/variant-embeddings.json",
    blobKey: "embeddings/variant-embeddings.json",
  },
};

/** Paths that must never be git-tracked (kept in sync with check script). */
export const EMBEDDINGS_GIT_TRACKED_FORBIDDEN_PATHS: readonly string[] = Object.values(
  EMBEDDINGS_ARTIFACTS,
).map((a) => a.localRelPath.replace(/\\/g, "/"));

export const EMBEDDINGS_BLOB_MANIFEST_REL =
  "config/embeddings-blob-manifest.json";

export type EmbeddingsStorageMode = "blob" | "local";

export interface SaveEmbeddingsResult {
  storage: EmbeddingsStorageMode;
  blobUrl?: string;
  localPath?: string;
}

export interface EmbeddingsBlobManifestEntry {
  key: string;
  url: string;
  updatedAt: string;
}

export type EmbeddingsBlobManifest = {
  _meta: { updatedAt: string };
  artifacts: Partial<Record<EmbeddingsArtifactId, EmbeddingsBlobManifestEntry>>;
};

type CacheEntry = { data: unknown };

const memoryCache = new Map<EmbeddingsArtifactId, CacheEntry>();
const inflightLoads = new Map<EmbeddingsArtifactId, Promise<unknown | null>>();

export function getEmbeddingsBlobKey(id: EmbeddingsArtifactId): string {
  const prefix = (process.env.EMBEDDINGS_BLOB_PREFIX ?? "embeddings").replace(/\/+$/, "");
  const base = EMBEDDINGS_ARTIFACTS[id].blobKey.replace(/^embeddings\//, "");
  return `${prefix}/${base}`;
}

export function getEmbeddingsLocalPath(id: EmbeddingsArtifactId): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), EMBEDDINGS_ARTIFACTS[id].localRelPath);
}

export function getEmbeddingsBlobManifestPath(): string {
  return path.resolve(process.cwd(), EMBEDDINGS_BLOB_MANIFEST_REL);
}

export function getBlobReadWriteToken(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? token : null;
}

export function resolveEmbeddingsStorageMode(): EmbeddingsStorageMode {
  return getBlobReadWriteToken() ? "blob" : "local";
}

function canWriteLocalCache(): boolean {
  if (process.env.VERCEL) return false;
  return true;
}

function getBlobProvider(): VercelBlobProvider | null {
  const token = getBlobReadWriteToken();
  if (!token) return null;
  return new VercelBlobProvider({ token, defaultAccess: "public" });
}

export function invalidateEmbeddingsArtifactCache(id?: EmbeddingsArtifactId): void {
  if (id) {
    memoryCache.delete(id);
    inflightLoads.delete(id);
    return;
  }
  memoryCache.clear();
  inflightLoads.clear();
}

async function readBlobManifest(): Promise<EmbeddingsBlobManifest | null> {
  try {
    const raw = await fs.readFile(getEmbeddingsBlobManifestPath(), "utf-8");
    return JSON.parse(raw) as EmbeddingsBlobManifest;
  } catch {
    return null;
  }
}

export async function writeBlobManifestEntry(
  id: EmbeddingsArtifactId,
  entry: EmbeddingsBlobManifestEntry,
): Promise<void> {
  if (!canWriteLocalCache()) return;
  const current = (await readBlobManifest()) ?? {
    _meta: { updatedAt: new Date().toISOString() },
    artifacts: {},
  };
  current.artifacts[id] = entry;
  current._meta.updatedAt = new Date().toISOString();
  const manifestPath = getEmbeddingsBlobManifestPath();
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const out = {
    $schema: "../docs/schemas/strict/embeddings-blob-manifest.schema.json",
    ...current,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(out, null, 2)}\n`, "utf-8");
}

async function loadFromLocal(id: EmbeddingsArtifactId): Promise<unknown | null> {
  const localPath = getEmbeddingsLocalPath(id);
  try {
    const raw = await fs.readFile(localPath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function loadFromBlobProvider(id: EmbeddingsArtifactId): Promise<unknown | null> {
  const provider = getBlobProvider();
  if (!provider) return null;
  try {
    const obj = await provider.get(getEmbeddingsBlobKey(id));
    if (!obj?.body) return null;
    return JSON.parse(obj.body.toString("utf-8")) as unknown;
  } catch (err) {
    console.warn(
      `[embeddings-storage] Blob get failed for ${id}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function loadFromPublicManifest(id: EmbeddingsArtifactId): Promise<unknown | null> {
  const manifest = await readBlobManifest();
  const url = manifest?.artifacts?.[id]?.url?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch (err) {
    console.warn(
      `[embeddings-storage] Public manifest fetch failed for ${id}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Load an embeddings artifact: memory → Blob API → public manifest URL → local cache.
 */
export async function loadEmbeddingsArtifact(id: EmbeddingsArtifactId): Promise<unknown | null> {
  const cached = memoryCache.get(id);
  if (cached) return cached.data;

  const existing = inflightLoads.get(id);
  if (existing) return existing;

  const loadPromise = (async (): Promise<unknown | null> => {
    let data: unknown | null = await loadFromBlobProvider(id);
    if (data == null) data = await loadFromPublicManifest(id);
    if (data == null) data = await loadFromLocal(id);
    if (data != null) memoryCache.set(id, { data });
    return data;
  })();

  inflightLoads.set(id, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inflightLoads.delete(id);
  }
}

async function saveToLocal(id: EmbeddingsArtifactId, body: string): Promise<string> {
  const localPath = getEmbeddingsLocalPath(id);
  const provider = new LocalFsProvider({ rootDir: path.dirname(localPath) });
  const stored = await provider.put(path.basename(localPath), body, {
    contentType: "application/json",
  });
  return stored.fsPath ?? localPath;
}

/**
 * Persist embeddings: Blob when token present; local cache when FS writable.
 * Updates committed URL manifest when a Blob URL is returned and FS is writable.
 */
export async function saveEmbeddingsArtifact(
  id: EmbeddingsArtifactId,
  data: unknown,
): Promise<SaveEmbeddingsResult> {
  const compactBody = JSON.stringify(data);
  const localBody =
    id === "template" ? compactBody : `${JSON.stringify(data, null, 2)}\n`;

  let blobUrl: string | undefined;
  let localPath: string | undefined;
  let storage: EmbeddingsStorageMode = "local";

  const blob = getBlobProvider();
  if (blob) {
    const put = await blob.put(getEmbeddingsBlobKey(id), compactBody, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    blobUrl = put.url ?? undefined;
    storage = "blob";
    if (blobUrl) {
      await writeBlobManifestEntry(id, {
        key: getEmbeddingsBlobKey(id),
        url: blobUrl,
        updatedAt: new Date().toISOString(),
      });
    }
  } else if (process.env.VERCEL) {
    throw new Error(
      `BLOB_READ_WRITE_TOKEN saknas — kan inte spara ${id}-embeddings på Vercel. ` +
        `Sätt token eller kör regenerate lokalt och promote till Blob.`,
    );
  }

  if (canWriteLocalCache()) {
    localPath = await saveToLocal(id, localBody);
    if (!blob) storage = "local";
  }

  memoryCache.set(id, { data });
  return { storage, blobUrl, localPath };
}

/**
 * Download Blob/public URL → local cache (for CI/prebuild/tests).
 */
export async function syncEmbeddingsArtifactFromBlob(
  id: EmbeddingsArtifactId,
): Promise<{ ok: boolean; localPath?: string; error?: string }> {
  let data: unknown | null = await loadFromBlobProvider(id);
  if (data == null) data = await loadFromPublicManifest(id);
  if (data == null) {
    return {
      ok: false,
      error: `Blob/manifest miss for ${id} (${getEmbeddingsBlobKey(id)})`,
    };
  }
  if (!canWriteLocalCache()) {
    memoryCache.set(id, { data });
    return { ok: true };
  }
  const localPath = await saveToLocal(
    id,
    id === "template" ? JSON.stringify(data) : `${JSON.stringify(data, null, 2)}\n`,
  );
  memoryCache.set(id, { data });
  return { ok: true, localPath };
}
