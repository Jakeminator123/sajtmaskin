import fs from "node:fs";
import path from "node:path";
import { normalizeErrorPattern } from "@/lib/gen/autofix/types";
import {
  FIX_PATTERNS_FILE,
  MAX_SITE_HISTORY_RUNS,
  MAX_SITE_OBSERVABILITY_CHATS,
  OBSERVABILITY_FILE,
  SITE_HISTORY_FILE,
  SITE_LATEST_DIR,
  SITE_OBSERVABILITY_DIR,
} from "./constants";
import { readNumber, readString } from "./entry-fields";
import { collectFaultFixRows } from "./fault-fix-index";
import { ensureSiteObservabilityDir, lruPruneSubdirs } from "./run-dirs";
import { buildMeta } from "./status";
import { buildHighlights } from "./summaries";
import type { RunFixPattern, RunObservabilitySnapshot, StoredGenerationEntry } from "./types";

function extractEntryFileHints(entry: StoredGenerationEntry): string[] {
  const files: string[] = [];
  const data = entry.data;
  if (Array.isArray(data.errors)) {
    for (const error of data.errors) {
      if (error && typeof error === "object" && typeof (error as { file?: unknown }).file === "string") {
        files.push(((error as { file: string }).file).trim());
      }
    }
  }
  if (Array.isArray(data.residualErrors)) {
    for (const error of data.residualErrors) {
      if (error && typeof error === "object" && typeof (error as { file?: unknown }).file === "string") {
        files.push(((error as { file: string }).file).trim());
      }
    }
  }
  const candidates = [
    readString(data.file),
    readString(data.currentScaffoldId),
  ].filter((value): value is string => Boolean(value));
  files.push(...candidates);
  return files.filter(Boolean);
}

