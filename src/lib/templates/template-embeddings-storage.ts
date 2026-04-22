import path from "path";
import { LocalFsProvider } from "@/lib/storage/local-fs-provider";
import type { EmbeddingsFile } from "./template-embeddings-core";

export type TemplateEmbeddingsStorageMode = "local";
export type TemplateEmbeddingsStoragePreference = "local" | "auto";

const TEMPLATE_EMBEDDINGS_LOCAL_PATH = path.resolve(
  process.cwd(),
  "src/lib/templates/template-embeddings.json",
);

const LOCAL_FILENAME = path.basename(TEMPLATE_EMBEDDINGS_LOCAL_PATH);

export function resolveTemplateEmbeddingsStorageMode(): TemplateEmbeddingsStorageMode {
  return "local";
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

