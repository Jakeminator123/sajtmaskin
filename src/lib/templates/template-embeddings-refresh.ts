import { SECRETS } from "@/lib/config";
import {
  invalidateEmbeddingsArtifactCache,
} from "@/lib/gen/embeddings/embeddings-storage";
import {
  generateTemplateEmbeddings,
  type EmbeddingsFile,
} from "./template-embeddings-core";
import {
  resolveTemplateEmbeddingsStorageMode,
  saveTemplateEmbeddings,
} from "./template-embeddings-storage";
import { invalidateEmbeddingsCache } from "./template-search";

export interface RegenerateTemplateEmbeddingsOptions {
  apiKey?: string;
  dryRun?: boolean;
}

export interface RegenerateTemplateEmbeddingsResult {
  storage: "blob" | "local";
  generated: EmbeddingsFile;
  persisted: boolean;
  persistedTo?: string;
  blobUrl?: string;
  elapsedMs: number;
}

export async function regenerateTemplateEmbeddings(
  options: RegenerateTemplateEmbeddingsOptions = {},
): Promise<RegenerateTemplateEmbeddingsResult> {
  const apiKey = options.apiKey ?? SECRETS.openaiApiKey;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY saknas.");
  }

  const startedAt = Date.now();
  const generated = await generateTemplateEmbeddings({ apiKey });
  const storageMode = resolveTemplateEmbeddingsStorageMode();

  if (options.dryRun) {
    return {
      storage: storageMode,
      generated,
      persisted: false,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const saved = await saveTemplateEmbeddings(generated);
  invalidateEmbeddingsCache();
  invalidateEmbeddingsArtifactCache("template");
  return {
    storage: saved.storage,
    generated,
    persisted: true,
    persistedTo: saved.blobUrl ?? saved.localPath,
    blobUrl: saved.blobUrl,
    elapsedMs: Date.now() - startedAt,
  };
}
