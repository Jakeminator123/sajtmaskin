/**
 * OMTAG-06 — Unified status event bus.
 *
 * Append-only single-writer for all version-scoped status events. The
 * previous architecture had four parallel writers racing to express the
 * version lifecycle (`preflight.summary` devLog entries,
 * `engine_version_error_logs` DB rows, `server-verify.policy` devLog
 * entries, and a client-derived `versionStatus` computed from DB row
 * flags). The fix isn't a fourth aggregating resolver — it's a single
 * event stream that the writers *all* flow through, and from which the
 * UI projects its display status via `selectVersionStatus()`.
 *
 * Design notes:
 *
 *  - **Append-only**: `emit()` is the only writer. Events are immutable
 *    once appended. Subscribers are fan-out consumers (DB persistence,
 *    legacy devLog-mirror, UI streams).
 *  - **Per-(versionId, runId) NDJSON**: each emit mirrors to
 *    `data/runs/<versionId>/<runId>/events.ndjson` so server restart +
 *    repair-pass can replay or aggregate history cheaply.
 *  - **Per-version `.runs.json` index**: when a new `runId` is observed
 *    for a given `versionId` (typically the first pass + any repair
 *    pass), we append it to `data/runs/<versionId>/.runs.json`. UI /
 *    projection can then `readAll(versionId)` to fold every pass into
 *    one logical event stream, which is how we fix the "2 events in
 *    repair vs 30 in original" flush bug.
 *  - **No DB migration**: persistence is filesystem-only under
 *    `data/runs/`. Durable DB writes (engine_version_error_logs,
 *    engine_versions) remain owned by their existing code-paths but
 *    are now reached via bus subscribers.
 *  - **No env toggle**: migrated writers cut over directly; there's
 *    no shadow / fallback mode. See `OMTAG/06-unified-status-eventbus.md`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  EngineEvent,
  EngineEventInput,
  EngineEventType,
  EventBusSubscriber,
  RunIndexEntry,
} from "./event-bus-types";

/**
 * On Vercel the deployment bundle (`/var/task`, i.e. `process.cwd()`) is
 * read-only; only the per-invocation `/tmp` is writable. Writing run NDJSON
 * under `process.cwd()/data/runs` therefore always threw
 * `ENOENT ... mkdir '/var/task/data/runs/...'` in production — spamming logs
 * and silently disabling on-disk replay. Mirror to `os.tmpdir()` on Vercel so
 * within-instance replay keeps working without the noise; local/dev keeps the
 * repo-relative path so `data/runs/` stays inspectable.
 */
function resolveRunsRootDir(): string {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "sajtmaskin", "data", "runs");
  }
  // turbopackIgnore keeps this dev-only cwd() out of Turbopack's NFT file trace.
  // Without it Turbopack traces the whole project into every route that imports
  // the event bus (e.g. version-status), bloating the serverless bundle. Same
  // pattern as outputFileTracingRoot in next.config.ts.
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "runs");
}

export const RUNS_ROOT_DIR = resolveRunsRootDir();
export const RUNS_INDEX_FILE = ".runs.json";
export const EVENTS_NDJSON_FILE = "events.ndjson";

/**
 * When a caller emits an event without an explicit `runId`, we fall
 * back to a deterministic bootstrap run so the event still lands on
 * disk under a stable path. `"root"` was picked instead of `"default"`
 * to make it visually obvious in `data/runs/<versionId>/root/` that
 * this particular pass didn't come from the repair-loop.
 */
export const DEFAULT_RUN_ID = "root";

// ── In-memory store ─────────────────────────────────────────────────────
// Keyed by versionId; each version carries every event emitted for it
// across all runs, in arrival order. Readers that need to aggregate
// across repair-pass folders on disk should call `readAll(versionId)`.
const inMemoryEvents = new Map<string, EngineEvent[]>();
const subscribers = new Set<EventBusSubscriber>();
const seenRunIds = new Map<string, Set<string>>();

// ── Disk IO helpers ────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function runDir(versionId: string, runId: string): string {
  return path.join(RUNS_ROOT_DIR, versionId, runId);
}

function versionDir(versionId: string): string {
  return path.join(RUNS_ROOT_DIR, versionId);
}

function indexPath(versionId: string): string {
  return path.join(versionDir(versionId), RUNS_INDEX_FILE);
}

