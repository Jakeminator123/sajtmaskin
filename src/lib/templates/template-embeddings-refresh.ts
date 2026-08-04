import { SECRETS } from "@/lib/config";
import {
  generateTemplateEmbeddings,
  type EmbeddingsFile,
} from "./template-embeddings-core";
import {
  saveTemplateEmbeddingsToLocalFile,
} from "./template-embeddings-storage";
import { invalidateEmbeddingsCache } from "./template-search";

export interface RegenerateTemplateEmbeddingsOptions {
  apiKey?: string;
  dryRun?: boolean;
}

export interface RegenerateTemplateEmbeddingsResult {
  storage: "local";
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
  const generated = await generateTemplateEmbeddings({ apiKey });

  if (options.dryRun) {
    return {
      storage: "local",
      generated,
      persisted: false,
      elapsedMs: Date.now() - startedAt,
    };
  }

  if (process.env.VERCEL) {
    throw new Error(
      "Template embeddings kan inte skrivas fran en deployad miljo. Regenerera lokalt (npm run templates:embeddings), ladda upp filen till Vercel Blob och peka TEMPLATE_EMBEDDINGS_BLOB_URL dit.",
    );
  }

  const saved = await saveTemplateEmbeddingsToLocalFile(generated);
  invalidateEmbeddingsCache();
  return {
    storage: "local",
    generated,
    persisted: true,
    persistedTo: saved.path,
    elapsedMs: Date.now() - startedAt,
  };
}
