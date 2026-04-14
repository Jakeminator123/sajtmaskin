import fs from "node:fs";
import path from "node:path";
import { normalizeErrorPattern } from "@/lib/gen/autofix/types";

type GenerationLogTarget = "in-progress" | "latest";

type StoredGenerationEntry = {
  ts: string;
  target: GenerationLogTarget;
  slug: string | null;
  summary: string | null;
  data: Record<string, unknown>;
};

const ROOT_DIR = path.join(process.cwd(), "logs", "generationslogg");
const SITE_OBSERVABILITY_DIR = path.join(process.cwd(), "logs", "site-observability");
const LEGACY_INDEX_DIR = path.join(process.cwd(), "logs", "llm-segmentts-and-index");
const TIMELINE_FILE = "timeline.ndjson";
const SUMMARY_FILE = "summary.md";
const META_FILE = "meta.json";
const OBSERVABILITY_FILE = "observability.json";
const FIX_PATTERNS_FILE = "fix-patterns.json";
const LATEST_FILE = "_latest.txt";
const FAULT_FIX_CSV_FILE = "fault-fix-index.csv";
const GLOBAL_ERROR_LOG_CSV_FILE = "error-log.csv";
const SITE_HISTORY_FILE = "history.ndjson";
const SITE_LATEST_DIR = "latest";
const FALSE_VALUES = new Set(["0", "false", "off", "no"]);
const MAX_RUN_DIRS = 3;
const MAX_TIMELINE_ENTRIES_PER_RUN = 1_000;
const MAX_SUMMARY_TIMELINE_ROWS = 180;
const MAX_SITE_HISTORY_RUNS = 50;
const runDirBySlug = new Map<string, string>();
const runDirByChatId = new Map<string, string>();

type RunFixPattern = {
  pattern: string;
  occurrences: number;
  sources: Record<string, number>;
  files: Array<{ file: string; count: number }>;
  latestTs: string | null;
  example: string | null;
};

type RunObservabilitySnapshot = {
  runId: string;
  chatId: string;
  versionId: string | null;
  status: string;
  startedAt: string | null;
  updatedAt: string | null;
  generationKind: string | null;
  modelId: string | null;
  buildIntent: string | null;
  buildMethod: string | null;
  promptStrategy: string | null;
  promptType: string | null;
  preflight: Record<string, unknown> | null;
  verifier: Record<string, unknown> | null;
  serverVerify: Record<string, unknown> | null;
  highlights: string[];
  faultFixSummary: {
    total: number;
    unresolved: number;
    bySeverity: Record<string, number>;
  };
  appliedFixers: Array<{ fixer: string; count: number }>;
  recurringPatterns: RunFixPattern[];
};

function normalizeFlag(value: string | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isGenerationLogEnabled(): boolean {
  const raw = normalizeFlag(process.env.GENERATIONSLOGG);
  if (!raw || FALSE_VALUES.has(raw)) return false;
  return process.env.NODE_ENV !== "production";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function formatErrorDetails(data: Record<string, unknown>, maxItems = 3): string {
  const errors = Array.isArray(data.errors) ? data.errors : [];
  if (errors.length === 0) return `${readNumber(data.errorCount) ?? "?"} syntaxfel`;
  const items = errors.slice(0, maxItems).map((err: unknown) => {
    if (typeof err === "string") return err;
    const e = err as Record<string, unknown>;
    const file = readString(e.file) ?? "?";
    const line = readNumber(e.line) ?? "?";
    const msg = readString(e.message) ?? "?";
    return `${file}:${line}: ${msg}`;
  });
  const rest = errors.length > maxItems ? ` … +${errors.length - maxItems} till` : "";
  return items.join("; ") + rest;
}

function normalizeSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || null;
}

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

function ensureRootDir(): void {
  if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR, { recursive: true });
  }
}

function ensureLegacyIndexDir(): void {
  if (!fs.existsSync(LEGACY_INDEX_DIR)) {
    fs.mkdirSync(LEGACY_INDEX_DIR, { recursive: true });
  }
}

function ensureSiteObservabilityDir(): void {
  if (!fs.existsSync(SITE_OBSERVABILITY_DIR)) {
    fs.mkdirSync(SITE_OBSERVABILITY_DIR, { recursive: true });
  }
}

