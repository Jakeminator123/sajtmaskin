import fs from "node:fs";
import path from "node:path";
import { normalizeSlug } from "../shared";
import { ROOT_DIR } from "./constants";
import { readString } from "./entry-fields";
import {
  createRunDir,
  ensureRootDir,
  ensureUnroutedBucketDir,
  isWithinUnroutedDir,
  readChatToRunIndex,
  recordChatToRun,
  resolveLatestRunDirFromDisk,
} from "./run-dirs";
import type { StoredGenerationEntry } from "./types";

const runDirBySlug = new Map<string, string>();
const runDirByChatId = new Map<string, string>();
// runDirByRunId is the most specific scoping: each `site.start` event mints
// a unique runId (from the timestamp + slug folder name) and any subsequent
// event that includes runId/generationId in its data routes only to its own
// folder. This prevents cross-contamination when two followup runs land on
// the same chatId (see logs 20260419-235012 vs 20260419-235205, where
// `site.finalized` from run B leaked into run A's timeline.ndjson because
// runDirByChatId only knew about the latest run).
const runDirByRunId = new Map<string, string>();

/**
 * Stable lookup of a run directory from an event/context triple. Used both as
 * the fallback inside {@link resolveRunDir} (when the in-memory caches were
 * lost to a HMR / process restart between `site.start` and the current event)
 * and as a public helper for callers that want to attach external artefacts
 * to a known run without re-deriving the folder name.
 *
 * Resolution order:
 *  1. `runId` — used as the run-folder name directly when it matches an
 *     existing directory under {@link ROOT_DIR}.
 *  2. `chatId` — looks up the persistent chat-to-run index written every
 *     time `site.start` mints a new run. If no mapping exists yet, the event
 *     lands in `_unrouted/chat-<chatId>/` instead of a generic slug bucket.
 *  3. `slug` — falls back to a stable bucket under `_unrouted/` when
 *     no chat/run context exists, so events still land somewhere inspectable
 *     instead of being dropped silently.
 *
 * Returns `null` only when none of the three keys can be resolved (which is
 * the explicit "no context at all" case the caller is expected to handle).
 */
export function resolveRunDirFromContext(params: {
  chatId?: string | null;
  runId?: string | null;
  slug?: string | null;
}): string | null {
  ensureRootDir();
  const runId = readString(params.runId);
  const chatId = readString(params.chatId);
  const slug = normalizeSlug(params.slug);

  if (runId) {
    const dir = path.join(ROOT_DIR, runId);
    if (fs.existsSync(dir)) return dir;
  }

  if (chatId) {
    const idx = readChatToRunIndex();
    const mapped = idx[chatId];
    if (mapped) {
      const dir = path.join(ROOT_DIR, mapped);
      if (fs.existsSync(dir)) return dir;
    }
    const chatBucket = normalizeSlug(`chat-${chatId}`);
    return chatBucket ? ensureUnroutedBucketDir(chatBucket) : null;
  }

  if (slug) {
    return ensureUnroutedBucketDir(slug);
  }

  return null;
}

