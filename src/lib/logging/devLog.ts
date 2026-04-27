import fs from "node:fs";
import {
  isGenerationLogEnabled,
  writeGenerationLogEntry,
} from "./generation-log-writer";
import {
  LOGS_ROOT_DIR,
  DEV_LOG_ROLLING_PATH,
  DEV_LOG_DOC_PATH,
  isDevLoggingEnabled,
  normalizeSlug,
  SENSITIVE_KEY_PATTERN,
} from "./shared";

type DevLogTarget = "in-progress" | "latest";
type DevLogEntry = Record<string, unknown>;

const MAX_LOG_CHARS = 1000;
const DEFAULT_DOC_MAX_WORDS = 10_000;
const MAX_DOC_MAX_WORDS = 20_000;
const CHAT_SLUG_CACHE_LIMIT = 200;
const CONSOLE_SUMMARY_ENABLED_TYPES = new Set([
  "site.start",
  "comm.request.create",
  "comm.request.followup",
  "comm.tool_calls",
  "comm.integration_signals",
  "engine.integration_signals",
  "autofix.result",
  "autofix.mechanical-residual",
  "syntax-validation.pass",
  "syntax-validation.fixer.start",
  "syntax-validation.fixer.result",
  "syntax-validation.gave-up",
  "syntax-validation.pipeline-error",
  "file-repair",
  "merged-syntax.invalid",
  "merged-syntax.fixed",
  "preview-preflight.error",
  "project-sanity",
  "project-sanity.error",
  "server-verify.policy",
  "route-plan.preflight",
  "contracts.inferred",
  "request.kind.classified",
  "validate.eslint.passed",
  "validate.eslint.skipped",
  "validate.eslint.diagnostics",
  "validate.eslint.repair-error",
  "validate.eslint.error",
  "contracts.clarification-requested",
  "version.created",
  "preflight.summary",
  "preflight.version.failed",
  "scaffold-retry.suggested",
  "site.done",
  "site.message.done",
  "site.aborted",
  "llm_fixer_aborted",
  "dossier_verbatim_restored",
  "llm_fixer_partial_response",
  "comm.error.create",
]);

type SanitizeOptions = {
  maxDepth: number;
  maxArrayItems: number;
  maxStringLength: number;
};

const ROLLING_SANITIZE_OPTIONS: SanitizeOptions = {
  maxDepth: 4,
  maxArrayItems: 12,
  maxStringLength: 260,
};

const DOCUMENT_SANITIZE_OPTIONS: SanitizeOptions = {
  maxDepth: 6,
  maxArrayItems: 40,
  maxStringLength: 4000,
};

const chatSlugMap = new Map<string, string>();
let latestSlug: string | null = null;

function isAnyLocalLogEnabled(): boolean {
  return isDevLoggingEnabled() || isGenerationLogEnabled();
}

function resolveDocumentWordLimit(): number {
  const raw = Number(process.env.SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS);
  if (!Number.isFinite(raw)) return DEFAULT_DOC_MAX_WORDS;
  return raw >= MAX_DOC_MAX_WORDS ? MAX_DOC_MAX_WORDS : DEFAULT_DOC_MAX_WORDS;
}

function truncateString(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function sanitizeValue(value: unknown, options: SanitizeOptions, depth = 0): unknown {
  if (depth > options.maxDepth) return "[truncated]";
  if (typeof value === "string") return truncateString(value, options.maxStringLength);
  if (typeof value !== "object" || value === null) return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, options.maxArrayItems)
      .map((item) => sanitizeValue(item, options, depth + 1));
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeValue(entry, options, depth + 1);
  }
  return out;
}

function safeStringify(value: unknown, pretty = false): string {
  try {
    return JSON.stringify(value, null, pretty ? 2 : 0);
  } catch {
    return JSON.stringify({ value: "[unserializable]" }, null, pretty ? 2 : 0);
  }
}

