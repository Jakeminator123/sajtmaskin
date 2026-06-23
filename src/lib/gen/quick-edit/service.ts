import type { CodeFile } from "@/lib/gen/parser";
import {
  addAssistantMessageAndCreateDraftVersion,
  updateVersionPreviewUrl,
  type Version,
} from "@/lib/db/chat-repository-pg";
import {
  startPreviewSession,
  tryPatchPreviewSession,
} from "@/lib/gen/preview/preview-session";
import { isStructuralQuickEditPath } from "./guards";
import { applyQuickEdits } from "./apply";
import type { QuickEditFailureReason, QuickEditOp } from "./types";

export type QuickEditPreviewMode = "patched" | "restarted" | "booted" | "recreated" | "resumed";

export type RunQuickEditResult =
  | {
      ok: true;
      versionId: string;
      messageId: string;
      changedPaths: string[];
      structuralChange: boolean;
      previewUrl: string | null;
      previewSessionId: string | null;
      previewMode: QuickEditPreviewMode | null;
      previewError: string | null;
    }
  | {
      ok: false;
      reason: QuickEditFailureReason;
      message: string;
    };

function summarizeChange(changedPaths: string[], explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  if (changedPaths.length === 1) {
    return `Direktändring: ${changedPaths[0]} uppdaterad.`;
  }
  return `Direktändring: ${changedPaths.length} filer uppdaterade.`;
}

/**
 * Fast Edit Lane core: apply deterministic edits to a base version, persist a
 * new minor (quick_edit) version, and push the change to the live preview as a
 * partial patch (no restart when possible), falling back to a full preview
 * (re)start when the patch lane is off or there is no live session.
 *
 * No LLM. No scaffold rebuild. The new version is immutable; the parent is the
 * major version (a quick_edit base resolves to its own parent so all minors of
 * a major are grouped together).
 */
export async function runQuickEdit(params: {
  chatId: string;
  baseVersion: Version;
  baseFiles: CodeFile[];
  ops: QuickEditOp[];
  appProjectId: string | null;
  summary?: string;
}): Promise<RunQuickEditResult> {
  const { baseVersion } = params;

  // F3 (integrations) versions go through server verification before they can be
  // a deploy target. A quick edit never schedules that, so a quick_edit row on an
  // integrations base would sit "Verifierar" until the readiness watchdog fails
  // it. Decline here so the caller falls back to the normal flow (in-place save /
  // full generation) which keeps F3 verification semantics intact.
  if (baseVersion.lifecycle_stage === "integrations") {
    return {
      ok: false,
      reason: "integrations_base",
      message: "Quick edit is not supported on an F3/integrations version.",
    };
  }

  const applied = applyQuickEdits(params.baseFiles, params.ops);
  if (!applied.ok) {
    return { ok: false, reason: applied.reason, message: applied.message };
  }

  const parentVersionId =
    baseVersion.edit_kind === "quick_edit" && baseVersion.parent_version_id
      ? baseVersion.parent_version_id
      : baseVersion.id;
  // Integrations bases are declined above, so a quick-edit child is always a
  // design-stage minor version.
  const lifecycleStage: "design" | "integrations" = "design";

  const filesJson = JSON.stringify(applied.files);
  const persisted = await addAssistantMessageAndCreateDraftVersion(
    params.chatId,
    summarizeChange(applied.changedPaths, params.summary),
    filesJson,
    {
      editKind: "quick_edit",
      parentVersionId,
      lifecycleStage,
    },
  );

  const newVersionId = persisted.version.id;
  const structuralChange = applied.changedPaths.some(isStructuralQuickEditPath);

  const changedFiles: Record<string, string> = {};
  const contentByPath = new Map(applied.files.map((f) => [f.path, f.content]));
  for (const changedPath of applied.changedPaths) {
    const content = contentByPath.get(changedPath);
    if (typeof content === "string") {
      changedFiles[changedPath] = content;
    }
  }

  let previewUrl: string | null = null;
  let previewSessionId: string | null = null;
  let previewMode: QuickEditPreviewMode | null = null;
  let previewError: string | null = null;

  const patch = await tryPatchPreviewSession({
    chatId: params.chatId,
    versionId: newVersionId,
    expectedBaseVersionId: baseVersion.id,
    changedFiles,
  });

  if (patch.ok) {
    previewUrl = patch.previewUrl;
    previewSessionId = patch.previewSessionId;
    previewMode = patch.patchMode;
  } else {
    // Patch lane disabled or no live session to patch — (re)create a full
    // preview for the new version so the user still sees the change.
    const started = await startPreviewSession(applied.files, {
      chatId: params.chatId,
      appProjectId: params.appProjectId,
      versionIdForSession: newVersionId,
      lifecycleStage,
      skipRepair: true,
      skipProjectScaffold: true,
    });
    if (started.ok) {
      previewUrl = started.result.previewUrl;
      previewSessionId = started.result.previewSessionId;
      previewMode = started.result.startOutcome;
    } else {
      previewError = started.error.message;
    }
  }

  if (previewUrl && previewUrl.trim()) {
    await updateVersionPreviewUrl(newVersionId, previewUrl).catch(() => null);
  }

  return {
    ok: true,
    versionId: newVersionId,
    messageId: persisted.message.id,
    changedPaths: applied.changedPaths,
    structuralChange,
    previewUrl,
    previewSessionId,
    previewMode,
    previewError,
  };
}