function buildRunFixPatterns(entries: StoredGenerationEntry[]): RunFixPattern[] {
  const buckets = new Map<string, {
    count: number;
    sources: Record<string, number>;
    fileCounts: Record<string, number>;
    latestTs: string | null;
    example: string | null;
  }>();

  for (const entry of entries) {
    const type = readString(entry.data.type) || "unknown";
    const fileHints = extractEntryFileHints(entry);

    const candidates: string[] = [];
    if (Array.isArray(entry.data.errors)) {
      for (const error of entry.data.errors) {
        if (typeof error === "string") {
          candidates.push(error);
        } else if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
          candidates.push((error as { message: string }).message);
        }
      }
    }
    if (Array.isArray(entry.data.residualErrors)) {
      for (const error of entry.data.residualErrors) {
        if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
          candidates.push((error as { message: string }).message);
        }
      }
    }
    if (type === "server-verify.policy" && Array.isArray(entry.data.findings)) {
      for (const finding of entry.data.findings) {
        if (!finding || typeof finding !== "object") continue;
        const id = readString((finding as { id?: unknown }).id);
        const detail = readString((finding as { detail?: unknown }).detail);
        const candidate = [id, detail].filter(Boolean).join(": ");
        if (candidate) candidates.push(candidate);
      }
    }
    const directReason = readString(entry.data.reason);
    const directMessage = readString(entry.data.message);
    if (type === "syntax-validation.early-stop" && directReason) candidates.push(directReason);
    if (type.includes("error") && directMessage) candidates.push(directMessage);

    for (const candidate of candidates) {
      const pattern = normalizeErrorPattern(candidate);
      const bucket = buckets.get(pattern) ?? {
        count: 0,
        sources: {},
        fileCounts: {},
        latestTs: null,
        example: null,
      };
      bucket.count += 1;
      bucket.sources[type] = (bucket.sources[type] ?? 0) + 1;
      for (const file of fileHints) {
        bucket.fileCounts[file] = (bucket.fileCounts[file] ?? 0) + 1;
      }
      bucket.latestTs = entry.ts;
      if (!bucket.example) bucket.example = candidate;
      buckets.set(pattern, bucket);
    }
  }

  return [...buckets.entries()]
    .map(([pattern, bucket]) => ({
      pattern,
      occurrences: bucket.count,
      sources: bucket.sources,
      files: Object.entries(bucket.fileCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([file, count]) => ({ file, count })),
      latestTs: bucket.latestTs,
      example: bucket.example,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.pattern.localeCompare(b.pattern))
    .slice(0, 20);
}

export function buildRunObservabilitySnapshot(runId: string, entries: StoredGenerationEntry[]): RunObservabilitySnapshot {
  const meta = buildMeta(entries);
  const highlights = buildHighlights(entries);
  const faultFixRows = collectFaultFixRows(entries);
  const bySeverity: Record<string, number> = {};
  const fixerCounts: Record<string, number> = {};
  let unresolved = 0;
  for (const row of faultFixRows) {
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
    if (row.resolved !== "true") unresolved += 1;
    if (row.fixer && row.fixer !== "-") {
      fixerCounts[row.fixer] = (fixerCounts[row.fixer] ?? 0) + 1;
    }
  }

  return {
    runId,
    chatId: readString(meta.chatId) || "-",
    versionId: readString(meta.versionId),
    status: readString(meta.status) || "unknown",
    statusReason: readString(meta.statusReason),
    startedAt: readString(meta.startedAt),
    updatedAt: readString(meta.updatedAt),
    generationKind: readString(meta.generationKind),
    modelId: readString(meta.modelId),
    buildIntent: readString(meta.buildIntent),
    buildMethod: readString(meta.buildMethod),
    promptStrategy: readString(meta.promptStrategy),
    promptType: readString(meta.promptType),
    promptSource: readString(meta.promptSource),
    preflight: (meta.preflight as Record<string, unknown> | null) ?? null,
    verifier: (meta.verifier as Record<string, unknown> | null) ?? null,
    serverVerify: (meta.serverVerify as Record<string, unknown> | null) ?? null,
    highlights,
    faultFixSummary: {
      total: faultFixRows.length,
      unresolved,
      bySeverity,
    },
    appliedFixers: Object.entries(fixerCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([fixer, count]) => ({ fixer, count })),
    recurringPatterns: buildRunFixPatterns(entries),
  };
}

export function updateSiteObservability(runDir: string, snapshot: RunObservabilitySnapshot): void {
  const chatId = snapshot.chatId.trim();
  if (!chatId || chatId === "-") return;
  ensureSiteObservabilityDir();
  const siteDir = path.join(SITE_OBSERVABILITY_DIR, chatId);
  const latestDir = path.join(siteDir, SITE_LATEST_DIR);
  fs.mkdirSync(latestDir, { recursive: true });

  const historyPath = path.join(siteDir, SITE_HISTORY_FILE);
  const existing = fs.existsSync(historyPath)
    ? fs.readFileSync(historyPath, "utf8").split(/\r?\n/).filter(Boolean)
    : [];
  const existingRecords = existing
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    })
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .filter((record) => readString(record.runId) !== snapshot.runId);

  const nextPromptSource = snapshot.promptSource;
  const nextGenerationKind = snapshot.generationKind;
  const nextIsAutoRepair = nextPromptSource === "auto_repair";
  const nextIsFollowup = nextGenerationKind === "followup" && !nextIsAutoRepair;

  let followupCount = 0;
  let autoRepairCount = 0;
  for (const record of existingRecords) {
    const countedFollowups = readNumber(record.followupCount);
    const countedAutoRepairs = readNumber(record.autoRepairCount);
    if (countedFollowups !== null) followupCount = countedFollowups;
    if (countedAutoRepairs !== null) autoRepairCount = countedAutoRepairs;
    if (countedFollowups !== null || countedAutoRepairs !== null) continue;
    const promptSource = readString(record.promptSource);
    const generationKind = readString(record.generationKind);
    if (promptSource === "auto_repair") {
      autoRepairCount += 1;
      continue;
    }
    if (generationKind === "followup") {
      followupCount += 1;
    }
  }

  const nextRecord = {
    runId: snapshot.runId,
    versionId: snapshot.versionId,
    status: snapshot.status,
    updatedAt: snapshot.updatedAt,
    generationKind: nextGenerationKind,
    promptSource: nextPromptSource,
    followupCount: followupCount + (nextIsFollowup ? 1 : 0),
    autoRepairCount: autoRepairCount + (nextIsAutoRepair ? 1 : 0),
    highlights: snapshot.highlights,
    faultFixSummary: snapshot.faultFixSummary,
    recurringPatterns: snapshot.recurringPatterns.slice(0, 10),
  };
  const deduped = [...existingRecords, nextRecord]
    .slice(-MAX_SITE_HISTORY_RUNS)
    .map((record) => JSON.stringify(record));
  fs.writeFileSync(historyPath, deduped.join("\n") + "\n", "utf8");

  // Dedup: timeline/meta/summary/fault-fix-index.{csv,md} skrevs förut till
  // BÅDE generationslogg/<run>/ OCH hit. Inga konsumenter läser kopiorna här
  // — de är redundans. Vi behåller bara observability.json, fix-patterns.json
  // och history-raden ovan, plus en _source_run.txt-pekare. Behöver du
  // råfilerna: följ pekaren till logs/generationslogg/<run>/.
  fs.writeFileSync(
    path.join(latestDir, OBSERVABILITY_FILE),
    JSON.stringify(snapshot, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(latestDir, FIX_PATTERNS_FILE),
    JSON.stringify(snapshot.recurringPatterns, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(latestDir, "_source_run.txt"),
    `${path.basename(runDir)}\n`,
    "utf8",
  );

  // LRU-prune: cap antalet chat-mappar under site-observability/. Förut
  // växte detta linjärt med antalet unika chats för evigt.
  lruPruneSubdirs(SITE_OBSERVABILITY_DIR, MAX_SITE_OBSERVABILITY_CHATS);
}

/**
 * Returns the recurring failure patterns observed for a given chatId across
 * its previous runs (read from `logs/site-observability/<chatId>/latest/
 * fix-patterns.json`). Used by the LLM fixer to avoid repeating the same
 * fix attempt that already failed N times in this site.
 *
 * Returns `[]` when the file is missing, malformed, or the chatId is empty.
 * Never throws — fix feedback is best-effort and must not break repair.
 */
export function readRecurringPatternsForChat(
  chatId: string | null | undefined,
): RunFixPattern[] {
  const trimmed = (chatId ?? "").trim();
  if (!trimmed || trimmed === "-") return [];
  try {
    const filePath = path.join(
      SITE_OBSERVABILITY_DIR,
      trimmed,
      SITE_LATEST_DIR,
      FIX_PATTERNS_FILE,
    );
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RunFixPattern =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { pattern?: unknown }).pattern === "string" &&
        typeof (item as { occurrences?: unknown }).occurrences === "number",
    );
  } catch {
    return [];
  }
}
