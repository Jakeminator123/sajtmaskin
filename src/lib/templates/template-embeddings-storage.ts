import fs from "fs/promises";
import path from "path";
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

  const pathname = getTemplateEmbeddingsBlobPath();
  const blobSdk = await import("@vercel/blob");
  const listResult = await blobSdk.list({
    token,
    prefix: pathname,
    limit: 10,
  });

  const match =
    listResult.blobs.find((blob) => blob.pathname === pathname) ||
    listResult.blobs[0];

  if (!match) return null;

  const response = await fetch(match.url, { cache: "no-store" });
  if (!response.ok) return null;

  const payload = (await response.json()) as unknown;
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
  const blobSdk = await import("@vercel/blob");
  const blob = await blobSdk.put(pathname, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    token,
  });

  return { pathname, url: blob.url };
}

export async function saveTemplateEmbeddingsToLocalFile(
  data: EmbeddingsFile,
): Promise<{ path: string }> {
  await fs.writeFile(LOCAL_PATH, JSON.stringify(data), "utf-8");
  return { path: LOCAL_PATH };
}

export function getTemplateEmbeddingsLocalPath(): string {
  return LOCAL_PATH;
}
