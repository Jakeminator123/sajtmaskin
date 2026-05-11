import fs from "node:fs";
import path from "node:path";

const GENERATIONSLOGG_ROOT_DIR = path.join(process.cwd(), "logs", "generationslogg");
const CHAT_TO_RUN_INDEX_FILE = path.join(GENERATIONSLOGG_ROOT_DIR, "_index", "chat-to-run.json");
const META_FILE = "meta.json";
const TIMELINE_FILE = "timeline.ndjson";
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STALE_IN_PROGRESS_MS = 30 * 60 * 1000;

type StoredRunStatus = {
  runId: string;
  status: string;
  statusReason: string | null;
  versionId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readChatToRunIndex(): Record<string, string> {
  try {
    if (!fs.existsSync(CHAT_TO_RUN_INDEX_FILE)) return {};
    const raw = fs.readFileSync(CHAT_TO_RUN_INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === "string" && value.trim().length > 0) {
        acc[key] = value.trim();
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function readSafeRunIdForChat(chatId: string): string | null {
  const mapped = readChatToRunIndex()[chatId];
  if (!mapped) return null;
  return SAFE_RUN_ID.test(mapped) ? mapped : null;
}

function readLastTimelineTs(runId: string): string | null {
  try {
    const timelinePath = path.join(GENERATIONSLOGG_ROOT_DIR, runId, TIMELINE_FILE);
    if (!fs.existsSync(timelinePath)) return null;
    const raw = fs.readFileSync(timelinePath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const lastLine = lines.at(-1);
    if (!lastLine) return null;
    const lastEntry = JSON.parse(lastLine) as { ts?: unknown } | null;
    return readString(lastEntry?.ts);
  } catch {
    return null;
  }
}

/**
 * Read latest run status for one chat from generationslogg index + meta.json.
 *
 * This reader intentionally stays narrow (chat index -> single run dir) so
 * Next/Turbopack tracing does not pull in the broad write-side log module.
 */
export function readRunStatusForChat(chatId: string | null | undefined): StoredRunStatus | null {
  const trimmedChatId = (chatId ?? "").trim();
  if (!trimmedChatId || trimmedChatId === "-") return null;

  try {
    const runId = readSafeRunIdForChat(trimmedChatId);
    if (!runId) return null;
    const metaPath = path.join(GENERATIONSLOGG_ROOT_DIR, runId, META_FILE);
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, "utf8");
    const meta = JSON.parse(raw) as Record<string, unknown>;
    let status = readString(meta.status) ?? "in_progress";
    let statusReason = readString(meta.statusReason);
    const updatedAt = readString(meta.updatedAt);

    if (status === "in_progress") {
      const tsForStaleness = readLastTimelineTs(runId) ?? updatedAt;
      const parsedTs = tsForStaleness ? Date.parse(tsForStaleness) : NaN;
      if (Number.isFinite(parsedTs) && Date.now() - parsedTs > STALE_IN_PROGRESS_MS) {
        status = "aborted";
        statusReason = "staleness_inferred";
      }
    }

    return {
      runId,
      status,
      statusReason,
      versionId: readString(meta.versionId),
      startedAt: readString(meta.startedAt),
      updatedAt,
    };
  } catch {
    return null;
  }
}
