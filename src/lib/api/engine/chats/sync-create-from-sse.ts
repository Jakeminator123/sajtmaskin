import {
  previewUrlField,
  resolveCanonicalLivePreviewUrlFromDonePayload,
  resolveCanonicalLivePreviewUrlFromPreviewReadyPayload,
} from "@/lib/api/preview-url-contract";

export type SyncLatestVersionPayload = {
  id: string | null;
  versionId: string | null;
  messageId: string | null;
  previewUrl: string | null;
  previewPending: boolean;
  releaseState: string | null;
  verificationState: string | null;
  verificationSummary: string | null;
  promotedAt: string | null;
};

function readDonePreviewPending(done: Record<string, unknown>): boolean {
  return done.previewPending === true || done.sandboxPending === true;
}

export function resolveSyncPreviewState(params: {
  done: Record<string, unknown>;
  previewReadyData?: unknown;
  hasPreviewReadyEvent: boolean;
  hasBuildErrorEvent: boolean;
}): { previewResolved: string | null; previewPending: boolean } {
  const previewReadyUrl = resolveCanonicalLivePreviewUrlFromPreviewReadyPayload(
    params.previewReadyData && typeof params.previewReadyData === "object"
      ? (params.previewReadyData as { previewUrl?: unknown })
      : null,
  );
  const previewResolved = resolveCanonicalLivePreviewUrlFromDonePayload(
    params.done as { previewUrl?: unknown; demoUrl?: unknown },
  ) ?? previewReadyUrl;
  const previewSettled =
    params.hasPreviewReadyEvent || params.hasBuildErrorEvent || Boolean(previewResolved);
  return {
    previewResolved,
    previewPending: readDonePreviewPending(params.done) && !previewSettled,
  };
}

export function buildSyncLatestVersion(params: {
  versionId: string | null;
  messageId: string | null;
  previewResolved: string | null;
  previewPending: boolean;
  releaseState?: string | null;
  verificationState?: string | null;
  verificationSummary?: string | null;
  promotedAt?: string | null;
}): SyncLatestVersionPayload | null {
  const {
    versionId,
    messageId,
    previewResolved,
    previewPending,
    releaseState = null,
    verificationState = null,
    verificationSummary = null,
    promotedAt = null,
  } = params;
  if (!versionId && !previewResolved && !messageId) return null;
  return {
    id: versionId,
    versionId,
    messageId,
    ...previewUrlField(previewResolved),
    previewPending,
    releaseState,
    verificationState,
    verificationSummary,
    promotedAt,
  };
}
