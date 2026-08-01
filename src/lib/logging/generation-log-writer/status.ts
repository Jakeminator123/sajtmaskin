import { readRunStatusForChat as readRunStatusForChatFromDisk } from "../run-status-reader";
import {
  findLastBoolean,
  findLastString,
  findLatestByType,
  readBoolean,
  readNumber,
  readString,
} from "./entry-fields";
import type { StoredGenerationEntry } from "./types";

// Lazy staleness coercion. If a run lacks site.done AND lacks site.aborted AND
// the last entry is older than this threshold, resolveStatusDetails returns "aborted"
// with reason "staleness_inferred". This catches orphaned in_progress runs
// where the stream died before any abort-emit had a chance to write
// (e.g. server-restart mid-stream, hard process kill). The threshold is
// deliberately generous — a real generation rarely exceeds 15 minutes — but
// not so high that it lets dead runs sit in_progress indefinitely.
const STALE_IN_PROGRESS_MS = 30 * 60 * 1000;

/**
 * Status semantics (P0 stream-abort recovery, 2026-04-26):
 *
 *   "done"          → finalize succeeded; site.done / site.message.done present.
 *   "awaiting_input"→ stream halted on a clarification question.
 *   "empty_generation" → stream finished but produced zero usable file output.
 *   "aborted"       → transport / provider abort BEFORE finalize. Distinct
 *                     from "failed" (which is reserved for runs that produced
 *                     content but got rejected later). See
 *                     `docs/schemas/strict/site-aborted.schema.json`.
 *   "error_signal"  → some run-level error event was emitted but the stream
 *                     did not surface a clean abort/done. Used when the
 *                     pipeline self-reports `*error*`/`*failed*`/`*gave-up*`
 *                     events but no site.aborted was written.
 *   "in_progress"   → still running OR the writer never saw a terminal
 *                     event. Lazy staleness detection coerces stale
 *                     in_progress to aborted (reason=staleness_inferred).
 */
type ResolvedStatusReason =
  | "done"
  | "client_disconnect"
  | "provider_aborted_no_content"
  | "provider_aborted_after_content"
  | "stream_closed_without_done"
  | "stream_error"
  | "staleness_inferred"
  | "awaiting_input"
  | "empty_generation"
  | "partial_file_output"
  | "error_event_seen"
  | null;

interface ResolvedStatus {
  status: string;
  reason: ResolvedStatusReason;
}

function resolveStatusDetails(
  entries: StoredGenerationEntry[],
  options: { now?: number; stalenessMs?: number } = {},
): ResolvedStatus {
  const hasDone = findLatestByType(entries, ["site.done", "site.message.done"]);
  if (hasDone) return { status: "done", reason: "done" };
  const aborted = findLatestByType(entries, ["site.aborted"]);
  if (aborted) {
    const rawReason = readString(aborted.data.reason);
    const allowed: ResolvedStatusReason[] = [
      "client_disconnect",
      "provider_aborted_no_content",
      "provider_aborted_after_content",
      "stream_closed_without_done",
      "stream_error",
      "staleness_inferred",
    ];
    const reason =
      rawReason && (allowed as readonly string[]).includes(rawReason)
        ? (rawReason as ResolvedStatusReason)
        : "stream_error";
    return { status: "aborted", reason };
  }
  const finalType = readString(entries.at(-1)?.data.type);
  if (finalType === "site.awaiting_input") {
    return { status: "awaiting_input", reason: "awaiting_input" };
  }
  if (finalType === "site.empty_generation") {
    return { status: "empty_generation", reason: "empty_generation" };
  }
  if (finalType === "site.partial_file_output") {
    return { status: "error_signal", reason: "partial_file_output" };
  }
  const errorLike = entries.some((entry) => {
    const type = readString(entry.data.type) || "";
    return type.includes("error") || type.includes("failed") || type.includes("gave-up");
  });
  if (errorLike) return { status: "error_signal", reason: "error_event_seen" };

  // Lazy staleness: if no terminal event ever landed and the last entry is
  // older than STALE_IN_PROGRESS_MS, treat as aborted. This is the read-side
  // safety net for runs where the emit-side abort handler never fired
  // (server-restart, OOM, hard kill). Tests can override `now` and
  // `stalenessMs` to keep the assertion fast.
  const lastTsRaw = entries.at(-1)?.ts;
  const lastTs = typeof lastTsRaw === "string" ? Date.parse(lastTsRaw) : NaN;
  const now = options.now ?? Date.now();
  const threshold = options.stalenessMs ?? STALE_IN_PROGRESS_MS;
  if (Number.isFinite(lastTs) && now - lastTs > threshold) {
    return { status: "aborted", reason: "staleness_inferred" };
  }
  return { status: "in_progress", reason: null };
}

