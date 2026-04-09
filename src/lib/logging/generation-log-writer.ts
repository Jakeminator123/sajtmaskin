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
const TIMELINE_FILE = "timeline.ndjson";
const SUMMARY_FILE = "summary.md";
const META_FILE = "meta.json";
const LATEST_FILE = "_latest.txt";
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
  step: string;
  problem: string;
  action: string;
  model: string;
  outcome: string;
};

const FAULT_FIX_TYPES: Record<string, (e: StoredGenerationEntry) => FaultFixRow | null> = {
  "autofix.result": (e) => {
    const fixes = Array.isArray(e.data.fixes) ? e.data.fixes.length : 0;
    const warnings = Array.isArray(e.data.warnings) ? e.data.warnings.length : 0;
    if (fixes === 0 && warnings === 0) return null;
    return {
      ts: e.ts.slice(11, 19),
      step: "Autofix",
      problem: `${fixes} fix(ar), ${warnings} varning(ar)`,
      action: "Deterministisk autofix",
      model: "-",
      outcome: "OK",
    };
  },
  "autofix.heavy_load": (e) => ({
    ts: e.ts.slice(11, 19),
    step: "Autofix",
    problem: `Mycket fixar (${readNumber(e.data.fixCount) ?? "?"})`,
    action: "Notering: instabilitet i generering",
    model: "-",
    outcome: "Varning",
  }),
  "syntax-validation.pass": (e) => {
    const phase = readString(e.data.phase);
    const errorCount = readNumber(e.data.errorCount);
    if (phase === "invalid" && errorCount && errorCount > 0) {
      return {
        ts: e.ts.slice(11, 19),
        step: `Syntaxvalidering (pass ${readNumber(e.data.pass) ?? "?"})`,
        problem: `${errorCount} syntaxfel`,
        action: "Validering flaggade fel",
        model: "-",
        outcome: "Fel hittade",
      };
    }
    return null;
  },
  "syntax-validation.fixer.start": (e) => ({
    ts: e.ts.slice(11, 19),
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel`,
    action: "LLM fixer startad",
    model: readString(e.data.fixerModel) || "-",
    outcome: "Startad",
  }),
  "syntax-validation.fixer.result": (e) => ({
    ts: e.ts.slice(11, 19),
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    problem: `${readNumber(e.data.errorsBefore) ?? "?"} -> ${readNumber(e.data.errorsAfter) ?? "?"} fel`,
    action: readBoolean(e.data.improved) ? "Fixer förbättrade koden" : "Fixer kunde inte förbättra",
    model: readString(e.data.fixerModel) || "-",
    outcome: readBoolean(e.data.valid) ? "OK" : readBoolean(e.data.improved) ? "Delvis" : "Misslyckades",
  }),
  "syntax-validation.fixer.error": (e) => ({
    ts: e.ts.slice(11, 19),
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    problem: readString(e.data.message) || "Okänt fel",
    action: "Fixer kraschade",
    model: readString(e.data.fixerModel) || "-",
    outcome: "Krasch",
  }),
  "syntax-validation.fixer.noop": (e) => ({
    ts: e.ts.slice(11, 19),
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel kvar`,
    action: "Fixer returnerade ingen fix",
    model: "-",
    outcome: "Noop",
  }),
  "syntax-validation.gave-up": (e) => ({
    ts: e.ts.slice(11, 19),
    step: `Syntaxvalidering (pass ${readNumber(e.data.pass) ?? "?"})`,
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel kvar`,
    action: "Max pass nått — gav upp",
    model: "-",
    outcome: "Gav upp",
  }),
  "syntax-validation.early-stop": (e) => ({
    ts: e.ts.slice(11, 19),
    step: "Syntaxvalidering",
    problem: readString(e.data.reason) || "tidig stop",
    action: `Stoppade tidigt: ${readString(e.data.reason) || "-"}`,
    model: "-",
    outcome: "Stoppade",
  }),
  "syntax-validation.pipeline-error": (e) => ({
    ts: e.ts.slice(11, 19),
    step: "Syntaxpipeline",
    problem: readString(e.data.message) || "Pipeline-fel",
    action: "Pipeline kunde ej köras",
    model: "-",
    outcome: "Pipeline-fel",
  }),
  "file-repair": (e) => {
    const fixes = Array.isArray(e.data.fixes) ? e.data.fixes.length : 0;
    if (fixes === 0) return null;
    return {
      ts: e.ts.slice(11, 19),
      step: "Filreparation (preflight)",
      problem: `${fixes} reparation(er)`,
      action: "Deterministisk filreparation",
      model: "-",
      outcome: "OK",
    };
  },
  "merged-syntax.invalid": (e) => ({
    ts: e.ts.slice(11, 19),
    step: "Merged syntax",
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel i merged projekt`,
    action: "Merged syntax flaggade fel",
    model: "-",
    outcome: "Fel hittade",
  }),
  "merged-syntax.fixed": (e) => ({
    ts: e.ts.slice(11, 19),
    step: "Merged syntax fixer",
    problem: `${readNumber(e.data.errorsBefore) ?? "?"} -> ${readNumber(e.data.errorsAfter) ?? "?"} fel`,
    action: "Merged syntax reparation",
    model: readString(e.data.fixerModel) || "-",
    outcome: readNumber(e.data.errorsAfter) === 0 ? "OK" : "Delvis",
  }),
  "preflight.version.failed": (e) => ({
    ts: e.ts.slice(11, 19),
    step: "Preflight",
    problem: `${readNumber(e.data.errorCount) ?? "?"} preflight-fel`,
    action: "Version misslyckades i preflight",
    model: "-",
    outcome: "Misslyckades",
  }),
  "comm.error.create": (e) => ({
    ts: e.ts.slice(11, 19),
    step: "Kommunikation",
    problem: readString(e.data.message) || "Kommunikationsfel",
    action: "Fel vid skapande",
    model: "-",
    outcome: "Fel",
  }),
};

function buildFaultFixIndex(entries: StoredGenerationEntry[]): string {
  const rows: FaultFixRow[] = [];
  for (const entry of entries) {
    const type = readString(entry.data.type);
    if (!type) continue;
    const handler = FAULT_FIX_TYPES[type];
    if (!handler) continue;
    const row = handler(entry);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    return [
      "# Fault & Fix Index",
      "",
      "Inga fel, fixar eller reparationer loggade under denna körning.",
      "",
    ].join("\n");
  }

  const header = "| Tid | Steg | Problem | Åtgärd | Modell | Resultat |";
  const sep = "|-----|------|---------|--------|--------|----------|";
  const tableRows = rows.map(
    (r) => `| ${r.ts} | ${r.step} | ${r.problem} | ${r.action} | ${r.model} | ${r.outcome} |`,
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
    writeNdjson(timelinePath, entries);
    fs.writeFileSync(path.join(runDir, META_FILE), JSON.stringify(buildMeta(entries), null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(runDir, SUMMARY_FILE), buildSummary(runDir, entries), "utf8");
    fs.writeFileSync(path.join(runDir, FAULT_FIX_FILE), buildFaultFixIndex(entries), "utf8");
  } catch {
    // Best-effort. Never break API routes due to generation log formatting.
  }
}
