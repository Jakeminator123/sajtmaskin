import {
  getPreferredVersion,
  getLatestVersion,
  getVersionById,
} from "@/lib/db/chat-repository-pg";
import { devLogAppend } from "@/lib/logging/devLog";
import { incIngressEvent } from "@/lib/observability/metrics";
import { parseCodeProject, type CodeFile } from "./parser";
import { extractStructuralElements } from "./context/structural-elements";

/**
 * Extracts files from raw assistant content using the CodeProject parser.
 * Returns a JSON string suitable for storing in versions.files_json.
 */
export function parseFilesFromContent(content: string): string {
  const project = parseCodeProject(content);
  return JSON.stringify(project.files);
}

/** Parse `versions.files_json` into code files (e.g. preview bootstrap when markdown parse yields nothing). */
export function parseCodeFilesFromFilesJson(filesJson: string): CodeFile[] | null {
  try {
    const parsed = JSON.parse(filesJson);
    return Array.isArray(parsed) ? (parsed as CodeFile[]) : null;
  } catch {
    return null;
  }
}

function parseStoredVersionFiles(
  filesJson: string,
  context: { versionId?: string; chatId?: string },
): CodeFile[] | null {
  try {
    const parsed = JSON.parse(filesJson);
    return Array.isArray(parsed) ? (parsed as CodeFile[]) : null;
  } catch (error) {
    console.error("[version-manager] Failed to parse stored version files", {
      versionId: context.versionId ?? null,
      chatId: context.chatId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Retrieves parsed files for a given version ID.
 * Returns null if the version doesn't exist.
 */
export async function getVersionFiles(versionId: string): Promise<CodeFile[] | null> {
  const version = await getVersionById(versionId);
  if (!version) return null;
  return parseStoredVersionFiles(version.files_json, {
    versionId: version.id,
    chatId: version.chat_id,
  });
}

/**
 * Like {@link getVersionFiles} but also returns the EXACT `files_json` string
 * the parsed files were read from, in a single DB read. The repair flows
 * (#260 / Codex P2 #5) carry this raw string as the snapshot base so
 * `saveRepairedFiles` can bind its write to it (revision-binding without a
 * schema migration) and never publish a repair over a concurrent user edit.
 * Reading both from one row keeps `files` and `filesJson` mutually consistent.
 */
export async function getVersionFilesSnapshot(
  versionId: string,
): Promise<{
  files: CodeFile[];
  filesJson: string;
  lifecycleStage: "design" | "integrations";
} | null> {
  const version = await getVersionById(versionId);
  if (!version) return null;
  const files = parseStoredVersionFiles(version.files_json, {
    versionId: version.id,
    chatId: version.chat_id,
  });
  if (!files) return null;
  return {
    files,
    filesJson: version.files_json,
    lifecycleStage: version.lifecycle_stage,
  };
}

/**
 * Retrieves parsed files for the latest version of a chat.
 * Returns null if no versions exist.
 */
export async function getLatestVersionFiles(chatId: string): Promise<CodeFile[] | null> {
  const version = (await getPreferredVersion(chatId)) ?? (await getLatestVersion(chatId));
  if (!version) return null;
  return parseStoredVersionFiles(version.files_json, {
    versionId: version.id,
    chatId: version.chat_id,
  });
}

/**
 * 5-2 stale-base gate helper: the chat's current server-side canonical
 * version id — the preferred lifecycle row (newest non-failed), else the
 * newest by version number. The follow-up stream compares the version the
 * client *believes* is newest against this to return 409 when the client
 * built its request on a superseded base (another writer advanced the chat).
 * Mirrors the `preferred ?? latest` resolution finalize-design uses for its
 * own stale check. Returns null when the chat has no versions yet.
 */
export async function resolveChatPreferredVersionId(
  chatId: string,
): Promise<string | null> {
  const preferred = await getPreferredVersion(chatId);
  const version = preferred ?? (await getLatestVersion(chatId));
  return version?.id ?? null;
}

/**
 * Canonical follow-up base: `engine_versions.files_json` for the explicitly selected version
 * (`engineBaseVersionId` from builder meta), else preferred lifecycle version, else latest.
 */
export async function resolveFollowUpPreviousFiles(
  chatId: string,
  engineBaseVersionId?: string | null,
): Promise<CodeFile[]> {
  const id = typeof engineBaseVersionId === "string" ? engineBaseVersionId.trim() : "";
  if (id) {
    const version = await getVersionById(id);
    if (version && version.chat_id === chatId) {
      const parsed = parseStoredVersionFiles(version.files_json, {
        versionId: version.id,
        chatId: version.chat_id,
      });
      if (parsed && parsed.length > 0) {
        // P19 ingress 2: explicit `engineBaseVersionId` from client meta was
        // honoured. Wrapped in try/catch so telemetry can never break codegen.
        // Double-counter is intentional: `followup_base_resolved` gives a
        // single-line dashboard view, the typed counter gives per-branch detail.
        try {
          incIngressEvent("followup_base_resolved", { reason: "explicit" });
          incIngressEvent("followup_base_explicit");
        } catch {}
        try {
          devLogAppend("latest", {
            type: "version-manager.followup-base",
            chatId,
            branch: "explicit",
            versionId: version.id,
          });
        } catch {}
        return parsed;
      }
    }
  }
  const preferred = await getPreferredVersion(chatId);
  const version = preferred ?? (await getLatestVersion(chatId));
  const branch: "preferred" | "latest" = preferred ? "preferred" : "latest";
  try {
    incIngressEvent("followup_base_resolved", { reason: branch });
    incIngressEvent(
      branch === "preferred" ? "followup_base_preferred" : "followup_base_latest",
    );
  } catch {}
  try {
    devLogAppend("latest", {
      type: "version-manager.followup-base",
      chatId,
      branch,
      versionId: version?.id ?? null,
    });
  } catch {}
  if (!version?.files_json) return [];
  return (
    parseStoredVersionFiles(version.files_json, {
      versionId: version.id,
      chatId: version.chat_id,
    }) ?? []
  );
}

export interface MergeWarning {
  type: "significant-shrink" | "scaffold-file-dropped" | "structural-elements-dropped";
  file: string;
  previousSize: number;
  newSize: number;
  droppedElements?: Array<{ kind: string; label: string }>;
}

export interface MergeResult {
  files: CodeFile[];
  warnings: MergeWarning[];
}

/**
 * Deep-merges a generated package.json into the previous one so dependency
 * objects are unioned instead of overwritten.
 *
 * LLM scoped edits frequently return a stripped package.json (only the deps
 * the model added) which would otherwise wipe the rest. We always union
 * `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`
 * and `scripts`. New scalar fields and other keys come from the new file
 * (with the previous values as fallback).
 *
 * Returns the new content unchanged if either side fails to parse as JSON.
 */
export function mergePackageJsonContent(prevContent: string, nextContent: string): string {
  let prev: Record<string, unknown>;
  let next: Record<string, unknown>;
  try {
    prev = JSON.parse(prevContent) as Record<string, unknown>;
    next = JSON.parse(nextContent) as Record<string, unknown>;
  } catch {
    return nextContent;
  }
  if (
    prev === null ||
    typeof prev !== "object" ||
    Array.isArray(prev) ||
    next === null ||
    typeof next !== "object" ||
    Array.isArray(next)
  ) {
    return nextContent;
  }

  const isPlainObject = (v: unknown): v is Record<string, string> =>
    !!v && typeof v === "object" && !Array.isArray(v);

  const mergeRecord = (key: string): Record<string, string> | undefined => {
    const p = prev[key];
    const n = next[key];
    if (!isPlainObject(p) && !isPlainObject(n)) return undefined;
    return {
      ...(isPlainObject(p) ? p : {}),
      ...(isPlainObject(n) ? n : {}),
    };
  };

  const merged: Record<string, unknown> = { ...prev, ...next };
  const depsKeys = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "scripts",
  ] as const;
  for (const key of depsKeys) {
    const m = mergeRecord(key);
    if (m && Object.keys(m).length > 0) {
      merged[key] = m;
    } else if (key in merged && !isPlainObject(merged[key])) {
      delete merged[key];
    }
  }

  return JSON.stringify(merged, null, 2);
}

/**
 * Merges new generated files into the previous file set.
 * Files in newFiles overwrite matching paths; all other previous files are kept.
 * Result is sorted by path for deterministic ordering.
 *
 * Special-case: `package.json` is always deep-merged (dependencies union)
 * regardless of `rejectSignificantShrinks`, because LLM scoped edits routinely
 * emit a partial package.json that would otherwise drop unrelated deps.
 *
 * Warns when a generated file is significantly smaller than the previous
 * version (potential token truncation). For package.json the warning is still
 * emitted for observability even though the content is preserved via deep merge.
 */
export function mergeVersionFilesWithWarnings(
  previousFiles: CodeFile[],
  newFiles: CodeFile[],
  options?: {
    rejectSignificantShrinks?: boolean;
    rejectDroppedStructuralElements?: boolean;
  },
): MergeResult {
  const rejectShrinks = options?.rejectSignificantShrinks === true;
  const rejectDroppedElements = options?.rejectDroppedStructuralElements === true;
  const merged = new Map<string, CodeFile>();
  const warnings: MergeWarning[] = [];

  for (const f of previousFiles) {
    merged.set(f.path, f);
  }
  for (const f of newFiles) {
    const prev = merged.get(f.path);
    const isShrunk = !!prev && f.content.length < prev.content.length * 0.5;
    if (isShrunk) {
      warnings.push({
        type: "significant-shrink",
        file: f.path,
        previousSize: prev!.content.length,
        newSize: f.content.length,
      });
    }

    if (f.path === "package.json" && prev) {
      const mergedContent = mergePackageJsonContent(prev.content, f.content);
      merged.set(f.path, { ...f, content: mergedContent });
      continue;
    }

    if (isShrunk && rejectShrinks) {
      continue;
    }

    // Structural element guard: detect when high-value UI elements
    // (video, canvas, forms, 3D, media components, play buttons, etc.)
    // disappear between versions. When `rejectDroppedStructuralElements`
    // is true, keep the previous file to prevent accidental loss.
    if (prev && rejectDroppedElements && !isShrunk) {
      const prevElements = extractStructuralElements(prev.content);
      if (prevElements.length > 0) {
        const nextElements = extractStructuralElements(f.content);
        const nextKinds = new Set(nextElements.map((e) => e.kind));
        const dropped = prevElements.filter((e) => !nextKinds.has(e.kind));
        if (dropped.length > 0) {
          warnings.push({
            type: "structural-elements-dropped",
            file: f.path,
            previousSize: prev.content.length,
            newSize: f.content.length,
            droppedElements: dropped,
          });
          continue;
        }
      }
    }

    merged.set(f.path, f);
  }

  return {
    files: Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path)),
    warnings,
  };
}