export function resolveRunDir(entry: StoredGenerationEntry): string | null {
  const type = readString(entry.data.type);
  const slug = normalizeSlug(entry.slug || readString(entry.data.slug));
  const chatId = readString(entry.data.chatId);
  // runId / generationId comes from the producer when it has been wired
  // through (see writeGenerationLogEntry callers in the engine stream).
  // When present it is the most reliable key — every event for the SAME
  // generation pass shares the same runId, so we never misroute to a
  // sibling run on the same chat.
  const runId =
    readString(entry.data.runId) ?? readString(entry.data.generationId) ?? null;

  if (type === "site.start") {
    const dir = createRunDir(entry.ts, slug);
    const dirRunId = path.basename(dir);
    runDirByRunId.set(dirRunId, dir);
    if (runId && runId !== dirRunId) runDirByRunId.set(runId, dir);
    if (slug) runDirBySlug.set(slug, dir);
    if (chatId) {
      runDirByChatId.set(chatId, dir);
      // Persist the chatId → run-folder mapping so that a HMR reload or a
      // process restart between `site.start` and the next event can still
      // route follow-up events back to the right folder via
      // `resolveRunDirFromContext` (used in the disk-fallback branch below).
      recordChatToRun(chatId, dirRunId);
    }
    return dir;
  }

  // `site.chatId` arrives right after init chat creation and binds the
  // concrete chatId to the already-minted run folder from `site.start`.
  if (type === "site.chatId" && chatId) {
    const latestRunDir = resolveLatestRunDirFromDisk();
    if (latestRunDir && fs.existsSync(latestRunDir) && !isWithinUnroutedDir(latestRunDir)) {
      runDirByChatId.set(chatId, latestRunDir);
      if (slug) runDirBySlug.set(slug, latestRunDir);
      recordChatToRun(chatId, path.basename(latestRunDir));
      return latestRunDir;
    }
  }

  // Most specific: explicit runId on the event.
  if (runId) {
    const fromRun = runDirByRunId.get(runId);
    if (fromRun && fs.existsSync(fromRun)) {
      if (chatId) runDirByChatId.set(chatId, fromRun);
      if (slug) runDirBySlug.set(slug, fromRun);
      if (chatId && !isWithinUnroutedDir(fromRun)) {
        recordChatToRun(chatId, path.basename(fromRun));
      }
      return fromRun;
    }
    if (fromRun && !fs.existsSync(fromRun)) {
      runDirByRunId.delete(runId);
    }
  }

  if (chatId) {
    const fromChat = runDirByChatId.get(chatId);
    if (fromChat && fs.existsSync(fromChat)) {
      if (slug) runDirBySlug.set(slug, fromChat);
      if (!isWithinUnroutedDir(fromChat)) {
        recordChatToRun(chatId, path.basename(fromChat));
      }
      return fromChat;
    }
    if (fromChat && !fs.existsSync(fromChat)) {
      runDirByChatId.delete(chatId);
    }
  }

  // Disk-backed recovery (chat→run index) before slug fallback so stale
  // `_unrouted/*` slug-cache entries don't steal events that have chat context.
  if (chatId || runId) {
    const recoveredFromContext = resolveRunDirFromContext({ chatId, runId, slug: null });
    if (recoveredFromContext) {
      if (chatId) runDirByChatId.set(chatId, recoveredFromContext);
      if (runId) runDirByRunId.set(runId, recoveredFromContext);
      if (slug && !isWithinUnroutedDir(recoveredFromContext)) {
        runDirBySlug.set(slug, recoveredFromContext);
      }
      if (chatId && !isWithinUnroutedDir(recoveredFromContext)) {
        recordChatToRun(chatId, path.basename(recoveredFromContext));
      }
      return recoveredFromContext;
    }
  }

  if (slug) {
    const fromSlug = runDirBySlug.get(slug);
    if (fromSlug && fs.existsSync(fromSlug)) {
      if (chatId) runDirByChatId.set(chatId, fromSlug);
      return fromSlug;
    }
    if (fromSlug && !fs.existsSync(fromSlug)) {
      runDirBySlug.delete(slug);
    }
  }

  // Slug-only fallback for orphaned events with no run/chat context.
  const recovered = resolveRunDirFromContext({ slug });
  if (recovered) {
    if (chatId) runDirByChatId.set(chatId, recovered);
    if (slug) runDirBySlug.set(slug, recovered);
    if (runId) runDirByRunId.set(runId, recovered);
    return recovered;
  }

  // Ambient events (no chatId/runId/slug at all) can still safely route to
  // the latest run on disk — there is no risk of mixing unrelated runs
  // because there is no run identity to mix.
  const hasContext = Boolean(runId || chatId || slug);
  if (!hasContext) {
    const fallbackDir = resolveLatestRunDirFromDisk();
    if (fallbackDir) return fallbackDir;
  }

  console.warn(
    `[generationslogg] resolveRunDir: no run context resolvable for event type=${type ?? "?"} slug=${slug ?? "?"} chatId=${chatId?.slice(0, 8) ?? "?"} runId=${runId?.slice(0, 16) ?? "?"}`,
  );
  return null;
}
