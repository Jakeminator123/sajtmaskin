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
  return dir;
}

function appendNdjsonLine(filePath: string, entry: StoredGenerationEntry): void {
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
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
  const finalType = readString(entries.at(-1)?.data.type);
  if (finalType === "site.done" || finalType === "site.message.done") return "done";
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
  return entries.map((entry) => {
    const detail = readString(entry.summary) || readString(entry.data.type) || "event";
    return `- ${entry.ts.slice(11, 19)} ${detail}`;
  });
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
    if (fromChat) {
      if (slug) runDirBySlug.set(slug, fromChat);
      return fromChat;
    }
  }

  if (slug) {
    const fromSlug = runDirBySlug.get(slug);
    if (fromSlug) {
      if (chatId) runDirByChatId.set(chatId, fromSlug);
      return fromSlug;
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

    appendNdjsonLine(path.join(runDir, TIMELINE_FILE), entry);
    const entries = readRunEntries(runDir);
    fs.writeFileSync(path.join(runDir, META_FILE), JSON.stringify(buildMeta(entries), null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(runDir, SUMMARY_FILE), buildSummary(runDir, entries), "utf8");
  } catch {
    // Best-effort. Never break API routes due to generation log formatting.
  }
}
