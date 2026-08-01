import fs from "node:fs";
import path from "node:path";
import {
  CHAT_TO_RUN_INDEX_FILE,
  LATEST_FILE,
  LEGACY_INDEX_DIR,
  MAX_RUN_DIRS,
  MAX_UNROUTED_BUCKETS,
  ROOT_DIR,
  RUN_INDEX_DIR,
  SITE_OBSERVABILITY_DIR,
  UNROUTED_DIR,
} from "./constants";

function formatRunTimestamp(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return ts.replace(/[^0-9]/g, "").slice(0, 14) || "run";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export function ensureRootDir(): void {
  if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
  }
}

export function ensureLegacyIndexDir(): void {
  if (!fs.existsSync(LEGACY_INDEX_DIR)) {
    fs.mkdirSync(LEGACY_INDEX_DIR, { recursive: true });
  }
}

export function ensureSiteObservabilityDir(): void {
  if (!fs.existsSync(SITE_OBSERVABILITY_DIR)) {
    fs.mkdirSync(SITE_OBSERVABILITY_DIR, { recursive: true });
  }
}

function ensureRunIndexDir(): void {
  if (!fs.existsSync(RUN_INDEX_DIR)) {
    fs.mkdirSync(RUN_INDEX_DIR, { recursive: true });
  }
}

export function readChatToRunIndex(): Record<string, string> {
  try {
    if (!fs.existsSync(CHAT_TO_RUN_INDEX_FILE)) return {};
    const raw = fs.readFileSync(CHAT_TO_RUN_INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string" && value.trim()) {
          out[key] = value;
        }
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function writeChatToRunIndex(map: Record<string, string>): void {
  try {
    ensureRunIndexDir();
    fs.writeFileSync(
      CHAT_TO_RUN_INDEX_FILE,
      JSON.stringify(map, null, 2) + "\n",
      "utf8",
    );
  } catch {
    /* best-effort; index is a recovery aid only */
  }
}

export function isWithinUnroutedDir(dir: string): boolean {
  const relative = path.relative(UNROUTED_DIR, dir);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function ensureUnroutedBucketDir(bucketSlug: string): string | null {
  if (!bucketSlug) return null;
  const bucketDir = path.join(UNROUTED_DIR, bucketSlug);
  try {
    const isNewBucket = !fs.existsSync(bucketDir);
    fs.mkdirSync(bucketDir, { recursive: true });
    if (isNewBucket) {
      // LRU-prune: cap antalet bucketar under _unrouted/. Förut växte
      // detta linjärt med antalet unika orphan-event-slugs.
      lruPruneSubdirs(UNROUTED_DIR, MAX_UNROUTED_BUCKETS);
    }
    return bucketDir;
  } catch {
    return null;
  }
}

export function recordChatToRun(chatId: string | null, runDirName: string): void {
  if (!chatId || !runDirName) return;
  const idx = readChatToRunIndex();
  if (idx[chatId] === runDirName) return;
  idx[chatId] = runDirName;
  writeChatToRunIndex(idx);
}

function pruneOldRunDirs(): void {
  try {
    const entries = fs
      .readdirSync(ROOT_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      // Skip the bookkeeping subdirs (`_index`, `_unrouted`) that we keep
      // alongside the per-run folders so prune doesn't wipe the chat-to-run
      // recovery index.
      .filter((e) => !e.name.startsWith("_"))
      .map((e) => e.name)
      .sort();
    if (entries.length <= MAX_RUN_DIRS) return;
    const toRemove = entries.slice(0, entries.length - MAX_RUN_DIRS);
    for (const name of toRemove) {
      fs.rmSync(path.join(ROOT_DIR, name), { recursive: true, force: true });
    }
    pruneChatToRunIndexAgainstDisk();
  } catch (err) {
    console.warn(
      "[generationslogg] pruneOldRunDirs failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function pruneChatToRunIndexAgainstDisk(): void {
  const idx = readChatToRunIndex();
  let changed = false;
  for (const [chatId, runName] of Object.entries(idx)) {
    if (!fs.existsSync(path.join(ROOT_DIR, runName))) {
      delete idx[chatId];
      changed = true;
    }
  }
  if (changed) writeChatToRunIndex(idx);
}

// LRU-prune helper used by both site-observability/<chatId>/ and
// generationslogg/_unrouted/<bucket>/. We use the most recent mtime among
// files inside each subdirectory as a proxy for "last activity" — this is
// stable enough for cleanup and avoids a full recursive walk.
export function lruPruneSubdirs(parentDir: string, maxDirs: number): void {
  try {
    if (!fs.existsSync(parentDir)) return;
    const entries = fs
      .readdirSync(parentDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (entries.length <= maxDirs) return;

    const scored = entries.map((name) => {
      const dir = path.join(parentDir, name);
      let latestMtime = 0;
      try {
        for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
          const childPath = path.join(dir, child.name);
          const stat = fs.statSync(childPath);
          if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
        }
      } catch {
        latestMtime = 0;
      }
      return { name, latestMtime };
    });
    scored.sort((a, b) => a.latestMtime - b.latestMtime);
    const toRemove = scored.slice(0, scored.length - maxDirs);
    for (const { name } of toRemove) {
      fs.rmSync(path.join(parentDir, name), { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(
      `[generationslogg] lruPruneSubdirs(${parentDir}) failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function createRunDir(ts: string, slug: string | null): string {
  ensureRootDir();
  const baseName = `${formatRunTimestamp(ts)}-${slug || "generation"}`;
  let folderName = baseName;
  let suffix = 2;
  while (fs.existsSync(path.join(ROOT_DIR, folderName))) {
    folderName = `${baseName}-${suffix}`;
    suffix += 1;
  }
  const dir = path.join(ROOT_DIR, folderName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(ROOT_DIR, LATEST_FILE), `${folderName}\n`, "utf8");
  pruneOldRunDirs();
  return dir;
}

export function resolveLatestRunDirFromDisk(): string | null {
  try {
    const latestPath = path.join(ROOT_DIR, LATEST_FILE);
    if (!fs.existsSync(latestPath)) return null;
    const latestName = fs.readFileSync(latestPath, "utf8").trim();
    if (!latestName) return null;
    const latestDir = path.join(ROOT_DIR, latestName);
    if (!fs.existsSync(latestDir)) return null;
    return latestDir;
  } catch {
    return null;
  }
}
