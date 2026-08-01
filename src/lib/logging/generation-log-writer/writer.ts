import fs from "node:fs";
import path from "node:path";
import { normalizeSlug } from "../shared";
import {
  FAULT_FIX_CSV_FILE,
  FAULT_FIX_FILE,
  FIX_PATTERNS_FILE,
  META_FILE,
  OBSERVABILITY_FILE,
  SUMMARY_FILE,
  TIMELINE_FILE,
} from "./constants";
import { readString } from "./entry-fields";
import {
  appendGlobalFaultFixCsv,
  buildFaultFixCsv,
  buildFaultFixIndex,
  collectFaultFixRows,
} from "./fault-fix-index";
import { isGenerationLogEnabled } from "./flags";
import {
  buildRunObservabilitySnapshot,
  updateSiteObservability,
} from "./observability";
import { resolveRunDir } from "./run-routing";
import { buildMeta } from "./status";
import { buildSummary } from "./summaries";
import {
  appendNdjsonLine,
  readRunEntries,
  trimRunEntries,
  writeNdjson,
} from "./timeline-store";
import type { GenerationLogTarget, StoredGenerationEntry } from "./types";

export function writeGenerationLogEntry(params: {
  target: GenerationLogTarget;
  ts: string;
  slug: string | null;
  summary: string | null;
  data: Record<string, unknown>;
}): void {
  if (!isGenerationLogEnabled()) return;

  try {
    const entry: StoredGenerationEntry = {
      ts: params.ts,
      target: params.target,
      slug: normalizeSlug(params.slug),
      summary: readString(params.summary),
      data: params.data,
    };
    const runDir = resolveRunDir(entry);
    if (!runDir) return;
    fs.mkdirSync(runDir, { recursive: true });

    const timelinePath = path.join(runDir, TIMELINE_FILE);
    appendNdjsonLine(timelinePath, entry);
    const entries = trimRunEntries(readRunEntries(runDir));
    const faultFixRows = collectFaultFixRows(entries);
    const runId = path.basename(runDir);
    const runSnapshot = buildRunObservabilitySnapshot(runId, entries);
    const summaryMarkdown = buildSummary(runDir, entries);
    writeNdjson(timelinePath, entries);
    fs.writeFileSync(path.join(runDir, META_FILE), JSON.stringify(buildMeta(entries), null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(runDir, SUMMARY_FILE), summaryMarkdown, "utf8");
    fs.writeFileSync(path.join(runDir, OBSERVABILITY_FILE), JSON.stringify(runSnapshot, null, 2) + "\n", "utf8");
    fs.writeFileSync(
      path.join(runDir, FIX_PATTERNS_FILE),
      JSON.stringify(runSnapshot.recurringPatterns, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(path.join(runDir, FAULT_FIX_FILE), buildFaultFixIndex(entries), "utf8");
    fs.writeFileSync(path.join(runDir, FAULT_FIX_CSV_FILE), buildFaultFixCsv(faultFixRows), "utf8");
    appendGlobalFaultFixCsv(faultFixRows);
    updateSiteObservability(runDir, runSnapshot);
  } catch (err) {
    console.warn(
      "[generationslogg] writeGenerationLogEntry failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
