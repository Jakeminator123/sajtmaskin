/**
 * File Logger for Development/Debug
 * ==================================
 *
 * Logs detailed information about API usage, orchestrator flow,
 * and preview rendering to a file in the project root.
 *
 * ENABLE: Set SAJTMASKIN_LOG=true in .env.local
 *
 * Logs to: sajtmaskin.log (automatically ignored by .gitignore)
 *
 * IMPORTANT: Never log actual secret values (API keys, passwords)!
 * Only log metadata like "gatewayKeyPresent: true/false"
 */

import fs from "fs";
import path from "path";

// Check if logging is enabled via environment
const LOG_ENABLED = process.env.SAJTMASKIN_LOG === "true";
const LOG_PATH = path.join(process.cwd(), "sajtmaskin.log");

// Max log file size (5MB) - will be cleared when exceeded
const MAX_LOG_SIZE = 5 * 1024 * 1024;

export interface LogRecord {
  source: string;
  event: string;
  details?: Record<string, unknown>;
}

/**
 * Check if file logging is enabled
 */
export function isFileLoggingEnabled(): boolean {
  return LOG_ENABLED;
}

/**
 * Format a log entry as a single line of JSON
 */
function formatLogEntry(record: LogRecord): string {
  const entry = {
    ts: new Date().toISOString(),
    source: record.source,
    event: record.event,
    ...record.details,
  };
  return JSON.stringify(entry) + "\n";
}

/**
 * Check log file size and clear if too large
 */
function checkAndRotateLog(): void {
  try {
    if (fs.existsSync(LOG_PATH)) {
      const stats = fs.statSync(LOG_PATH);
      if (stats.size > MAX_LOG_SIZE) {
        // Archive old log by appending timestamp
        const archivePath = LOG_PATH.replace(".log", `-${Date.now()}.log.old`);
        fs.renameSync(LOG_PATH, archivePath);
        console.log(`[FileLogger] Rotated log to ${archivePath}`);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

/**
 * Log an event to the file (async, best-effort)
 * Does nothing if SAJTMASKIN_LOG is not "true"
 */
export async function logEvent(record: LogRecord): Promise<void> {
  if (!LOG_ENABLED) return;

  try {
    checkAndRotateLog();
    const entry = formatLogEntry(record);
    await fs.promises.appendFile(LOG_PATH, entry, "utf8");
  } catch (error) {
    // Best effort - don't crash the app if logging fails
    console.warn("[FileLogger] Failed to write log:", error);
  }
}

/**
 * Synchronous version for use in places where async is problematic
 */
export function logEventSync(record: LogRecord): void {
  if (!LOG_ENABLED) return;

  try {
    checkAndRotateLog();
    const entry = formatLogEntry(record);
    fs.appendFileSync(LOG_PATH, entry, "utf8");
  } catch {
    // Best effort - don't crash the app if logging fails
  }
}

// ============================================================================
// CONVENIENCE LOGGERS
// ============================================================================

/**
 * Log AI provider selection (OpenAI vs Gateway)
 */
export function logAIProvider(details: {
  provider: "gateway" | "openai" | "anthropic";
  model: string;
  isUserKey: boolean;
  userId?: string;
  gatewayKeyPresent: boolean;
  gatewayFeatureEnabled: boolean;
}): void {
  logEventSync({
    source: "ai-gateway",
    event: "provider_selected",
    details,
  });
}

/**
 * Log orchestrator flow
 */
export function logOrchestrator(details: {
  event:
    | "start"
    | "router_result"
    | "enhancement"
    | "api_call"
    | "complete"
    | "error";
  intent?: string;
  apisUsed?: string[];
  enhancers?: string[];
  promptLength?: number;
  hasExistingCode?: boolean;
  hasMediaLibrary?: boolean;
  errorMessage?: string;
}): void {
  logEventSync({
    source: "orchestrator",
    event: details.event,
    details,
  });
}

/**
 * Log v0 API usage
 */
export function logV0(details: {
  event: "generate" | "refine" | "template" | "final_prompt";
  model: string;
  promptLength: number;
  promptSnippet?: string; // First 200 chars
  chatId?: string;
  hasStreaming?: boolean;
  categoryType?: string;
}): void {
  logEventSync({
    source: "v0",
    event: details.event,
    details,
  });
}

/**
 * Log preview rendering type
 */
export function logPreview(details: {
  type: "v0-iframe" | "sandpack" | "screenshot" | "empty";
  demoUrl?: string;
  sandboxAttributes?: string;
  deviceSize?: string;
  hasDesignMode?: boolean;
}): void {
  logEventSync({
    source: "preview",
    event: "render",
    details,
  });
}

/**
 * Log SSE streaming status
 */
export function logSSE(details: {
  event: "start" | "complete" | "error" | "timeout";
  durationMs?: number;
  eventCount?: number;
  errorMessage?: string;
}): void {
  logEventSync({
    source: "sse",
    event: details.event,
    details,
  });
}