function ensureRootLogFiles(): void {
  try {
    if (!fs.existsSync(LOGS_ROOT_DIR)) {
      fs.mkdirSync(LOGS_ROOT_DIR, { recursive: true });
    }
    if (!fs.existsSync(DEV_LOG_ROLLING_PATH)) {
      fs.writeFileSync(DEV_LOG_ROLLING_PATH, "", "utf8");
    }
    if (!fs.existsSync(DEV_LOG_DOC_PATH)) {
      fs.writeFileSync(DEV_LOG_DOC_PATH, "", "utf8");
    }
  } catch (err) {
    console.warn(
      "[sajtmaskin-dev] ensureRootLogFiles failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function readString(entry: DevLogEntry, key: string): string | null {
  const value = entry[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(entry: DevLogEntry, key: string): number | null {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(entry: DevLogEntry, key: string): boolean | null {
  const value = entry[key];
  return typeof value === "boolean" ? value : null;
}

function countArray(entry: DevLogEntry, key: string): number | null {
  const value = entry[key];
  return Array.isArray(value) ? value.length : null;
}

function shortId(value: string | null): string | null {
  if (!value) return null;
  return value.length > 10 ? value.slice(0, 8) : value;
}

function shouldMirrorToStdout(): boolean {
  if (!isDevLoggingEnabled()) return false;
  if (process.env.SAJTMASKIN_DEV_LOG_STDOUT === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function truncateInline(value: string, max = 120): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function buildConsoleSummary(entry: DevLogEntry, target: DevLogTarget): string | null {
  const type = readString(entry, "type");
  if (!type || !CONSOLE_SUMMARY_ENABLED_TYPES.has(type)) return null;

  const details: string[] = [];
  const slug = readString(entry, "slug");
  const chatId = shortId(readString(entry, "chatId"));
  const versionId = shortId(readString(entry, "versionId"));

  if (slug) details.push(`slug=${slug}`);
  if (chatId) details.push(`chat=${chatId}`);
  if (versionId) details.push(`version=${versionId}`);

  switch (type) {
    case "site.start":
      if (readString(entry, "modelId")) details.push(`model=${readString(entry, "modelId")}`);
      if (readBoolean(entry, "thinking") !== null) details.push(`thinking=${readBoolean(entry, "thinking")}`);
      if (readBoolean(entry, "imageGenerations") !== null) details.push(`images=${readBoolean(entry, "imageGenerations")}`);
      break;
    case "comm.request.create":
    case "comm.request.followup":
      if (readString(entry, "promptStrategy")) details.push(`strategy=${readString(entry, "promptStrategy")}`);
      if (readString(entry, "promptType")) details.push(`type=${readString(entry, "promptType")}`);
      if (readNumber(entry, "attachmentsCount") !== null) details.push(`attachments=${readNumber(entry, "attachmentsCount")}`);
      if (readNumber(entry, "optimizedLength") !== null) details.push(`chars=${readNumber(entry, "optimizedLength")}`);
      break;
    case "comm.tool_calls":
      if (countArray(entry, "tools") !== null) details.push(`tools=${countArray(entry, "tools")}`);
      break;
    case "comm.integration_signals":
    case "engine.integration_signals":
      if (countArray(entry, "integrations") !== null) details.push(`integrations=${countArray(entry, "integrations")}`);
      if (countArray(entry, "envVars") !== null) details.push(`envVars=${countArray(entry, "envVars")}`);
      break;
    case "autofix.result":
      if (countArray(entry, "fixes") !== null) details.push(`fixes=${countArray(entry, "fixes")}`);
      if (countArray(entry, "warnings") !== null) details.push(`warnings=${countArray(entry, "warnings")}`);
      if (countArray(entry, "dependencies") !== null) details.push(`deps=${countArray(entry, "dependencies")}`);
      break;
    case "autofix.mechanical-residual":
      if (readNumber(entry, "mechanicalFixCount") !== null) details.push(`mechanical=${readNumber(entry, "mechanicalFixCount")}`);
      if (readNumber(entry, "residualErrorCount") !== null) details.push(`residual=${readNumber(entry, "residualErrorCount")}`);
      break;
    case "syntax-validation.pass":
      if (readNumber(entry, "pass") !== null) details.push(`pass=${readNumber(entry, "pass")}`);
      if (readString(entry, "phase")) details.push(`phase=${readString(entry, "phase")}`);
      if (readNumber(entry, "errorCount") !== null) details.push(`errors=${readNumber(entry, "errorCount")}`);
      break;
    case "syntax-validation.fixer.start":
      if (readNumber(entry, "pass") !== null) details.push(`pass=${readNumber(entry, "pass")}`);
      if (readNumber(entry, "errorCount") !== null) details.push(`errors=${readNumber(entry, "errorCount")}`);
      if (readString(entry, "fixerModel")) details.push(`model=${readString(entry, "fixerModel")}`);
      break;
    case "syntax-validation.fixer.result":
      if (readNumber(entry, "pass") !== null) details.push(`pass=${readNumber(entry, "pass")}`);
      if (readNumber(entry, "errorsBefore") !== null) details.push(`before=${readNumber(entry, "errorsBefore")}`);
      if (readNumber(entry, "errorsAfter") !== null) details.push(`after=${readNumber(entry, "errorsAfter")}`);
      if (readBoolean(entry, "improved") !== null) details.push(`improved=${readBoolean(entry, "improved")}`);
      if (readString(entry, "fixerModel")) details.push(`model=${readString(entry, "fixerModel")}`);
      break;
    case "syntax-validation.gave-up":
      if (readNumber(entry, "pass") !== null) details.push(`pass=${readNumber(entry, "pass")}`);
      if (readNumber(entry, "errorCount") !== null) details.push(`errors=${readNumber(entry, "errorCount")}`);
      break;
    case "syntax-validation.pipeline-error":
    case "preview-preflight.error":
    case "project-sanity.error":
    case "comm.error.create":
      if (readString(entry, "message")) details.push(`message=${truncateInline(readString(entry, "message")!)}`);
      if (readString(entry, "code")) details.push(`code=${readString(entry, "code")}`);
      break;
    case "file-repair":
      if (countArray(entry, "fixes") !== null) details.push(`fixes=${countArray(entry, "fixes")}`);
      break;
    case "merged-syntax.invalid":
      if (readNumber(entry, "errorCount") !== null) details.push(`errors=${readNumber(entry, "errorCount")}`);
      break;
    case "merged-syntax.fixed":
      if (readNumber(entry, "errorsBefore") !== null) details.push(`before=${readNumber(entry, "errorsBefore")}`);
      if (readNumber(entry, "errorsAfter") !== null) details.push(`after=${readNumber(entry, "errorsAfter")}`);
      if (countArray(entry, "repairFixes") !== null) details.push(`repairs=${countArray(entry, "repairFixes")}`);
      break;
    case "project-sanity":
      if (readBoolean(entry, "valid") !== null) details.push(`valid=${readBoolean(entry, "valid")}`);
      if (countArray(entry, "issues") !== null) details.push(`issues=${countArray(entry, "issues")}`);
      if (readNumber(entry, "completeProjectFiles") !== null) details.push(`files=${readNumber(entry, "completeProjectFiles")}`);
      break;
    case "route-plan.preflight":
      if (readString(entry, "source")) details.push(`source=${readString(entry, "source")}`);
      if (readString(entry, "siteType")) details.push(`siteType=${readString(entry, "siteType")}`);
      if (countArray(entry, "missingRoutes") !== null) details.push(`missingRoutes=${countArray(entry, "missingRoutes")}`);
      break;
    case "contracts.inferred":
      if (readString(entry, "dataMode")) details.push(`dataMode=${readString(entry, "dataMode")}`);
      if (readString(entry, "databaseProvider")) details.push(`db=${readString(entry, "databaseProvider")}`);
      if (readString(entry, "authProvider")) details.push(`auth=${readString(entry, "authProvider")}`);
      if (readString(entry, "paymentProvider")) details.push(`payment=${readString(entry, "paymentProvider")}`);
      if (countArray(entry, "integrations") !== null) details.push(`integrations=${countArray(entry, "integrations")}`);
      if (countArray(entry, "envVars") !== null) details.push(`envVars=${countArray(entry, "envVars")}`);
      if (countArray(entry, "unresolvedDecisions") !== null) details.push(`unresolved=${countArray(entry, "unresolvedDecisions")}`);
      break;
    case "contracts.clarification-requested":
      if (readString(entry, "kind")) details.push(`kind=${readString(entry, "kind")}`);
      if (readString(entry, "reason")) details.push(`reason=${truncateInline(readString(entry, "reason")!, 90)}`);
      break;
    case "version.created":
      break;
    case "preflight.summary":
      if (readNumber(entry, "filesChecked") !== null) details.push(`files=${readNumber(entry, "filesChecked")}`);
      if (readNumber(entry, "issueCount") !== null) details.push(`issues=${readNumber(entry, "issueCount")}`);
      if (readNumber(entry, "errorCount") !== null) details.push(`errors=${readNumber(entry, "errorCount")}`);
      if (readNumber(entry, "warningCount") !== null) details.push(`warnings=${readNumber(entry, "warningCount")}`);
      if (readBoolean(entry, "previewBlocked") !== null) details.push(`previewBlocked=${readBoolean(entry, "previewBlocked")}`);
      if (readBoolean(entry, "verificationBlocked") !== null) details.push(`verificationBlocked=${readBoolean(entry, "verificationBlocked")}`);
      break;
    case "preflight.version.failed":
      if (readNumber(entry, "errorCount") !== null) details.push(`errors=${readNumber(entry, "errorCount")}`);
      break;
    case "scaffold-retry.suggested":
      if (readString(entry, "currentScaffoldId")) details.push(`from=${readString(entry, "currentScaffoldId")}`);
      if (readString(entry, "suggestedScaffoldId")) details.push(`to=${readString(entry, "suggestedScaffoldId")}`);
      if (readString(entry, "failureType")) details.push(`failure=${readString(entry, "failureType")}`);
      if (readString(entry, "confidence")) details.push(`confidence=${readString(entry, "confidence")}`);
      break;
    case "site.done":
    case "site.message.done":
      if (readNumber(entry, "durationMs") !== null) details.push(`durationMs=${readNumber(entry, "durationMs")}`);
      {
        const p = readString(entry, "previewUrl") ?? readString(entry, "demoUrl");
        if (p) details.push(`preview=${truncateInline(p, 70)}`);
      }
      if (readBoolean(entry, "awaitingInput") !== null) details.push(`awaitingInput=${readBoolean(entry, "awaitingInput")}`);
      break;
    case "site.aborted":
      // P0 stream-abort recovery (2026-04-26). Surface enough to read a stuck
      // chat at a glance without opening the timeline. `reason` is the
      // strict-schema enum from docs/schemas/strict/site-aborted.schema.json;
      // `kind` mirrors generationKind so we can tell init aborts from
      // follow-up aborts in console scrollback.
      if (readString(entry, "reason")) details.push(`reason=${readString(entry, "reason")}`);
      if (readString(entry, "kind")) details.push(`kind=${readString(entry, "kind")}`);
      if (readNumber(entry, "elapsedMs") !== null) details.push(`elapsedMs=${readNumber(entry, "elapsedMs")}`);
      break;
    default:
      break;
  }

  return `${target} ${type}${details.length > 0 ? ` | ${details.join(" | ")}` : ""}`;
}

function mirrorSummaryToStdout(target: DevLogTarget, entry: DevLogEntry): void {
  if (!shouldMirrorToStdout()) return;
  const summary = buildConsoleSummary(entry, target);
  if (!summary) return;
  const timestamp = new Date().toISOString().slice(11, 19);
  console.info(`\x1b[35m[sajtmaskin-dev]\x1b[0m ${timestamp} ${summary}`);
}

function rememberChatSlug(chatId: string, slug: string): void {
  if (!chatId || !slug) return;
  chatSlugMap.set(chatId, slug);
  if (chatSlugMap.size <= CHAT_SLUG_CACHE_LIMIT) return;
  const firstKey = chatSlugMap.keys().next().value;
  if (firstKey) chatSlugMap.delete(firstKey);
}

function deriveSlugFromEntry(entry: DevLogEntry): string | null {
  const explicit = normalizeSlug(
    readString(entry, "slug") ||
      readString(entry, "siteSlug") ||
      readString(entry, "projectSlug") ||
      "",
  );
  if (explicit) return explicit;

  const message = readString(entry, "message");
  if (message && readString(entry, "type") === "site.start") {
    return normalizeSlug(message.split(/\s+/).slice(0, 12).join(" "));
  }

  const projectId = readString(entry, "projectId");
  if (projectId) return normalizeSlug(`project-${projectId}`);

  const chatId = readString(entry, "chatId");
  if (chatId) return normalizeSlug(`chat-${chatId}`);

  const type = readString(entry, "type");
  if (type) return normalizeSlug(type);

  return null;
}

function enrichEntryWithSlug(entry: DevLogEntry): DevLogEntry {
  const enriched: DevLogEntry = { ...entry };
  const chatId = readString(enriched, "chatId");

  if (readString(enriched, "type") === "site.chatId" && chatId && latestSlug) {
    rememberChatSlug(chatId, latestSlug);
    enriched.slug = latestSlug;
    return enriched;
  }

  const explicitSlug = normalizeSlug(
    readString(enriched, "slug") ||
      readString(enriched, "siteSlug") ||
      readString(enriched, "projectSlug") ||
      "",
  );

  let slug = explicitSlug;
  if (!slug && chatId) {
    slug = chatSlugMap.get(chatId) || null;
  }
  if (!slug) {
    slug = deriveSlugFromEntry(enriched);
  }
  if (!slug && latestSlug) {
    slug = latestSlug;
  }

  if (slug) {
    enriched.slug = slug;
    latestSlug = slug;
    if (chatId) {
      rememberChatSlug(chatId, slug);
    }
  }

  return enriched;
}

function clipByWords(content: string, maxWords: number): string {
  if (!content) return content;
  const matches = Array.from(content.matchAll(/\S+/g));
  if (matches.length <= maxWords) return content;
  const start = matches[matches.length - maxWords]?.index ?? 0;
  return content.slice(start);
}

function appendRollingLine(target: DevLogTarget, entry: DevLogEntry): void {
  try {
    const enriched = enrichEntryWithSlug(entry);
    const timestamp = new Date().toISOString();
    mirrorSummaryToStdout(target, enriched);
    const docSanitized = sanitizeValue(enriched, DOCUMENT_SANITIZE_OPTIONS);
    const slugPart = readString(enriched, "slug");
    const summary = buildConsoleSummary(enriched, target);

    if (isDevLoggingEnabled()) {
      ensureRootLogFiles();
      const shortSanitized = sanitizeValue(enriched, ROLLING_SANITIZE_OPTIONS);
      const line = `${timestamp} [${target}] ${safeStringify(shortSanitized)}\n`;
      const current = fs.existsSync(DEV_LOG_ROLLING_PATH) ? fs.readFileSync(DEV_LOG_ROLLING_PATH, "utf8") : "";
      const next = `${current}${line}`;
      const clipped = next.length > MAX_LOG_CHARS ? next.slice(-MAX_LOG_CHARS) : next;
      fs.writeFileSync(DEV_LOG_ROLLING_PATH, clipped, "utf8");

      const docHeader = `${timestamp} [${target}]${slugPart ? ` [slug:${slugPart}]` : ""}`;
      const docBlock = `${docHeader}\n${safeStringify(docSanitized, true)}\n\n`;
      const docCurrent = fs.existsSync(DEV_LOG_DOC_PATH)
        ? fs.readFileSync(DEV_LOG_DOC_PATH, "utf8")
        : "";
      const docNext = `${docCurrent}${docBlock}`;
      const docClipped = clipByWords(docNext, resolveDocumentWordLimit());
      fs.writeFileSync(DEV_LOG_DOC_PATH, docClipped, "utf8");
    }

    writeGenerationLogEntry({
      target,
      ts: timestamp,
      slug: slugPart,
      summary,
      data:
        docSanitized && typeof docSanitized === "object" && !Array.isArray(docSanitized)
          ? (docSanitized as Record<string, unknown>)
          : { value: docSanitized },
    });
  } catch (err) {
    console.warn(
      "[sajtmaskin-dev] appendRollingLine failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

if (isDevLoggingEnabled()) {
  ensureRootLogFiles();
}

export function devLogStartGeneration(params: {
  message: string;
  modelId?: string;
  thinking?: boolean;
  imageGenerations?: boolean;
  projectId?: string;
  slug?: string;
  chatId?: string | null;
  generationKind?: "create" | "followup" | "plan";
}): void {
  if (!isAnyLocalLogEnabled()) return;

  appendRollingLine("in-progress", {
    type: "site.start",
    message: params.message,
    modelId: params.modelId ?? null,
    thinking: typeof params.thinking === "boolean" ? params.thinking : null,
    imageGenerations: typeof params.imageGenerations === "boolean" ? params.imageGenerations : null,
    projectId: params.projectId ?? null,
    slug: params.slug ?? null,
    chatId: params.chatId ?? null,
    generationKind: params.generationKind ?? "create",
  });
}

export function devLogStartNewSite(params: {
  message: string;
  modelId?: string;
  thinking?: boolean;
  imageGenerations?: boolean;
  projectId?: string;
  slug?: string;
}): void {
  devLogStartGeneration({
    ...params,
    generationKind: "create",
  });
}

export function devLogAppend(target: DevLogTarget, entry: DevLogEntry): void {
  if (!isAnyLocalLogEnabled()) return;
  appendRollingLine(target, entry);
}

export function devLogFinalizeSite(): void {
  if (!isAnyLocalLogEnabled()) return;
  appendRollingLine("latest", { type: "site.finalized" });
}
