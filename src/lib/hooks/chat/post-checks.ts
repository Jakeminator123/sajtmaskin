import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { parseRetryAfterMs } from "@/lib/builder/preview-bootstrap-retry";
import type { VersionErrorLogPayload } from "./types";
import type {
  ProductPostcheckAttestation,
  ProductPostcheckResult,
} from "@/lib/gen/verify/product-postcheck";

const ERROR_LOG_RETRY_ATTEMPTS = 2;
const ERROR_LOG_RETRY_FALLBACK_MS = 1_000;
const ERROR_LOG_RETRY_MAX_MS = 5_000;

/** Best-effort diagnostic persistence, also used by explicit deploy repair. */
export async function persistVersionErrorLogs(params: {
  chatId: string;
  versionId: string;
  logs: VersionErrorLogPayload[];
  productPostcheckAttestation?: ProductPostcheckAttestation | null;
  storageReceipt?: ProductPostcheckResult["storageReceipt"] | null;
  expectedFilesRevision?: string | null;
}): Promise<boolean> {
  const { chatId, versionId, logs, productPostcheckAttestation, storageReceipt, expectedFilesRevision } = params;
  if (!logs.length) return true;
  const url = `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`;
  const productPostcheckLogs = logs.filter((log) =>
    log.category?.startsWith("product_postcheck."),
  );
  const plainLogs = logs.filter(log => !log.category?.startsWith("product_postcheck."));
  // Ordinary diagnostics are independent of the product's server receipt.
  // Never put them in the attested compatibility-replay request.
  const diagnosticsStored = plainLogs.length ? await postErrorLogBatch(url, plainLogs, null) : true;
  if (!productPostcheckLogs.length) return diagnosticsStored;
  if (storageReceipt?.status === "stored" && storageReceipt.versionId === versionId &&
      typeof storageReceipt.filesRevision === "string" && storageReceipt.filesRevision.trim() &&
      (!expectedFilesRevision || storageReceipt.filesRevision === expectedFilesRevision) &&
      (!productPostcheckAttestation || storageReceipt.filesRevision === productPostcheckAttestation.filesRevision)) {
    return diagnosticsStored; // Acknowledge the server write; send no product payload.
  }
  if (!productPostcheckAttestation) return false;
  const productStored = await postErrorLogBatch(url, [], productPostcheckAttestation);
  return diagnosticsStored && productStored;
}

async function postErrorLogBatch(
  url: string,
  logs: VersionErrorLogPayload[],
  productPostcheckAttestation: ProductPostcheckAttestation | null,
): Promise<boolean> {
  for (let attempt = 0; attempt <= ERROR_LOG_RETRY_ATTEMPTS; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logs,
          ...(productPostcheckAttestation
            ? { productPostcheckAttestation }
            : {}),
        }),
      });
    } catch {
      // Best-effort only
      return false;
    }
    if (res.ok) return true;
    if (res.status !== 503 || attempt === ERROR_LOG_RETRY_ATTEMPTS) return false;
    const waitMs = Math.min(
      parseRetryAfterMs(res.headers, ERROR_LOG_RETRY_FALLBACK_MS),
      ERROR_LOG_RETRY_MAX_MS,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return false;
}
