import path from "path";
import { LocalFsProvider } from "@/lib/storage/local-fs-provider";
import { VercelBlobProvider } from "@/lib/storage/vercel-blob-provider";
import type { EmbeddingsFile } from "./template-embeddings-core";

export type TemplateEmbeddingsStorageMode = "local" | "blob";
export type TemplateEmbeddingsStoragePreference =
  | TemplateEmbeddingsStorageMode
  | "auto";

const DEFAULT_BLOB_PATH = "templates/template-embeddings.json";
const LOCAL_PATH = path.resolve(
  process.cwd(),
  "src/lib/templates/template-embeddings.json",
);
const LOCAL_FILENAME = path.basename(LOCAL_PATH);

function getBlobToken(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token || null;
}

function normalizePreference(
  value: string | undefined,
): TemplateEmbeddingsStoragePreference {
  const raw = value?.trim().toLowerCase();
  if (raw === "blob") return "blob";
  if (raw === "local") return "local";
  return "auto";
}

export function getTemplateEmbeddingsBlobPath(): string {
  const key = process.env.TEMPLATE_EMBEDDINGS_BLOB_KEY?.trim();
  return key || DEFAULT_BLOB_PATH;
}

export function resolveTemplateEmbeddingsStorageMode(
  preference?: TemplateEmbeddingsStoragePreference,
): TemplateEmbeddingsStorageMode {
  const desired =
    preference ??
    normalizePreference(process.env.TEMPLATE_EMBEDDINGS_STORAGE) ??
    "auto";
  const hasBlob = Boolean(getBlobToken());

  if (desired === "blob") return hasBlob ? "blob" : "local";
  if (desired === "local") return "local";
  return hasBlob ? "blob" : "local";
}

function isEmbeddingsFile(payload: unknown): payload is EmbeddingsFile {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as EmbeddingsFile;
  return (
    Boolean(candidate._meta) &&
    Array.isArray(candidate.embeddings) &&
    candidate.embeddings.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        Array.isArray(entry.embedding),
    )
  );
}

export async function loadTemplateEmbeddingsFromBlob(): Promise<EmbeddingsFile | null> {
  const token = getBlobToken();
  if (!token) return null;

  const provider = new VercelBlobProvider({ token });
  const stored = await provider.get(getTemplateEmbeddingsBlobPath());
  if (!stored) return null;

  const payload = JSON.parse(stored.body.toString("utf-8")) as unknown;
  if (!isEmbeddingsFile(payload)) return null;

  return payload;
}

export async function saveTemplateEmbeddingsToBlob(
  data: EmbeddingsFile,
): Promise<{ pathname: string; url: string }> {
  const token = getBlobToken();
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for blob storage.");
  }

  const pathname = getTemplateEmbeddingsBlobPath();
  const provider = new VercelBlobProvider({ token });
  const stored = await provider.put(pathname, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  if (!stored.url) {
    throw new Error("Blob storage did not return a public URL for template embeddings.");
  }

  return { pathname: stored.pathname, url: stored.url };
}

export async function saveTemplateEmbeddingsToLocalFile(
  data: EmbeddingsFile,
): Promise<{ path: string }> {
  const provider = new LocalFsProvider({ rootDir: path.dirname(LOCAL_PATH) });
  const stored = await provider.put(LOCAL_FILENAME, JSON.stringify(data), {
    contentType: "application/json",
  });
  return { path: stored.fsPath ?? LOCAL_PATH };
}

export function getTemplateEmbeddingsLocalPath(): string {
  return LOCAL_PATH;
}