function pruneOldRunDirs(): void {
  try {
    const entries = fs
      .readdirSync(ROOT_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    if (entries.length <= MAX_RUN_DIRS) return;
    const toRemove = entries.slice(0, entries.length - MAX_RUN_DIRS);
    for (const name of toRemove) {
      fs.rmSync(path.join(ROOT_DIR, name), { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(
      "[generationslogg] pruneOldRunDirs failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function createRunDir(ts: string, slug: string | null): string {
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

function appendNdjsonLine(filePath: string, entry: StoredGenerationEntry): void {
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

function writeNdjson(filePath: string, entries: StoredGenerationEntry[]): void {
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(filePath, body ? `${body}\n` : "", "utf8");
}

function readRunEntries(dir: string): StoredGenerationEntry[] {
  const filePath = path.join(dir, TIMELINE_FILE);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: StoredGenerationEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.ts === "string" &&
        (parsed.target === "in-progress" || parsed.target === "latest") &&
        parsed.data &&
        typeof parsed.data === "object" &&
        !Array.isArray(parsed.data)
      ) {
        entries.push({
          ts: parsed.ts,
          target: parsed.target,
          slug: readString(parsed.slug),
          summary: readString(parsed.summary),
          data: parsed.data as Record<string, unknown>,
        });
      }
    } catch {
      // Skip broken lines instead of breaking runtime logging.
    }
  }
  return entries;
}

function findLatestByType(
  entries: StoredGenerationEntry[],
  types: string[],
): StoredGenerationEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const type = readString(entries[i].data.type);
    if (type && types.includes(type)) return entries[i];
  }
  return null;
}

function findLastString(entries: StoredGenerationEntry[], key: string): string | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const value = readString(entries[i].data[key]);
    if (value) return value;
  }
  return null;
}

function findLastNumber(entries: StoredGenerationEntry[], key: string): number | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const value = readNumber(entries[i].data[key]);
    if (value !== null) return value;
  }
  return null;
}

function findLastBoolean(entries: StoredGenerationEntry[], key: string): boolean | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const value = readBoolean(entries[i].data[key]);
    if (value !== null) return value;
  }
  return null;
}

function resolveStatus(entries: StoredGenerationEntry[]): string {
  const hasDone = findLatestByType(entries, ["site.done", "site.message.done"]);
  if (hasDone) return "done";
  const finalType = readString(entries.at(-1)?.data.type);
  if (finalType === "site.awaiting_input") return "awaiting_input";
  if (finalType === "site.empty_generation") return "empty_generation";
  if (finalType === "site.partial_file_output") return "error_signal";
  const errorLike = entries.some((entry) => {
    const type = readString(entry.data.type) || "";
    return type.includes("error") || type.includes("failed") || type.includes("gave-up");
  });
  return errorLike ? "error_signal" : "in_progress";
}

