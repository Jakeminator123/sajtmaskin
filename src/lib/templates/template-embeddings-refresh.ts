import { SECRETS } from "@/lib/config";
import {
  generateTemplateEmbeddings,
  type EmbeddingsFile,
} from "./template-embeddings-core";
import {
  resolveTemplateEmbeddingsStorageMode,
  saveTemplateEmbeddingsToBlob,
  saveTemplateEmbeddingsToLocalFile,
  type TemplateEmbeddingsStoragePreference,
} from "./template-embeddings-storage";
import { invalidateEmbeddingsCache } from "./template-search";

export interface RegenerateTemplateEmbeddingsOptions {
  apiKey?: string;
  storagePreference?: TemplateEmbeddingsStoragePreference;
  dryRun?: boolean;
}

export interface RegenerateTemplateEmbeddingsResult {
  storage: "blob" | "local";
  generated: EmbeddingsFile;
  persisted: boolean;
  persistedTo?: string;
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
  const storage = resolveTemplateEmbeddingsStorageMode(options.storagePreference);
  const generated = await generateTemplateEmbeddings({ apiKey });

  if (options.dryRun) {
    return {
      storage,
      generated,
      persisted: false,
      elapsedMs: Date.now() - startedAt,
    };
  }

  if (storage === "blob") {
    const saved = await saveTemplateEmbeddingsToBlob(generated);
    invalidateEmbeddingsCache();
    return {
      storage,
      generated,
      persisted: true,
      persistedTo: saved.pathname,
      elapsedMs: Date.now() - startedAt,
    };
  }

  if (process.env.VERCEL) {
    throw new Error(
      "Lokal lagring fungerar inte pa Vercel. Satt BLOB_READ_WRITE_TOKEN och TEMPLATE_EMBEDDINGS_STORAGE=blob.",
    );
  }

  const saved = await saveTemplateEmbeddingsToLocalFile(generated);
  invalidateEmbeddingsCache();
  return {
    storage,
    generated,
    persisted: true,
    persistedTo: saved.path,
    elapsedMs: Date.now() - startedAt,
  };
}