export function buildMeta(entries: StoredGenerationEntry[]): Record<string, unknown> {
  const start = findLatestByType(entries, ["site.start"]);
  const latestRequest = findLatestByType(entries, ["comm.request.followup", "comm.request.create"]);
  const done = findLatestByType(entries, ["site.done", "site.message.done"]);
  const preflight = findLatestByType(entries, ["preflight.summary"]);
  const streamSummary = findLatestByType(entries, ["stream.summary"]);
  const verifier = findLatestByType(entries, ["verifier-pass"]);
  const serverVerifyPolicy = findLatestByType(entries, ["server-verify.policy"]);
  const partialOutput = findLatestByType(entries, ["site.partial_file_output"]);
  const emptyGen = findLatestByType(entries, ["site.empty_generation"]);
  const persistBlocker = partialOutput ?? emptyGen;

  const statusDetails = resolveStatusDetails(entries);
  return {
    status: statusDetails.status,
    statusReason: statusDetails.reason,
    startedAt: entries[0]?.ts ?? null,
    updatedAt: entries.at(-1)?.ts ?? null,
    repoHead: readString(process.env.VERCEL_GIT_COMMIT_SHA),
    repoBranch: readString(process.env.VERCEL_GIT_COMMIT_REF),
    repoIdentityCapturedAt: new Date().toISOString(),
    slug: findLastString(entries, "slug") ?? start?.slug ?? null,
    chatId: findLastString(entries, "chatId"),
    versionId: findLastString(entries, "versionId"),
    generationKind: readString(start?.data.generationKind),
    modelId: findLastString(entries, "modelId"),
    thinking: findLastBoolean(entries, "thinking"),
    imageGenerations: findLastBoolean(entries, "imageGenerations"),
    promptStrategy: readString(latestRequest?.data.promptStrategy) ?? findLastString(entries, "promptStrategy"),
    promptType: readString(latestRequest?.data.promptType) ?? findLastString(entries, "promptType"),
    // Plan 03 (short): mirrors devLog `comm.request.{create,followup}.promptSource`.
    promptSource: readString(latestRequest?.data.promptSource) ?? findLastString(entries, "promptSource"),
    buildIntent: findLastString(entries, "buildIntent"),
    buildMethod: findLastString(entries, "buildMethod"),
    durationMs: readNumber(done?.data.durationMs),
    previewUrl: readString(done?.data.previewUrl),
    streamTiming: streamSummary
      ? {
          reasoningMs: readNumber(streamSummary.data.reasoningMs),
          outputMs: readNumber(streamSummary.data.outputMs),
          durationMs: readNumber(streamSummary.data.durationMs),
        }
      : null,
    tokenUsage: streamSummary
      ? {
          inputTokens: readNumber(streamSummary.data.inputTokens),
          outputTokens: readNumber(streamSummary.data.outputTokens),
        }
      : null,
    persistBlockedReason: persistBlocker
      ? readString(persistBlocker.data.reason) ?? readString(persistBlocker.data.type)
      : null,
    persistBlockingFiles: persistBlocker && Array.isArray(persistBlocker.data.issues)
      ? (persistBlocker.data.issues as string[]).slice(0, 5)
      : null,
    preflight: preflight
      ? {
          filesChecked: readNumber(preflight.data.filesChecked),
          issueCount: readNumber(preflight.data.issueCount),
          errorCount: readNumber(preflight.data.errorCount),
          warningCount: readNumber(preflight.data.warningCount),
          previewBlocked: readBoolean(preflight.data.previewBlocked),
          verificationBlocked: readBoolean(preflight.data.verificationBlocked),
        }
      : null,
    verifier: verifier
      ? {
          blocking: readNumber(verifier.data.blocking),
          quality: readNumber(verifier.data.quality),
        }
      : null,
    serverVerify: serverVerifyPolicy
      ? {
          run: readBoolean(serverVerifyPolicy.data.run),
          reason: readString(serverVerifyPolicy.data.reason),
          verificationPolicy: readString(serverVerifyPolicy.data.verificationPolicy),
          qualityTarget: readString(serverVerifyPolicy.data.qualityTarget),
        }
      : null,
  };
}

/**
 * P0 stream-abort recovery (2026-04-26). Public read-side helper used by the
 * `/versions` route and any other server-only caller that needs to know
 * whether a chat's most recent generation/repair pass died (transport
 * abort, provider abort, server-restart, staleness) before producing a
 * version. Returns `null` when no run can be found for the chatId — the
 * caller must treat that as "no run yet" (idle), NOT as "aborted".
 *
 * Status semantics mirror `resolveStatusDetails`:
 *  - `done` — finalize succeeded.
 *  - `aborted` — transport/provider/staleness; UI must not offer repair.
 *  - `failed` — finalize ran but verifier rejected; UI may offer repair.
 *  - `in_progress` — still streaming; UI keeps polling.
 *  - `error_signal` / `awaiting_input` / `partial_file_output` /
 *    `empty_generation` — pre-existing categories from resolveStatusDetails.
 */
export function readRunStatusForChat(
  chatId: string | null | undefined,
): {
  runId: string;
  status: string;
  statusReason: string | null;
  versionId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
} | null {
  return readRunStatusForChatFromDisk(chatId);
}
