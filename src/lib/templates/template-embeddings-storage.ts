import { readFile } from "fs/promises";
import path from "path";
import { getServerEnv } from "@/lib/env";
import { LocalFsProvider } from "@/lib/storage/local-fs-provider";
import type { EmbeddingsFile } from "./template-embeddings-core";

/**
 * Single owner of "where do the template embeddings live".
 *
 * The file is ~9 MiB, so it must never be `require()`d into the server bundle.
 * Every reader goes through `loadTemplateEmbeddings()`: a deployed runtime
 * fetches the Blob copy, local dev reads the committed file from disk.
 */
export type TemplateEmbeddingsStorageMode = "local" | "blob";
export type TemplateEmbeddingsStoragePreference = "local" | "auto";

const TEMPLATE_EMBEDDINGS_BLOB_URL_ENV_KEY = "TEMPLATE_EMBEDDINGS_BLOB_URL";

export const TEMPLATE_EMBEDDINGS_LOCAL_PATH = path.resolve(
  process.cwd(),
  "src/lib/templates/template-embeddings.json",
);

const LOCAL_FILENAME = path.basename(TEMPLATE_EMBEDDINGS_LOCAL_PATH);

export interface LoadedTemplateEmbeddings {
  data: EmbeddingsFile;
  mode: TemplateEmbeddingsStorageMode;
  /** Blob read URL or absolute fs path. Safe to log — the read URL is public. */
  location: string;
}

function isDeployedRuntime(): boolean {
  const env = getServerEnv();
  return Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV);
}

function getTemplateEmbeddingsBlobUrl(): string | undefined {
  return getServerEnv().TEMPLATE_EMBEDDINGS_BLOB_URL;
}

export function resolveTemplateEmbeddingsStorageMode(
  preference: TemplateEmbeddingsStoragePreference = "auto",
): TemplateEmbeddingsStorageMode {
  if (preference === "local") return "local";
  return isDeployedRuntime() ? "blob" : "local";
}

function parseEmbeddingsFile(value: unknown, location: string): EmbeddingsFile {
  const file = value as EmbeddingsFile | null;
  if (!file || typeof file !== "object" || !Array.isArray(file.embeddings)) {
    throw new Error(`Template embeddings har ogiltigt format (ingen embeddings-array): ${location}`);
  }
  return file;
}

/**
 * Read the embeddings from the storage the current runtime owns.
 * Throws with a source-specific message — callers must degrade visibly
 * (see `fallbackKeywordSearch` in template-search.ts), never silently.
 */
export async function loadTemplateEmbeddings(
  preference: TemplateEmbeddingsStoragePreference = "auto",
): Promise<LoadedTemplateEmbeddings> {
  const mode = resolveTemplateEmbeddingsStorageMode(preference);

  if (mode === "blob") {
    const url = getTemplateEmbeddingsBlobUrl();
    if (!url) {
      throw new Error(
        `Template embeddings saknar läs-URL i deployad miljö: sätt ${TEMPLATE_EMBEDDINGS_BLOB_URL_ENV_KEY} till den publika Blob-URL:en.`,
      );
    }
    // no-store: the payload is far above Next.js data-cache limits and the
    // in-process cache in template-search.ts already covers repeat reads.
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `Blob-hämtning av template embeddings misslyckades: HTTP ${response.status} (${url})`,
      );
    }
    return { data: parseEmbeddingsFile(await response.json(), url), mode, location: url };
  }

  const raw = await readFile(TEMPLATE_EMBEDDINGS_LOCAL_PATH, "utf8");
  return {
    data: parseEmbeddingsFile(JSON.parse(raw), TEMPLATE_EMBEDDINGS_LOCAL_PATH),
    mode,
    location: TEMPLATE_EMBEDDINGS_LOCAL_PATH,
  };
}

export async function saveTemplateEmbeddingsToLocalFile(
  data: EmbeddingsFile,
): Promise<{ path: string }> {
  const provider = new LocalFsProvider({ rootDir: path.dirname(TEMPLATE_EMBEDDINGS_LOCAL_PATH) });
  const stored = await provider.put(LOCAL_FILENAME, JSON.stringify(data), {
    contentType: "application/json",
  });
  return { path: stored.fsPath ?? TEMPLATE_EMBEDDINGS_LOCAL_PATH };
}