function buildMeta(entries: StoredGenerationEntry[]): Record<string, unknown> {
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

  return {
    status: resolveStatus(entries),
    startedAt: entries[0]?.ts ?? null,
    updatedAt: entries.at(-1)?.ts ?? null,
    slug: findLastString(entries, "slug") ?? start?.slug ?? null,
    chatId: findLastString(entries, "chatId"),
    versionId: findLastString(entries, "versionId"),
    generationKind: readString(start?.data.generationKind),
    modelId: findLastString(entries, "modelId"),
    thinking: findLastBoolean(entries, "thinking"),
    imageGenerations: findLastBoolean(entries, "imageGenerations"),
    promptStrategy: readString(latestRequest?.data.promptStrategy) ?? findLastString(entries, "promptStrategy"),
    promptType: readString(latestRequest?.data.promptType) ?? findLastString(entries, "promptType"),
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

type FaultFixRow = {
  ts: string;
  phase: string;
  step: string;
  severity: string;
  createdBy: string;
  fixedBy: string;
  modelTier: string;
  problem: string;
  action: string;
  model: string;
  provider: string;
  pass: string;
  outcome: string;
  chatId: string;
  versionId: string;
  lineageHash: string;
  scaffoldId: string;
  serializeMode: string;
  styleDirection: string;
  file: string;
  fixer: string;
  resolved: string;
};

const EMPTY_CONTEXT_COLS: Pick<FaultFixRow, "scaffoldId" | "serializeMode" | "styleDirection" | "file" | "fixer" | "resolved"> = {
  scaffoldId: "-",
  serializeMode: "-",
  styleDirection: "-",
  file: "-",
  fixer: "-",
  resolved: "-",
};

function faultFixTimestamp(e: StoredGenerationEntry): string {
  return readString(e.ts) || new Date().toISOString();
}

const FAULT_FIX_TYPES: Record<string, (e: StoredGenerationEntry) => FaultFixRow | FaultFixRow[] | null> = {
  "autofix.result": (e) => {
    const fixEntries = Array.isArray(e.data.fixes) ? (e.data.fixes as Array<{ fixer?: string; description?: string; file?: string }>) : [];
    const warnings = Array.isArray(e.data.warnings) ? e.data.warnings.length : 0;
    if (fixEntries.length === 0 && warnings === 0) return null;
    const chatId = readString(e.data.chatId) || "-";
    const versionId = readString(e.data.versionId) || "-";
    const lineageHash = readString(e.data.lineageHash) || "-";
    const scaffoldId = readString(e.data.scaffoldId) || "-";
    const modelTier = readString(e.data.resolvedTier) || "-";
    const rows: FaultFixRow[] = fixEntries.map((fix) => ({
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: `Autofix: ${readString(fix.fixer) || "unknown"}`,
      severity: "info",
      createdBy: "deterministic-autofix",
      fixedBy: "deterministic-autofix",
      modelTier,
      problem: readString(fix.description) || "autofix",
      action: "Deterministisk autofix",
      model: "-",
      provider: "-",
      pass: "-",
      outcome: "OK",
      chatId,
      versionId,
      lineageHash,
      ...EMPTY_CONTEXT_COLS,
      scaffoldId,
      file: readString(fix.file) || "-",
      fixer: readString(fix.fixer) || "-",
      resolved: "true",
    }));
    if (rows.length > 0) {
      rows.push({
        ts: faultFixTimestamp(e),
        phase: "phase-3",
        step: "Autofix",
        severity: "info",
        createdBy: "deterministic-autofix",
        fixedBy: "deterministic-autofix",
        modelTier,
        problem: `${fixEntries.length} fix(ar), ${warnings} varning(ar)`,
        action: "Deterministisk autofix (sammanfattning)",
        model: "-",
        provider: "-",
        pass: "-",
        outcome: "OK",
        chatId,
        versionId,
        lineageHash,
        ...EMPTY_CONTEXT_COLS,
        scaffoldId,
      });
    }
    return rows;
  },
  "autofix.heavy_load": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Autofix",
    severity: "warning",
    createdBy: "deterministic-autofix",
    fixedBy: "-",
    modelTier: "-",
    problem: `Mycket fixar (${readNumber(e.data.fixCount) ?? "?"})`,
    action: "Notering: instabilitet i generering",
    model: "-",
    provider: "-",
    pass: "-",
    outcome: "Varning",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
  }),
  "syntax-validation.pass": (e) => {
    const phase = readString(e.data.phase);
    const errorCount = readNumber(e.data.errorCount);
    if (phase === "invalid" && errorCount && errorCount > 0) {
      return {
        ts: faultFixTimestamp(e),
        phase: "phase-3",
        step: `Syntaxvalidering (pass ${readNumber(e.data.pass) ?? "?"})`,
        severity: "error",
        createdBy: "syntax-validator",
        fixedBy: "-",
        modelTier: "-",
        problem: formatErrorDetails(e.data),
        action: "Validering flaggade fel",
        model: "-",
        provider: "-",
        pass: String(readNumber(e.data.pass) ?? "-"),
        outcome: "Fel hittade",
        chatId: "-",
        versionId: "-",
        lineageHash: "-",
        ...EMPTY_CONTEXT_COLS,
        resolved: "false",
      };
    }
    return null;
  },
  "syntax-validation.fixer.start": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "warning",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: formatErrorDetails(e.data),
    action: "LLM fixer startad",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Startad",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: "false",
  }),
  "syntax-validation.fixer.result": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: readBoolean(e.data.valid) ? "info" : readBoolean(e.data.improved) ? "warning" : "error",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: `${readNumber(e.data.errorsBefore) ?? "?"} -> ${readNumber(e.data.errorsAfter) ?? "?"} fel`,
    action: readBoolean(e.data.improved) ? "Fixer förbättrade koden" : "Fixer kunde inte förbättra",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: readBoolean(e.data.valid) ? "OK" : readBoolean(e.data.improved) ? "Delvis" : "Misslyckades",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: (readNumber(e.data.errorsAfter) ?? 1) === 0 ? "true" : "false",
  }),
  "syntax-validation.fixer.error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "error",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: readString(e.data.message) || "Okänt fel",
    action: "Fixer kraschade",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Krasch",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: "false",
  }),
  "syntax-validation.fixer.noop": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "warning",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel kvar`,
    action: "Fixer returnerade ingen fix",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Noop",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: "false",
  }),
  "syntax-validation.gave-up": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `Syntaxvalidering (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "error",
    createdBy: "syntax-validator",
    fixedBy: "-",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel kvar`,
    action: "Max pass nått — gav upp",
    model: readString(e.data.fixerModel) || readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Gav upp",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "syntax-validation.early-stop": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Syntaxvalidering",
    severity: "warning",
    createdBy: "syntax-validator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.reason) || "tidig stop",
    action: `Stoppade tidigt: ${readString(e.data.reason) || "-"}`,
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Stoppade",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "syntax-validation.pipeline-error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Syntaxpipeline",
    severity: "error",
    createdBy: "syntax-validator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Pipeline-fel",
    action: "Pipeline kunde ej köras",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Pipeline-fel",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "autofix.mechanical-residual": (e) => {
    const residualCount = readNumber(e.data.residualErrorCount);
    if (!residualCount || residualCount === 0) return null;
    const residualErrors = Array.isArray(e.data.residualErrors) ? e.data.residualErrors : [];
    const topPatterns = residualErrors
      .slice(0, 5)
      .map((err: unknown) => {
        const r = err as Record<string, unknown>;
        return readString(r.pattern) || readString(r.message) || "?";
      })
      .join("; ");
    return {
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: "Mekanisk residual",
      severity: "warning",
      createdBy: "mechanical-autofix",
      fixedBy: "-",
      modelTier: "-",
      problem: `${residualCount} fel kvar efter ${readNumber(e.data.mechanicalFixCount) ?? 0} mekaniska fixar: ${topPatterns}`,
      action: "Mekaniska fixar räckte inte — eskaleras till LLM-fix",
      model: "-",
      provider: "-",
      pass: "-",
      outcome: "Residual",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      resolved: "false",
    };
  },
  "file-repair": (e) => {
    const fixes = Array.isArray(e.data.fixes) ? e.data.fixes.length : 0;
    if (fixes === 0) return null;
    return {
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: "Filreparation (preflight)",
      severity: "info",
      createdBy: "preflight",
      fixedBy: "deterministic-autofix",
      modelTier: "-",
      problem: `${fixes} reparation(er)`,
      action: "Deterministisk filreparation",
      model: "-",
      provider: "-",
      pass: "-",
      outcome: "OK",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      fixer: "deterministic-autofix",
      resolved: "true",
    };
  },
  "merged-syntax.invalid": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Merged syntax",
    severity: "error",
    createdBy: "preflight",
    fixedBy: "-",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel i merged projekt`,
    action: "Merged syntax flaggade fel",
    model: "-",
    provider: "-",
    pass: "-",
    outcome: "Fel hittade",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "merged-syntax.fixed": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Merged syntax fixer",
    severity: readNumber(e.data.errorsAfter) === 0 ? "info" : "warning",
    createdBy: "preflight",
    fixedBy: readString(e.data.fixerModel) ? "llm-fixer" : "deterministic-autofix",
    modelTier: "-",
    problem: `${readNumber(e.data.errorsBefore) ?? "?"} -> ${readNumber(e.data.errorsAfter) ?? "?"} fel`,
    action: "Merged syntax reparation",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: readNumber(e.data.errorsAfter) === 0 ? "OK" : "Delvis",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: readString(e.data.fixerModel) ? "llm-fixer" : "deterministic-autofix",
    resolved: (readNumber(e.data.errorsAfter) ?? 1) === 0 ? "true" : "false",
  }),
  "verifier-pass": (e) => {
    const blockingFindings = Array.isArray(e.data.blockingFindings) ? (e.data.blockingFindings as Array<{ id?: string; detail?: string }>) : [];
    const qualityFindings = Array.isArray(e.data.qualityFindings) ? (e.data.qualityFindings as Array<{ id?: string; detail?: string }>) : [];
    const blockingCount = readNumber(e.data.blocking) ?? blockingFindings.length;
    const qualityCount = readNumber(e.data.quality) ?? qualityFindings.length;
    const summaryRow: FaultFixRow = {
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: "Verifier-pass",
      severity: blockingCount > 0 ? "warning" : qualityCount > 0 ? "info" : "info",
      createdBy: "verifier-pass",
      fixedBy: "-",
      modelTier: "-",
      problem: `blocking=${blockingCount}, quality=${qualityCount}`,
      action: "Read-only kvalitetsgranskning",
      model: readString(e.data.model) || "-",
      provider: readString(e.data.provider) || "-",
      pass: "-",
      outcome: blockingCount > 0 ? "Signaler" : "OK",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      resolved: "false",
    };
    const findingRows: FaultFixRow[] = blockingFindings.slice(0, 5).map((f) => ({
      ...summaryRow,
      step: `Verifier: ${readString(f.id) || "finding"}`,
      severity: "warning",
      problem: readString(f.detail) || readString(f.id) || "blocking finding",
      action: "Blockerande kvalitetssignal",
    }));
    const qualityRows: FaultFixRow[] = qualityFindings.slice(0, 5).map((f) => ({
      ...summaryRow,
      step: `Verifier: ${readString(f.id) || "finding"}`,
      severity: "info",
      problem: readString(f.detail) || readString(f.id) || "quality finding",
      action: "Kvalitetssignal",
    }));
    return [summaryRow, ...findingRows, ...qualityRows];
  },
  "scaffold-retry.suggested": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Scaffold retry",
    severity: "warning",
    createdBy: "preflight",
    fixedBy: "server-repair",
    modelTier: "-",
    problem: readString(e.data.failureType) || "scaffold-problem",
    action: `${readString(e.data.currentScaffoldId) || "-"} -> ${readString(e.data.suggestedScaffoldId) || "-"}`,
    model: "-",
    provider: "-",
    pass: "-",
    outcome: readString(e.data.confidence) || "föreslagen",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    scaffoldId: readString(e.data.currentScaffoldId) || "-",
  }),
  "preflight.version.failed": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Preflight",
    severity: "error",
    createdBy: "preflight",
    fixedBy: "-",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} preflight-fel`,
    action: "Version misslyckades i preflight",
    model: "-",
    provider: "-",
    pass: "-",
    outcome: "Misslyckades",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "preview-preflight.error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-4",
    step: "Preview preflight",
    severity: "error",
    createdBy: "preview-preflight",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || readString(e.data.reason) || "Preview preflight failed",
    action: "Preview-start blocker identifierad",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Blockerad",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "project-sanity.error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-4",
    step: "Project sanity",
    severity: "error",
    createdBy: "project-sanity",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || readString(e.data.reason) || "Project sanity failure",
    action: "Sanity-kontroll flaggade blockerande fel",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Fel",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    file: readString(e.data.file) || "-",
    resolved: "false",
  }),
  "site.empty_generation": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Finalize",
    severity: "error",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Tom generation efter finalize",
    action: "Generation stoppades innan version sparades",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Ingen version",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "site.partial_file_output": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Finalize",
    severity: "error",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Partial file output upptäckt",
    action: "Fail-fast skydd stoppade versionssave",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Ingen version",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "site.awaiting_input": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Awaiting input",
    severity: "warning",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || readString(e.data.reason) || "Generatorn behöver användarinput",
    action: "Blockerande fråga presenterades i stället för automatisk fix",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Väntar på input",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "server-verify.policy": (e) => {
    if (readBoolean(e.data.run) !== false) return null;
    return {
      ts: faultFixTimestamp(e),
      phase: "phase-4",
      step: "Background verify",
      severity: "info",
      createdBy: "server-verify",
      fixedBy: "-",
      modelTier: "-",
      problem: readString(e.data.reason) || "Background verify skipped",
      action: "Server verify hoppades över enligt policy",
      model: readString(e.data.model) || "-",
      provider: readString(e.data.provider) || "-",
      pass: "-",
      outcome: "Skippad",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      resolved: "true",
    };
  },
  "comm.error.create": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-1",
    step: "Kommunikation",
    severity: "error",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Kommunikationsfel",
    action: "Fel vid skapande",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Fel",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
};

function findLastStringAtOrBefore(
  entries: StoredGenerationEntry[],
  endIndex: number,
  key: string,
): string | null {
  for (let i = endIndex; i >= 0; i -= 1) {
    const value = readString(entries[i]?.data[key]);
    if (value) return value;
  }
  return null;
}

function inferProvider(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (!normalized || normalized === "-") return "-";
  if (
    normalized.includes("gpt") ||
    normalized.includes("openai") ||
    normalized.includes("o1") ||
    normalized.includes("o3") ||
    normalized.includes("o4")
  ) {
    return "OpenAI";
  }
  if (normalized.includes("claude") || normalized.includes("anthropic")) {
    return "Anthropic";
  }
  if (normalized.includes("gemini") || normalized.includes("google")) {
    return "Google";
  }
  return "-";
}

function enrichFaultFixRow(
  row: FaultFixRow,
  entries: StoredGenerationEntry[],
  entryIndex: number,
): FaultFixRow {
  const modelTier = findLastStringAtOrBefore(entries, entryIndex, "modelId") || row.modelTier;
  const model = row.model !== "-" ? row.model : "-";
  return {
    ...row,
    modelTier: modelTier || "-",
    provider: row.provider !== "-" ? row.provider : inferProvider(model),
    chatId: findLastStringAtOrBefore(entries, entryIndex, "chatId") || row.chatId,
    versionId: findLastStringAtOrBefore(entries, entryIndex, "versionId") || row.versionId,
    lineageHash: findLastStringAtOrBefore(entries, entryIndex, "lineageHash") || row.lineageHash,
    scaffoldId: row.scaffoldId !== "-" ? row.scaffoldId : (findLastStringAtOrBefore(entries, entryIndex, "scaffoldId") || "-"),
    serializeMode: row.serializeMode !== "-" ? row.serializeMode : (findLastStringAtOrBefore(entries, entryIndex, "serializeMode") || "-"),
    styleDirection: row.styleDirection !== "-" ? row.styleDirection : (findLastStringAtOrBefore(entries, entryIndex, "styleDirection") || "-"),
  };
}

function collectFaultFixRows(entries: StoredGenerationEntry[]): FaultFixRow[] {
  const rows: FaultFixRow[] = [];
  for (const [entryIndex, entry] of entries.entries()) {
    const type = readString(entry.data.type);
    if (!type) continue;
    const handler = FAULT_FIX_TYPES[type];
    if (!handler) continue;
    const result = handler(entry);
    if (!result) continue;
    const batch = Array.isArray(result) ? result : [result];
    for (const row of batch) {
      rows.push(enrichFaultFixRow(row, entries, entryIndex));
    }
  }
  return rows;
}

function buildFaultFixIndex(entries: StoredGenerationEntry[]): string {
  const rows = collectFaultFixRows(entries);

  if (rows.length === 0) {
    return [
      "# Fault & Fix Index",
      "",
      "Inga fel, fixar eller reparationer loggade under denna körning.",
      "",
    ].join("\n");
  }

  const header =
    "| Tid | Fas | Steg | Severity | Skapad av | Fixad av | Modellnivå | Modell | Provider | Pass | Problem | Åtgärd | Resultat | Chat | Version | Lineage |";
  const sep =
    "|-----|-----|------|----------|-----------|----------|------------|--------|----------|------|---------|--------|----------|------|---------|---------|";
  const tableRows = rows.map(
    (r) =>
      `| ${r.ts} | ${r.phase} | ${r.step} | ${r.severity} | ${r.createdBy} | ${r.fixedBy} | ${r.modelTier} | ${r.model} | ${r.provider} | ${r.pass} | ${r.problem} | ${r.action} | ${r.outcome} | ${r.chatId} | ${r.versionId} | ${r.lineageHash} |`,
  );

  return [
    "# Fault & Fix Index",
    "",
    `Totalt ${rows.length} händelse(r) under denna körning.`,
    "",
    header,
    sep,
    ...tableRows,
    "",
  ].join("\n");
}

const FAULT_FIX_FILE = "fault-fix-index.md";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const FAULT_FIX_CSV_HEADER = [
  "time",
  "phase",
  "step",
  "severity",
  "created_by",
  "fixed_by",
  "model_tier",
  "model",
  "provider",
  "pass",
  "problem",
  "action",
  "outcome",
  "chat_id",
  "version_id",
  "lineage_hash",
  "scaffold_id",
  "serialize_mode",
  "style_direction",
  "file",
  "fixer",
  "resolved",
].join(",");

function faultFixRowToCsvLine(row: FaultFixRow): string {
  return [
    row.ts,
    row.phase,
    row.step,
    row.severity,
    row.createdBy,
    row.fixedBy,
    row.modelTier,
    row.model,
    row.provider,
    row.pass,
    row.problem,
    row.action,
    row.outcome,
    row.chatId,
    row.versionId,
    row.lineageHash,
    row.scaffoldId,
    row.serializeMode,
    row.styleDirection,
    row.file,
    row.fixer,
    row.resolved,
  ]
    .map((cell) => escapeCsv(cell))
    .join(",");
}

function buildFaultFixCsv(rows: FaultFixRow[]): string {
  const lines = rows.map(faultFixRowToCsvLine);
  return [FAULT_FIX_CSV_HEADER, ...lines].join("\n") + "\n";
}

function appendGlobalFaultFixCsv(rows: FaultFixRow[]): void {
  ensureLegacyIndexDir();
  const csvPath = path.join(LEGACY_INDEX_DIR, GLOBAL_ERROR_LOG_CSV_FILE);
  const existingLines = fs.existsSync(csvPath)
    ? fs
        .readFileSync(csvPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
    : [];

  const existingBody = existingLines.length > 0 && existingLines[0] === FAULT_FIX_CSV_HEADER
    ? existingLines.slice(1)
    : existingLines;
  const mergedLines = [...new Set([
    ...existingBody,
    ...rows.map(faultFixRowToCsvLine),
  ])];
  fs.writeFileSync(
    csvPath,
    [FAULT_FIX_CSV_HEADER, ...mergedLines].join("\n") + "\n",
    "utf8",
  );
}

function buildHighlights(entries: StoredGenerationEntry[]): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    const type = readString(entry.data.type) || "";
    if (
      type === "comm.error.create" ||
      type === "preview-preflight.error" ||
      type === "project-sanity.error" ||
      type === "syntax-validation.pipeline-error" ||
      type === "syntax-validation.gave-up" ||
      type === "preflight.version.failed" ||
      type === "site.empty_generation" ||
      type === "site.partial_file_output" ||
      type === "site.awaiting_input"
    ) {
      const message = readString(entry.data.message) || readString(entry.data.reason) || type;
      lines.push(`- ${entry.ts.slice(11, 19)} \`${type}\`: ${message}`);
      continue;
    }
    if (type === "syntax-validation.early-stop") {
      const reason = readString(entry.data.reason) || "unknown";
      lines.push(`- ${entry.ts.slice(11, 19)} \`${type}\`: stopped early (${reason})`);
      continue;
    }
    if (type === "verifier-pass") {
      const blocking = readNumber(entry.data.blocking) ?? 0;
      const quality = readNumber(entry.data.quality) ?? 0;
      if (blocking > 0 || quality > 0) {
        lines.push(
          `- ${entry.ts.slice(11, 19)} \`verifier-pass\`: blocking=${blocking}, quality=${quality}`,
        );
      }
      continue;
    }
    if (type === "server-verify.policy") {
      const run = readBoolean(entry.data.run);
      const reason = readString(entry.data.reason) || "unknown";
      if (run === false) {
        lines.push(
          `- ${entry.ts.slice(11, 19)} \`server-verify.policy\`: background verify skipped (${reason})`,
        );
      }
    }
  }
  return [...new Set(lines)].slice(-12);
}

