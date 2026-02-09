import { v0 } from "@/lib/v0";

type ResolveVersionFilesOptions = {
  maxAttempts?: number;
  delayMs?: number;
  minFiles?: number;
  includeDefaultFiles?: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function resolveVersionFiles(params: {
  chatId: string;
  versionId: string;
  options?: ResolveVersionFilesOptions;
}): Promise<{
  version: unknown | null;
  files: Array<{ name: string; content?: string | null; locked?: boolean }>;
  attempts: number;
  resolved: boolean;
  errorMessage: string | null;
}> {
  const { chatId, versionId, options } = params;
  const maxAttempts = options?.maxAttempts ?? 16;
  const baseDelayMs = options?.delayMs ?? 1500;
  const minFiles = options?.minFiles ?? 1;
  const includeDefaultFiles = options?.includeDefaultFiles ?? true;

  let lastVersion: unknown | null = null;
  let lastFiles: Array<{ name: string; content?: string | null; locked?: boolean }> = [];
  let errorMessage: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const version = await v0.chats.getVersion({
        chatId,
        versionId,
        includeDefaultFiles,
      });
      lastVersion = version;
      const files = ((version as any)?.files || []) as Array<{
        name: string;
        content?: string | null;
        locked?: boolean;
      }>;
      lastFiles = files;
      errorMessage = null;

      if (files.length >= minFiles) {
        return {
          version,
          files,
          attempts: attempt + 1,
          resolved: true,
          errorMessage: null,
        };
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (attempt >= maxAttempts - 1) break;
    }

    if (attempt < maxAttempts - 1) {
      const backoff = Math.min(baseDelayMs * Math.pow(1.2, attempt), 6000);
      await sleep(backoff);
    }
  }

  return {
    version: lastVersion,
    files: lastFiles,
    attempts: maxAttempts,
    resolved: false,
    errorMessage,
  };
}
