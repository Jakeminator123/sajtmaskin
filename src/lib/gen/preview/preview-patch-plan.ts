import { createHash } from "node:crypto";

import { isStructuralQuickEditPath } from "@/lib/gen/quick-edit/guards";

/**
 * Fast Edit Lane planning for a follow-up version.
 *
 * A follow-up used to always push the whole runtime file set to
 * `POST /preview/session/update`, which makes preview-host restart Next dev and
 * pay a first-compile even when only page content changed. When the app can
 * prove exactly which paths differ from what the VM already holds, the same
 * change fits in `POST /preview/session/patch` (hot file write, no restart).
 *
 * "What the VM already holds" comes from the host's own content-hash manifest
 * (`fetchPreviewHostFilesManifest`), so the plan is a diff against real host
 * state — not against a locally recomputed guess of the previous payload.
 *
 * Every rejection reason below means "do the full update instead". The lane is
 * a pure optimisation: falling back is always correct, patching is only allowed
 * when it provably produces the same file set as the update would.
 */

/** Host limits are 500 files / 12 MB; stay well under and let big rewrites restart. */
export const PREVIEW_PATCH_MAX_FILES = 200;
export const PREVIEW_PATCH_MAX_BYTES = 4 * 1024 * 1024;

export type PreviewPatchRejectReason =
  /** Host manifest was empty — nothing trustworthy to diff against. */
  | "empty_host_manifest"
  /** New version is byte-identical to what is live; nothing to patch. */
  | "no_changes"
  /**
   * A dependency/config path changed (`package.json`, lockfiles, `next.config.*`,
   * `tsconfig*.json`, `.env*`, postcss/tailwind config). The host would restart
   * anyway, and update's fingerprint/install logic is the battle-tested path.
   */
  | "structural_change"
  /** Diff is too large to be worth a partial payload (or would risk host limits). */
  | "diff_too_large";

export type PreviewPatchPlan =
  | {
      ok: true;
      /** Only the paths whose content differs from the host's (or are new). */
      changedFiles: Record<string, string>;
      /** Paths the host still holds that the new version no longer contains. */
      removedPaths: string[];
      changedBytes: number;
    }
  | { ok: false; reason: PreviewPatchRejectReason };

/** sha256 hex of a UTF-8 file body — must match preview-host's manifest hashing. */
export function hashPreviewFileContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Diff the runtime payload a full `/update` would have sent against the host's
 * current file manifest and decide whether the patch lane can carry it.
 *
 * `nextFiles` must be the exact payload the update path built (same bytes), so
 * an accepted plan is a strict subset of the update: apply `changedFiles` and
 * drop `removedPaths` on top of the host's set and you land on `nextFiles`.
 */
export function planPreviewPatch(params: {
  hostFileHashes: Record<string, string>;
  nextFiles: Record<string, string>;
  maxFiles?: number;
  maxBytes?: number;
}): PreviewPatchPlan {
  const { hostFileHashes, nextFiles } = params;
  const maxFiles = params.maxFiles ?? PREVIEW_PATCH_MAX_FILES;
  const maxBytes = params.maxBytes ?? PREVIEW_PATCH_MAX_BYTES;

  const hostPaths = Object.keys(hostFileHashes);
  if (hostPaths.length === 0) {
    return { ok: false, reason: "empty_host_manifest" };
  }

  const changedFiles: Record<string, string> = {};
  let changedBytes = 0;
  for (const [path, content] of Object.entries(nextFiles)) {
    const hostHash = hostFileHashes[path];
    if (hostHash && hostHash === hashPreviewFileContent(content)) continue;
    changedFiles[path] = content;
    changedBytes += Buffer.byteLength(content, "utf8");
  }

  const removedPaths = hostPaths.filter((path) => !(path in nextFiles));

  const touchedPaths = [...Object.keys(changedFiles), ...removedPaths];
  if (touchedPaths.length === 0) {
    return { ok: false, reason: "no_changes" };
  }
  if (touchedPaths.some(isStructuralQuickEditPath)) {
    return { ok: false, reason: "structural_change" };
  }
  if (touchedPaths.length > maxFiles || changedBytes > maxBytes) {
    return { ok: false, reason: "diff_too_large" };
  }

  return { ok: true, changedFiles, removedPaths, changedBytes };
}