function buildTimeline(entries: StoredGenerationEntry[]): string[] {
  const kept =
    entries.length > MAX_SUMMARY_TIMELINE_ROWS
      ? entries.slice(-MAX_SUMMARY_TIMELINE_ROWS)
      : entries;
  const lines = kept.map((entry) => {
    const detail = readString(entry.summary) || readString(entry.data.type) || "event";
    return `- ${entry.ts.slice(11, 19)} ${detail}`;
  });
  if (kept.length < entries.length) {
    lines.unshift(`- ... ${entries.length - kept.length} tidigare events trunkerade`);
  }
  return lines;
}

function trimRunEntries(entries: StoredGenerationEntry[]): StoredGenerationEntry[] {
  if (entries.length <= MAX_TIMELINE_ENTRIES_PER_RUN) return entries;
  return entries.slice(-MAX_TIMELINE_ENTRIES_PER_RUN);
}

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

function buildRunObservabilitySnapshot(runId: string, entries: StoredGenerationEntry[]): RunObservabilitySnapshot {
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
    startedAt: readString(meta.startedAt),
    updatedAt: readString(meta.updatedAt),
    generationKind: readString(meta.generationKind),
    modelId: readString(meta.modelId),
    buildIntent: readString(meta.buildIntent),
    buildMethod: readString(meta.buildMethod),
    promptStrategy: readString(meta.promptStrategy),
    promptType: readString(meta.promptType),
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

function updateSiteObservability(runDir: string, snapshot: RunObservabilitySnapshot): void {
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
  const nextRecord = JSON.stringify({
    runId: snapshot.runId,
    versionId: snapshot.versionId,
    status: snapshot.status,
    updatedAt: snapshot.updatedAt,
    highlights: snapshot.highlights,
    faultFixSummary: snapshot.faultFixSummary,
    recurringPatterns: snapshot.recurringPatterns.slice(0, 10),
  });
  const deduped = [...existing.filter((line) => !line.includes(`"runId":"${snapshot.runId}"`)), nextRecord]
    .slice(-MAX_SITE_HISTORY_RUNS);
  fs.writeFileSync(historyPath, deduped.join("\n") + "\n", "utf8");

  fs.copyFileSync(path.join(runDir, SUMMARY_FILE), path.join(latestDir, SUMMARY_FILE));
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
}

function buildSummary(dir: string, entries: StoredGenerationEntry[]): string {
  const meta = buildMeta(entries);
  const highlights = buildHighlights(entries);
  const timeline = buildTimeline(entries);
  const verifier = meta.verifier as { blocking?: number; quality?: number } | null;
  const serverVerify = meta.serverVerify as {
    run?: boolean;
    reason?: string | null;
    verificationPolicy?: string | null;
    qualityTarget?: string | null;
  } | null;

  return [
    "# Generationslogg",
    "",
    `- Körning: \`${path.basename(dir)}\``,
    `- Status: \`${readString(meta.status) || "unknown"}\``,
    `- Startad: ${readString(meta.startedAt) || "-"}`,
    `- Senast uppdaterad: ${readString(meta.updatedAt) || "-"}`,
    `- Typ: ${readString(meta.generationKind) || "-"}`,
    `- Slug: ${readString(meta.slug) || "-"}`,
    `- Chat: ${readString(meta.chatId) || "-"}`,
    `- Version: ${readString(meta.versionId) || "-"}`,
    "",
    "## LLM / Orkestrering",
    "",
    `- Modell: ${readString(meta.modelId) || "-"}`,
    `- Thinking: ${String(meta.thinking ?? "-")}`,
    `- Bilder: ${String(meta.imageGenerations ?? "-")}`,
    `- Promptstrategi: ${readString(meta.promptStrategy) || "-"}`,
    `- Prompttyp: ${readString(meta.promptType) || "-"}`,
    `- Build intent: ${readString(meta.buildIntent) || "-"}`,
    `- Build method: ${readString(meta.buildMethod) || "-"}`,
    "",
    "## Stream",
    "",
    `- Reasoning ms: ${String((meta.streamTiming as { reasoningMs?: number } | null)?.reasoningMs ?? "-")}`,
    `- Output ms: ${String((meta.streamTiming as { outputMs?: number } | null)?.outputMs ?? "-")}`,
    `- Stream duration ms: ${String((meta.streamTiming as { durationMs?: number } | null)?.durationMs ?? "-")}`,
    `- Input tokens: ${String((meta.tokenUsage as { inputTokens?: number } | null)?.inputTokens ?? "-")}`,
    `- Output tokens: ${String((meta.tokenUsage as { outputTokens?: number } | null)?.outputTokens ?? "-")}`,
    "",
    "## Resultat",
    "",
    `- Duration ms: ${String(meta.durationMs ?? "-")}`,
    `- Preview URL: ${readString(meta.previewUrl) || "-"}`,
    `- Persist blocked: ${readString(meta.persistBlockedReason) || "-"}`,
    `- Preflight errors: ${String((meta.preflight as { errorCount?: number } | null)?.errorCount ?? "-")}`,
    `- Preflight warnings: ${String((meta.preflight as { warningCount?: number } | null)?.warningCount ?? "-")}`,
    `- Preview blocked: ${String((meta.preflight as { previewBlocked?: boolean } | null)?.previewBlocked ?? "-")}`,
    `- Verification blocked: ${String((meta.preflight as { verificationBlocked?: boolean } | null)?.verificationBlocked ?? "-")}`,
    "",
    "## Verify / Quality Gate",
    "",
    `- Verifier blockers: ${String(verifier?.blocking ?? "-")}`,
    `- Verifier quality findings: ${String(verifier?.quality ?? "-")}`,
    `- Background verify: ${
      typeof serverVerify?.run === "boolean"
        ? serverVerify.run
          ? "scheduled"
          : "skipped"
        : "-"
    }`,
    `- Background verify reason: ${serverVerify?.reason ?? "-"}`,
    `- Verification policy: ${serverVerify?.verificationPolicy ?? "-"}`,
    `- Quality target: ${serverVerify?.qualityTarget ?? "-"}`,
    "",
    "## Fel / Signaler",
    "",
    ...(highlights.length > 0 ? highlights : ["- Inga tydliga fel-/varningssignaler loggade ännu."]),
    "",
    "## Tidslinje",
    "",
    ...timeline,
    "",
  ].join("\n");
}

function resolveLatestRunDirFromDisk(): string | null {
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

function resolveRunDir(entry: StoredGenerationEntry): string | null {
  const type = readString(entry.data.type);
  const slug = normalizeSlug(entry.slug || readString(entry.data.slug));
  const chatId = readString(entry.data.chatId);

  if (type === "site.start") {
    const dir = createRunDir(entry.ts, slug);
    if (slug) runDirBySlug.set(slug, dir);
    if (chatId) runDirByChatId.set(chatId, dir);
    return dir;
  }

  if (chatId) {
    const fromChat = runDirByChatId.get(chatId);
    if (fromChat && fs.existsSync(fromChat)) {
      if (slug) runDirBySlug.set(slug, fromChat);
      return fromChat;
    }
    if (fromChat && !fs.existsSync(fromChat)) {
      runDirByChatId.delete(chatId);
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

  // Fallback: recover from HMR / process restart by reading _latest.txt.
  // In dev there is typically one active generation, so the latest dir is correct.
  const fallbackDir = resolveLatestRunDirFromDisk();
  if (fallbackDir) {
    if (slug) runDirBySlug.set(slug, fallbackDir);
    if (chatId) runDirByChatId.set(chatId, fallbackDir);
    return fallbackDir;
  }

  console.warn(
    `[generationslogg] resolveRunDir: could not resolve run dir for event type=${type ?? "?"} slug=${slug ?? "?"} chatId=${chatId?.slice(0, 8) ?? "?"}`,
  );
  return null;
}

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
