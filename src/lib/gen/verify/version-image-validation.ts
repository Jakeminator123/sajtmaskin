import { FEATURES, SECRETS } from "@/lib/config";
import { chatHasImportedRepoVersion, recordKnownBrokenImageReplacements, updateVersionFiles } from "@/lib/db/chat-repository-pg";
import { VersionLeaseHeldError } from "@/lib/db/version-lease-error";
import { getVersionFilesSnapshot } from "@/lib/gen/version-manager";
import { repairGeneratedFiles } from "@/lib/gen/autofix/repair-generated-files";
import { materializeImagesInTextFiles, type MaterializeImagesResult } from "@/lib/images/image-assets";
import { buildKnownImageReplacementMap, validateImages, type ImageValidationResult } from "@/lib/utils/image-validator";

export type VersionImageValidationInput = {
  /** Already tenant-scoped by the HTTP boundary or trusted server caller. */
  chatId: string;
  versionId: string;
  autoFix: boolean;
  urls?: readonly string[];
  signal?: AbortSignal;
} & (
  | { holderRunId: string; expectedFilesRevision: string }
  | { holderRunId?: undefined; expectedFilesRevision?: undefined }
);

type ImageValidationResponse = Omit<ImageValidationResult, "files"> & {
  valid: boolean;
  fixed: boolean;
  persisted: boolean;
  filesRevision: string | null;
  message: string;
};

export type VersionImageValidationOutcome = {
  kind: "checked" | "stopped" | "no_files";
  result: ImageValidationResponse;
};

function emptyResult(message: string, persisted: boolean): ImageValidationResponse {
  return { valid: persisted, total: 0, broken: [], replacedCount: 0, warnings: [],
    fixed: false, persisted, filesRevision: null, message };
}

export type VersionImagePreparationInput = Pick<VersionImageValidationInput, "chatId" | "versionId" | "signal"> & {
  holderRunId: string;
  expectedFilesRevision: string;
  /** Trusted server policy; not inferred from a browser query parameter. */
  materialize: boolean;
  deadlineEpochMs?: number;
};

export type VersionImagePreparationOutcome = {
  kind: "prepared" | "verbatim" | "no_files" | "stopped";
  persisted: boolean;
  filesRevision: string | null;
  materialization: MaterializeImagesResult["summary"] | null;
  warnings: string[];
};

/** Held-only preparation before preview/postcheck; never acquires or releases a lease. */
export async function prepareVersionImages(
  input: VersionImagePreparationInput,
): Promise<VersionImagePreparationOutcome> {
  const deadlineEpochMs = input.deadlineEpochMs ?? Date.now() + 30_000;
  const stopped = () => input.signal?.aborted || !Number.isFinite(deadlineEpochMs) || Date.now() >= deadlineEpochMs;
  const outcome: VersionImagePreparationOutcome = {
    kind: "stopped", persisted: false, filesRevision: null, materialization: null, warnings: [],
  };
  if (!input.holderRunId?.trim() || !input.expectedFilesRevision?.trim() || stopped()) return outcome;
  const snapshot = await getVersionFilesSnapshot(input.versionId);
  if (!snapshot || snapshot.filesRevision !== input.expectedFilesRevision || stopped()) return outcome;
  if (!snapshot.files.length) return { ...outcome, kind: "no_files" };

  try {
    // A descendant of an imported repo is still verbatim; unknown lineage fails closed.
    const verbatim = snapshot.editKind === "imported_repo" ? true : await chatHasImportedRepoVersion(input.chatId);
    if (stopped()) return outcome;
    if (verbatim === true) return {
      ...outcome, kind: "verbatim", persisted: true, filesRevision: snapshot.filesRevision,
    };
    if (verbatim !== false) return outcome;
    let files = repairGeneratedFiles(snapshot.files.map((file) => ({ ...file }))).files;
    if (input.materialize && process.env.BLOB_READ_WRITE_TOKEN && !stopped()) {
      const materialized = await materializeImagesInTextFiles({
        files: files.map((file) => ({ name: file.path, content: file.content })),
        strategy: "blob", blobToken: process.env.BLOB_READ_WRITE_TOKEN,
        namespace: { chatId: input.chatId, versionId: input.versionId },
        signal: input.signal, deadlineEpochMs,
      });
      outcome.materialization = materialized.summary;
      outcome.warnings.push(...materialized.warnings);
      const contents = new Map(materialized.files.map((file) => [file.name, file.content]));
      files = files.map((file) => ({ ...file, content: contents.get(file.path) ?? file.content }));
    }
    if (stopped()) return outcome;
    const filesJson = JSON.stringify(files);
    const changed = filesJson !== JSON.stringify(snapshot.files);
    if (changed) {
      const wrote = await updateVersionFiles(input.versionId, filesJson, {
        holderRunId: input.holderRunId, expectedFilesJson: snapshot.filesJson, invalidateVerification: true,
      });
      if (!wrote || stopped()) return outcome;
    }
    const refreshed = await getVersionFilesSnapshot(input.versionId);
    if (stopped() || refreshed?.filesJson !== (changed ? filesJson : snapshot.filesJson) ||
        !refreshed.filesRevision?.trim() || (changed
          ? refreshed.filesRevision === snapshot.filesRevision
          : refreshed.filesRevision !== snapshot.filesRevision)) return outcome;
    return { ...outcome, kind: "prepared", persisted: true, filesRevision: refreshed.filesRevision };
  } catch (error) {
    outcome.warnings.push(`Image preparation stopped: ${error instanceof Error ? error.message : "unknown error"}`);
    return outcome;
  }
}

