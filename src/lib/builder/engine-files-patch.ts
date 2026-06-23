import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/**
 * Fast Edit Lane (client). Default OFF — opt-in via
 * `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT`. When on, exact file edits from the code
 * view / file tree / inspector create a minor version and patch the live
 * preview VM without a full rebuild. When off, `patchEngineChatFile` keeps
 * today's in-place `PATCH /files` behaviour (mutates the current version).
 */
export function isQuickEditEnabled(): boolean {
  const raw = sanitizeEnvString(process.env.NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT)?.toLowerCase();
  return raw ? isAffirmativeEnvValue(raw) : false;
}

export type QuickEditClientOp =
  | { kind: "replace_content"; path: string; content: string }
  | { kind: "replace_text"; path: string; find: string; replace: string; occurrence?: number };

export type QuickEditClientResult =
  | {
      ok: true;
      versionId: string;
      changedFiles: string[];
      previewUrl: string | null;
      previewSessionId: string | null;
      previewMode: string | null;
    }
  | { ok: false; error: string; reason?: string };

/**
 * Shared Fast Edit Lane entrypoint. Both prompt-free tool surfaces (code view,
 * file tree, inspector inline edits) go through this single client so there is
 * exactly one patch engine.
 */
export async function quickEditChatFiles(params: {
  chatId: string;
  baseVersionId?: string;
  engineLatestKnownVersionId?: string;
  ops: QuickEditClientOp[];
  summary?: string;
}): Promise<QuickEditClientResult> {
  const { chatId, baseVersionId, engineLatestKnownVersionId, ops, summary } = params;
  try {
    const response = await fetch(`${engineChatBaseUrl(chatId)}/quick-edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(baseVersionId ? { baseVersionId } : {}),
        ...(engineLatestKnownVersionId ? { engineLatestKnownVersionId } : {}),
        ...(summary ? { summary } : {}),
        ops,
      }),
    });
    const data = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          versionId?: string;
          changedFiles?: string[];
          previewUrl?: string | null;
          previewSessionId?: string | null;
          previewMode?: string | null;
          error?: string;
          reason?: string;
        }
      | null;
    if (!response.ok || !data?.ok || !data.versionId) {
      return {
        ok: false,
        error: data?.error || `HTTP ${response.status}`,
        reason: data?.reason,
      };
    }
    return {
      ok: true,
      versionId: data.versionId,
      changedFiles: Array.isArray(data.changedFiles) ? data.changedFiles : [],
      previewUrl: data.previewUrl ?? null,
      previewSessionId: data.previewSessionId ?? null,
      previewMode: data.previewMode ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Nätverksfel vid snabbredigering",
    };
  }
}

export type PatchEngineChatFileResult =
  | {
      ok: true;
      /** New minor version id when the Fast Edit Lane created one; absent for in-place saves. */
      versionId?: string;
      previewUrl?: string | null;
      previewSessionId?: string | null;
      previewMode?: string | null;
    }
  | { ok: false; error: string };

/**
 * Save a single file's full content. When the Fast Edit Lane flag is on this
 * creates a minor version and patches the live preview (returns the new
 * `versionId` + preview metadata so the caller can stay no-restart); otherwise
 * (or when quick-edit declines, e.g. F3 base) it mutates the current version in
 * place via `PATCH /files` (today's behaviour).
 */
export async function patchEngineChatFile(params: {
  chatId: string;
  versionId: string;
  fileName: string;
  content: string;
}): Promise<PatchEngineChatFileResult> {
  const { chatId, versionId, fileName, content } = params;

  if (isQuickEditEnabled()) {
    const result = await quickEditChatFiles({
      chatId,
      baseVersionId: versionId,
      ops: [{ kind: "replace_content", path: fileName, content }],
    });
    if (result.ok) {
      return {
        ok: true,
        versionId: result.versionId,
        previewUrl: result.previewUrl,
        previewSessionId: result.previewSessionId,
        previewMode: result.previewMode,
      };
    }
    // Quick edit declined (e.g. F3/integrations base, stale base, no change) —
    // fall through to the in-place save so the edit still persists like today.
  }

  try {
    const response = await fetch(`${engineChatBaseUrl(chatId)}/files`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId,
        fileName,
        content,
      }),
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      return { ok: false, error: data?.error || `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Nätverksfel vid spar",
    };
  }
}