function ndjsonPath(versionId: string, runId: string): string {
  return path.join(runDir(versionId, runId), EVENTS_NDJSON_FILE);
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function appendNdjsonLine(filePath: string, event: EngineEvent): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

function appendRunIndex(versionId: string, entry: RunIndexEntry): void {
  ensureDir(versionDir(versionId));
  const file = indexPath(versionId);
  const existing = readJsonSafe<RunIndexEntry[]>(file) ?? [];
  const alreadyIndexed = existing.some((e) => e.runId === entry.runId);
  if (alreadyIndexed) return;
  existing.push(entry);
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
}

function isTest(): boolean {
  // Vitest sets VITEST / NODE_ENV=test. We still persist during tests
  // because the projection tests don't rely on FS — but individual
  // callers can opt out via `mirrorToDisk: false`.
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Register a subscriber. Returns an unsubscribe handle. Subscribers
 * are called synchronously after the in-memory append + disk mirror;
 * any `throw` is caught and logged so one slow/bad subscriber can't
 * break the writer path.
 */
export function subscribe(fn: EventBusSubscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * Append an event to the bus. Safe to call with best-effort semantics —
 * disk IO and subscriber errors are swallowed. Returns the fully-typed
 * event that was stored (with `ts` auto-filled when caller omitted it).
 */
export function emit<E extends EngineEventInput>(input: E): EngineEvent {
  const event = normalizeEvent(input);
  const versionKey = event.versionId;

  const bucket = inMemoryEvents.get(versionKey);
  if (bucket) {
    bucket.push(event);
  } else {
    inMemoryEvents.set(versionKey, [event]);
  }

  maybeRegisterRun(event);
  mirrorToDisk(event);
  fanOutToSubscribers(event);

  return event;
}

/**
 * Read the in-memory + on-disk event stream for a given versionId.
 * Merges every `<versionId>/<runId>/events.ndjson` file listed in
 * `.runs.json` so callers transparently see all repair-pass events.
 *
 * Events are returned in `ts` order (stable, insertion order as a
 * tie-breaker).
 */
export function readAll(versionId: string): EngineEvent[] {
  const merged: EngineEvent[] = [...(inMemoryEvents.get(versionId) ?? [])];
  // O(1) dedup by event id. Was an O(events²) `merged.some(...)` rescan per disk
  // line, which scaled badly on the polled /versions path (versions × runs ×
  // events²). Seed from the in-memory events so first-seen still wins identically.
  const seenIds = new Set<string>(merged.map((event) => event.id));
  const diskRuns = listRuns(versionId);
  for (const run of diskRuns) {
    const file = ndjsonPath(versionId, run.runId);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as EngineEvent;
        // Avoid duplicate-injection when in-memory or an earlier run already has it.
        if (!seenIds.has(parsed.id)) {
          seenIds.add(parsed.id);
          merged.push(parsed);
        }
      } catch {
        /* tolerate corrupted lines */
      }
    }
  }
  return merged.sort((a, b) => {
    if (a.ts === b.ts) return 0;
    return a.ts < b.ts ? -1 : 1;
  });
}

/**
 * List the runs recorded for a versionId, reading from `.runs.json`.
 * Returns `[]` when the version has never emitted anything.
 */
export function listRuns(versionId: string): RunIndexEntry[] {
  return readJsonSafe<RunIndexEntry[]>(indexPath(versionId)) ?? [];
}

/**
 * Drop everything for a versionId. Intended for tests only — production
 * code should treat the bus as append-only.
 */
export function __resetForTests(versionId?: string): void {
  if (versionId) {
    inMemoryEvents.delete(versionId);
    seenRunIds.delete(versionId);
    return;
  }
  inMemoryEvents.clear();
  seenRunIds.clear();
  subscribers.clear();
}

// ── Internals ──────────────────────────────────────────────────────────

function normalizeEvent<E extends EngineEventInput>(input: E): EngineEvent {
  const ts = typeof input.ts === "string" && input.ts.trim() ? input.ts : new Date().toISOString();
  const id = typeof input.id === "string" && input.id.trim() ? input.id : newEventId();
  const runId = typeof input.runId === "string" && input.runId.trim() ? input.runId : DEFAULT_RUN_ID;
  // Cast via unknown to preserve the discriminated-union `t` field.
  return { ...(input as unknown as EngineEvent), ts, id, runId };
}

function newEventId(): string {
  // Event IDs don't need to be cryptographic — they just need to make
  // dedup across in-memory + disk deterministic. `Math.random()` base36
  // gives us 40+ bits of entropy which is plenty.
  const rand = Math.random().toString(36).slice(2, 10);
  return `ev_${Date.now().toString(36)}_${rand}`;
}

function maybeRegisterRun(event: EngineEvent): void {
  const key = event.versionId;
  const seen = seenRunIds.get(key) ?? new Set<string>();
  if (seen.has(event.runId)) return;
  seen.add(event.runId);
  seenRunIds.set(key, seen);

  const reason =
    event.t === "version.repair.started" && typeof event.reason === "string"
      ? event.reason
      : event.t === "version.started"
        ? "initial"
        : null;

  const entry: RunIndexEntry = {
    runId: event.runId,
    versionId: event.versionId,
    startedAt: event.ts,
    reason,
  };
  try {
    appendRunIndex(event.versionId, entry);
  } catch {
    /* best-effort */
  }
}

function mirrorToDisk(event: EngineEvent): void {
  try {
    appendNdjsonLine(ndjsonPath(event.versionId, event.runId), event);
  } catch (err) {
    if (!isTest()) {
      console.warn(
        "[event-bus] mirrorToDisk failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

function fanOutToSubscribers(event: EngineEvent): void {
  for (const sub of subscribers) {
    try {
      sub(event);
    } catch (err) {
      console.warn(
        "[event-bus] subscriber threw:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// Public-typed helpers for callers that want to check event.t without
// re-importing types. Not exhaustive by design — callers should lean on
// the discriminated union from event-bus-types.ts.
export function isEventOfType<T extends EngineEventType>(
  event: EngineEvent,
  type: T,
): event is Extract<EngineEvent, { t: T }> {
  return event.t === type;
}