/** No Request/HTTP transport or lease ownership here; every write uses the caller's fence. */
export async function validateVersionImages(
  input: VersionImageValidationInput,
): Promise<VersionImageValidationOutcome> {
  const snapshot = await getVersionFilesSnapshot(input.versionId);
  if (input.holderRunId !== undefined &&
      (!input.holderRunId.trim() || !input.expectedFilesRevision?.trim() ||
       snapshot?.filesRevision !== input.expectedFilesRevision)) {
    return { kind: "stopped", result: emptyResult("Versionen ändrades före bildkontrollen.", false) };
  }
  if (!snapshot?.files.length) {
    return { kind: "no_files", result: emptyResult("No files to validate", true) };
  }
  // Import lineage stays verbatim, including descendants with another editKind.
  // Do not use the export helper's fail-open catch on a mutation boundary.
  const verbatim = input.autoFix &&
    (snapshot.editKind === "imported_repo" || await chatHasImportedRepoVersion(input.chatId));
  const autoFix = input.autoFix && !verbatim;
  const result = await validateImages({
    files: snapshot.files.map((file) => ({ name: file.path, content: file.content })),
    autoFix,
    unsplashAccessKey: FEATURES.useUnsplash ? SECRETS.unsplashAccessKey : null,
    onlyUrls: input.urls ? [...input.urls] : undefined,
  });
  // The validator may own mutable output; never mutate caller inputs.
  const warnings = [...result.warnings];
  let persisted = result.replacedCount <= 0;
  let filesRevision = snapshot.filesRevision?.trim() || null;
  let stopped = Boolean(input.signal?.aborted);
  if (autoFix && result.replacedCount > 0) {
    if (stopped) {
      persisted = false;
      warnings.push("Kunde inte spara fixade bilder — requesten avbröts.");
    } else {
      try {
        const updatedFiles = snapshot.files.map((file) => {
          const replacement = result.files.find((f) => f.name === file.path);
          return replacement ? { ...file, content: replacement.content } : { ...file };
        });
        const filesJson = JSON.stringify(updatedFiles);
        persisted = await updateVersionFiles(input.versionId, filesJson, {
          invalidateVerification: true,
          expectedFilesJson: snapshot.filesJson,
          ...(input.holderRunId ? { holderRunId: input.holderRunId } : {}),
        });
        if (persisted) {
          const refreshed = await getVersionFilesSnapshot(input.versionId);
          // A true write is not a receipt for a different/newer snapshot.
          persisted = Boolean(refreshed?.filesJson === filesJson && refreshed.filesRevision?.trim());
          filesRevision = persisted ? refreshed!.filesRevision : null;
        }
        stopped = !persisted || Boolean(input.signal?.aborted);
      } catch (error) {
        if (error instanceof VersionLeaseHeldError && !input.holderRunId) throw error;
        console.error("[validate-images] Failed to update version:", error);
        warnings.push("Kunde inte spara fixade bilder till versionen.");
        persisted = false;
        filesRevision = null;
        stopped = true;
      }
    }
  }
  // Dry-run and failed/aborted mutation paths must not seed future rewrites.
  if (autoFix && !stopped) {
    const knownReplacements = buildKnownImageReplacementMap(result.broken);
    if (Object.keys(knownReplacements).length) {
      await recordKnownBrokenImageReplacements(input.chatId, knownReplacements).catch((error) => {
        console.warn("[validate-images] Failed to record known image replacements:", error);
      });
    }
  }
  const fixed = persisted && result.replacedCount > 0;
  return {
    kind: stopped ? "stopped" : "checked",
    result: {
      valid: result.broken.length === 0, total: result.total, broken: result.broken,
      replacedCount: result.replacedCount, warnings, fixed, persisted, filesRevision,
      message: result.broken.length === 0
        ? `Alla ${result.total} bild-URL:er är giltiga`
        : `${result.broken.length} av ${result.total} bilder trasiga${fixed ? `, ${result.replacedCount} ersatta` : ""}`,
    },
  };
}
