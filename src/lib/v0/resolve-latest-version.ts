import { v0 } from "@/lib/v0";

type LatestVersionResult = {
  latestChat: unknown | null;
  versionId: string | null;
  demoUrl: string | null;
  status: string | null;
  errorMessage: string | null;
};

type ResolveLatestVersionOptions = {
  maxAttempts?: number;
  delayMs?: number;
  preferVersionId?: string | null;
  preferDemoUrl?: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractLatestVersion(chat: any): {
  versionId: string | null;
  demoUrl: string | null;
  status: string | null;
} {
  if (!chat || typeof chat !== "object") {
    return { versionId: null, demoUrl: null, status: null };
  }
  const latestVersion = chat.latestVersion || null;
  const versionId =
    (latestVersion && (latestVersion.id || latestVersion.versionId)) || chat.versionId || null;
  const demoUrl =
    (latestVersion && (latestVersion.demoUrl || latestVersion.demo_url)) || chat.demoUrl || null;
  const status = (latestVersion && latestVersion.status) || chat.status || null;
  return {
    versionId: typeof versionId === "string" && versionId.trim() ? versionId : null,
    demoUrl: typeof demoUrl === "string" && demoUrl.trim() ? demoUrl : null,
    status: typeof status === "string" && status.trim() ? status : null,
  };
}

export async function resolveLatestVersion(
  chatId: string,
  options: ResolveLatestVersionOptions = {},
): Promise<LatestVersionResult> {
  const maxAttempts = options.maxAttempts ?? 12;
  const baseDelayMs = options.delayMs ?? 2000;
  let versionId = options.preferVersionId ?? null;
  let demoUrl = options.preferDemoUrl ?? null;
  let status: string | null = null;
  let latestChat: unknown | null = null;
  let errorMessage: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      latestChat = await v0.chats.getById({ chatId });
      const extracted = extractLatestVersion(latestChat as any);
      if (extracted.versionId) versionId = extracted.versionId;
      if (extracted.demoUrl) demoUrl = extracted.demoUrl;
      if (extracted.status) status = extracted.status;
      errorMessage = null;

      if (versionId && demoUrl) break;
      if (status === "failed") break;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (attempt >= maxAttempts - 1) break;
    }

    if (attempt < maxAttempts - 1) {
      const backoff = Math.min(baseDelayMs * Math.pow(1.35, attempt), 8000);
      await sleep(backoff);
    }
  }

  return { latestChat, versionId, demoUrl, status, errorMessage };
}
