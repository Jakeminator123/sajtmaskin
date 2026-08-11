import {
  getEmbeddingsLocalPath,
  loadEmbeddingsArtifact,
  resolveEmbeddingsStorageMode,
  saveEmbeddingsArtifact,
  type EmbeddingsStorageMode,
  type SaveEmbeddingsResult,
} from "@/lib/gen/embeddings/embeddings-storage";
import type { EmbeddingsFile } from "./template-embeddings-core";

/** @deprecated Prefer resolveEmbeddingsStorageMode from embeddings-storage. */
export type TemplateEmbeddingsStorageMode = EmbeddingsStorageMode;
/** Remnant preference type kept for call-site compatibility. */
export type TemplateEmbeddingsStoragePreference = "local" | "auto" | "blob";

export function resolveTemplateEmbeddingsStorageMode(): EmbeddingsStorageMode {
  return resolveEmbeddingsStorageMode();
}

export async function loadTemplateEmbeddingsFile(): Promise<EmbeddingsFile | null> {
  const data = await loadEmbeddingsArtifact("template");
  if (!data || typeof data !== "object") return null;
  return data as EmbeddingsFile;
}

export async function saveTemplateEmbeddingsToLocalFile(
  data: EmbeddingsFile,
): Promise<{ path: string }> {
  const saved = await saveEmbeddingsArtifact("template", data);
  return { path: saved.localPath ?? getEmbeddingsLocalPath("template") };
}

export async function saveTemplateEmbeddings(
  data: EmbeddingsFile,
): Promise<SaveEmbeddingsResult> {
  return saveEmbeddingsArtifact("template", data);
}
