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
  | { kind: "replace_text"; path: string; find: string; replace: string; occurrence?: number }
  | { kind: "delete_file"; path: string };

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
 * Map a hard Fast Edit Lane failure to a user-facing message. The server
 * returns the optimistic-concurrency 409 as the bare token
 * `stale_base_version` (no readable sentence); every other decline already
 * carries a human-readable `error` from the quick-edit engine.
 */
function describeQuickEditHardError(result: { error: string; reason?: string }): string {
  if (result.error === "stale_base_version") {
    return "En nyare version finns redan. Ladda om för att fortsätta från den senaste versionen.";
  }
  // /quick-edit carries the token in `reason` ("base_busy") — `error` is the
  // English sentence (Bugbot on #507: matching on `error` never fired).
  if (result.reason === "base_busy" || result.error === "base_busy") {
    return VERSION_BUSY_USER_MESSAGE;
  }
  return result.error;
}

/**
 * Swedish user-copy for the retryable verify/repair lock (409 `version_busy`
 * from the files_json lease guard, `base_busy` from the quick-edit lane).
 * Nothing is lost — the local draft stays dirty; saving again after the
 * verification finishes succeeds.
 */
const VERSION_BUSY_USER_MESSAGE =
  "Versionen verifieras just nu — dina ändringar finns kvar lokalt. Vänta en stund och spara igen.";

/**
 * Save a single file's full content. When the Fast Edit Lane flag is on this
 * creates a minor version and patches the live preview (returns the new
 * `versionId` + preview metadata so the caller can stay no-restart).
 *
 * Fallback to the legacy in-place `PATCH /files` (which mutates the current
 * version) happens ONLY when the lane is disabled or when the quick edit
 * legitimately declined because the base is an F3/integrations version
 * (`integrations_base`). Every other quick-edit failure — unsafe_path,
 * ambiguous_match, no_match, file_not_found, no_base_files, no_change, a host
 * error, the 409 `stale_base_version`, or a network error — is surfaced as a
 * hard error so we never silently mutate the current version and break the
 * immutable-minor-version contract.
 */
export async function patchEngineChatFile(params: {
  chatId: string;
  versionId: string;
  fileName: string;
  content: string;
  /**
   * Client's notion of the newest version for this chat, forwarded to the Fast
   * Edit Lane so the server's stale-base 409 guard can fire (mirrors the
   * follow-up stream's `engineLatestKnownVersionId`). The preview panel only has
   * the active/base version in scope — not the builder's full version list
   * (`derived.latestVersionId`) — so callers pass the version they are editing.
   * That still lets the guard reject when another writer advanced the chat head
   * past this base; the trade-off vs. the stream is that deliberately editing a
   * selected older version from the code view now also re-syncs instead of
   * forking history.
   */
  engineLatestKnownVersionId?: string;
}): Promise<PatchEngineChatFileResult> {
  const { chatId, versionId, fileName, content, engineLatestKnownVersionId } = params;

  if (isQuickEditEnabled()) {
    const result = await quickEditChatFiles({
      chatId,
      baseVersionId: versionId,
      engineLatestKnownVersionId,
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
    // Only an F3/integrations base is a legitimate reason to fall through to the
    // in-place save; every other decline is a hard error returned to the caller.
    if (result.reason !== "integrations_base") {
      return { ok: false, error: describeQuickEditHardError(result) };
    }
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
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    if (!response.ok) {
      // The files_json lease guard answers 409 `version_busy` while a
      // verify/repair job holds the version — translate to honest Swedish
      // copy instead of the server's raw English sentence.
      if (data?.code === "version_busy") {
        return { ok: false, error: VERSION_BUSY_USER_MESSAGE };
      }
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
