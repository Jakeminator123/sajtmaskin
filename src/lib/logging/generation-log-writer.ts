import fs from "node:fs";
import path from "node:path";

type GenerationLogTarget = "in-progress" | "latest";

type StoredGenerationEntry = {
  ts: string;
  target: GenerationLogTarget;
  slug: string | null;
  summary: string | null;
  data: Record<string, unknown>;
};

const ROOT_DIR = path.join(process.cwd(), "logs", "generationslogg");
const LEGACY_INDEX_DIR = path.join(process.cwd(), "logs", "llm-segmentts-and-index");
const TIMELINE_FILE = "timeline.ndjson";
const SUMMARY_FILE = "summary.md";
const META_FILE = "meta.json";
const LATEST_FILE = "_latest.txt";
const FAULT_FIX_CSV_FILE = "fault-fix-index.csv";
const GLOBAL_ERROR_LOG_CSV_FILE = "error-log.csv";
const FALSE_VALUES = new Set(["0", "false", "off", "no"]);
const MAX_RUN_DIRS = 3;
const MAX_TIMELINE_ENTRIES_PER_RUN = 1_000;
const MAX_SUMMARY_TIMELINE_ROWS = 180;
const runDirBySlug = new Map<string, string>();
const runDirByChatId = new Map<string, string>();

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
  } catch {
    // Best-effort cleanup.
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
    promptStrategy: readString(latestRequest?.data.promptStrategy),
    promptType: readString(latestRequest?.data.promptType),
    buildIntent: findLastString(entries, "buildIntent"),
    buildMethod: findLastString(entries, "buildMethod"),
    durationMs: readNumber(done?.data.durationMs),
    previewUrl: readString(done?.data.previewUrl),
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
};

const FAULT_FIX_TYPES: Record<string, (e: StoredGenerationEntry) => FaultFixRow | null> = {
  "autofix.result": (e) => {
    const fixes = Array.isArray(e.data.fixes) ? e.data.fixes.length : 0;
    const warnings = Array.isArray(e.data.warnings) ? e.data.warnings.length : 0;
    if (fixes === 0 && warnings === 0) return null;
    return {
      ts: e.ts.slice(11, 19),
      phase: "phase-3",
      step: "Autofix",
      severity: "info",
      createdBy: "deterministic-autofix",
      fixedBy: "deterministic-autofix",
      modelTier: "-",
      problem: `${fixes} fix(ar), ${warnings} varning(ar)`,
      action: "Deterministisk autofix",
      model: "-",
      provider: "-",
      pass: "-",
      outcome: "OK",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
    };
  },
  "autofix.heavy_load": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "syntax-validation.pass": (e) => {
    const phase = readString(e.data.phase);
    const errorCount = readNumber(e.data.errorCount);
    if (phase === "invalid" && errorCount && errorCount > 0) {
      return {
        ts: e.ts.slice(11, 19),
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
      };
    }
    return null;
  },
  "syntax-validation.fixer.start": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "syntax-validation.fixer.result": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "syntax-validation.fixer.error": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "syntax-validation.fixer.noop": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "syntax-validation.gave-up": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "syntax-validation.early-stop": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "syntax-validation.pipeline-error": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "file-repair": (e) => {
    const fixes = Array.isArray(e.data.fixes) ? e.data.fixes.length : 0;
    if (fixes === 0) return null;
    return {
      ts: e.ts.slice(11, 19),
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
    };
  },
  "merged-syntax.invalid": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "merged-syntax.fixed": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "verifier-pass": (e) => ({
    ts: e.ts.slice(11, 19),
    phase: "phase-3",
    step: "Verifier-pass",
    severity:
      (readNumber(e.data.blocking) ?? 0) > 0 ? "warning" : (readNumber(e.data.quality) ?? 0) > 0 ? "info" : "info",
    createdBy: "verifier-pass",
    fixedBy: "-",
    modelTier: "-",
    problem: `blocking=${readNumber(e.data.blocking) ?? 0}, quality=${readNumber(e.data.quality) ?? 0}`,
    action: "Read-only kvalitetsgranskning",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: (readNumber(e.data.blocking) ?? 0) > 0 ? "Signaler" : "OK",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
  }),
  "scaffold-retry.suggested": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "preflight.version.failed": (e) => ({
    ts: e.ts.slice(11, 19),
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
  }),
  "comm.error.create": (e) => ({
    ts: e.ts.slice(11, 19),
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
  };
}

function collectFaultFixRows(entries: StoredGenerationEntry[]): FaultFixRow[] {
  const rows: FaultFixRow[] = [];
  for (const [entryIndex, entry] of entries.entries()) {
    const type = readString(entry.data.type);
    if (!type) continue;
    const handler = FAULT_FIX_TYPES[type];
    if (!handler) continue;
    const row = handler(entry);
    if (row) rows.push(enrichFaultFixRow(row, entries, entryIndex));
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

  const existingBody = new Set(
    existingLines.filter((line) => line !== FAULT_FIX_CSV_HEADER),
  );
  const nextLines = rows
    .map(faultFixRowToCsvLine)
    .filter((line) => !existingBody.has(line));

  if (existingLines.length === 0) {
    fs.writeFileSync(
      csvPath,
      [FAULT_FIX_CSV_HEADER, ...nextLines].join("\n") + "\n",
      "utf8",
    );
    return;
  }

  if (nextLines.length > 0) {
    fs.appendFileSync(csvPath, nextLines.join("\n") + "\n", "utf8");
  }
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

function buildSummary(dir: string, entries: StoredGenerationEntry[]): string {
  const meta = buildMeta(entries);
  const highlights = buildHighlights(entries);
  const timeline = buildTimeline(entries);

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
    "## Resultat",
    "",
    `- Duration ms: ${String(meta.durationMs ?? "-")}`,
    `- Preview URL: ${readString(meta.previewUrl) || "-"}`,
    `- Preflight errors: ${String((meta.preflight as { errorCount?: number } | null)?.errorCount ?? "-")}`,
    `- Preflight warnings: ${String((meta.preflight as { warningCount?: number } | null)?.warningCount ?? "-")}`,
    `- Preview blocked: ${String((meta.preflight as { previewBlocked?: boolean } | null)?.previewBlocked ?? "-")}`,
    `- Verification blocked: ${String((meta.preflight as { verificationBlocked?: boolean } | null)?.verificationBlocked ?? "-")}`,
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
    writeNdjson(timelinePath, entries);
    fs.writeFileSync(path.join(runDir, META_FILE), JSON.stringify(buildMeta(entries), null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(runDir, SUMMARY_FILE), buildSummary(runDir, entries), "utf8");
    fs.writeFileSync(path.join(runDir, FAULT_FIX_FILE), buildFaultFixIndex(entries), "utf8");
    fs.writeFileSync(path.join(runDir, FAULT_FIX_CSV_FILE), buildFaultFixCsv(faultFixRows), "utf8");
    appendGlobalFaultFixCsv(faultFixRows);
  } catch {
    // Best-effort. Never break API routes due to generation log formatting.
  }
}
