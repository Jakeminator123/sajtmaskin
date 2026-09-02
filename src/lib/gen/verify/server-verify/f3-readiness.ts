import { getChat } from "@/lib/db/chat-repository-pg";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import type { CodeFile } from "@/lib/gen/parser";
import {
  checkTier3ReadinessForVersion,
  md5FilesRevision,
  serverOwnedF3ReadinessParams,
  type Tier3ReadinessResult,
} from "@/lib/gen/verify/tier3-readiness";
import type { ProductPostcheckPreviewProbe } from "@/lib/gen/verify/product-postcheck-preview-wait";

export type ServerVerifyF3ReadinessContext = {
  orchestrationSnapshot: unknown;
  projectId: string | null;
};

export async function loadServerVerifyF3ReadinessContext(
  chatId: string,
): Promise<ServerVerifyF3ReadinessContext | { error: "readiness_unavailable" }> {
  try {
    const chat = await getChat(chatId);
    return {
      orchestrationSnapshot: chat?.orchestration_snapshot ?? null,
      projectId: chat?.project_id ?? null,
    };
  } catch (err) {
    console.warn("[server-verify] F3 readiness chat read failed:", err);
    return { error: "readiness_unavailable" };
  }
}

export async function evaluateServerOwnedF3Readiness(params: {
  chatId: string;
  versionId: string;
  parentVersionId: string | null;
  filesRevision: string | null;
  preloadedFiles: CodeFile[] | null;
  orchestrationSnapshot: unknown;
  projectId: string | null;
  previewIdentity?: ProductPostcheckPreviewProbe | null;
}): Promise<Tier3ReadinessResult> {
  return checkTier3ReadinessForVersion(serverOwnedF3ReadinessParams(params));
}

export function resolveSnapshotFilesRevision(params: {
  filesRevision?: string | null;
  filesJson: string;
}): string {
  const fromRow = params.filesRevision?.trim();
  return fromRow || md5FilesRevision(params.filesJson);
}

export async function persistF3ReadinessHold(params: {
  chatId: string;
  versionId: string;
  filesRevision: string;
  result: Extract<Tier3ReadinessResult, { ready: false }>;
  at: "before_first_gate" | "after_repair" | "before_promotion";
}): Promise<void> {
  await createEngineVersionErrorLogs([
    {
      chatId: params.chatId,
      versionId: params.versionId,
      level: params.result.retryable ? "warning" : "error",
      category: "server-verify:f3-readiness",
      message: `F3 readiness blocked (${params.result.reason}) at ${params.at}.`,
      meta: {
        serverOwned: true,
        reason: params.result.reason,
        retryable: params.result.retryable,
        verdict: "verdict" in params.result ? params.result.verdict : undefined,
        filesRevision: params.filesRevision,
        at: params.at,
      },
    },
  ]).catch(() => null);
}
