/**
 * Production-safe debug logging utility
 * =====================================
 *
 * Features:
 * - Category-based logging (enable specific categories)
 * - Automatic disable in production (unless DEBUG=true)
 * - No log accumulation (console only, no file/memory storage)
 * - Safe in both client and server bundles
 *
 * Usage:
 *   debugLog("MCP", "Server started", { port: 3847 });
 *   debugLog("AI", "Generating response...");
 *
 * Environment variables:
 *   DEBUG=true           → Enable all debug logs
 *   DEBUG=AI,MCP,Router  → Enable only specific categories
 *   (unset or false)     → Disable all debug logs (default in prod)
 *
 * Categories used in this project:
 *   - AI: AI/LLM operations (orchestrator, router, enhancer)
 *   - MCP: MCP server and tools
 *   - Router: Semantic router decisions
 *   - Crawler: Code crawler operations
 *   - v0: v0 API calls
 *   - Auth: Authentication flows
 *   - DB: Database operations
 *   - API: API route handlers
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Parse DEBUG env var once at module load
const DEBUG_VALUE = process.env.DEBUG?.trim().toLowerCase() || "";
const DEBUG_ALL = ["1", "true", "yes", "y", "on"].includes(DEBUG_VALUE);
const DEBUG_CATEGORIES = new Set(
  DEBUG_VALUE.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !["1", "true", "yes", "y", "on", "false", "no", "0", "off"].includes(s)),
);

const MAX_ERROR_LOG_CHARS = 2_000;

export function sanitizeErrorTextForLog(value: string): string {
  return value
    .replace(/\b(?:failed query|query|sql|params|parameters|prompt|requestBody|responseBody)\s*[:=][\s\S]*/gi, "[sensitive diagnostic omitted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\b((?:postgres(?:ql)?|redis|https?):\/\/)[^@\s/]+@/gi, "$1[redacted]@")
    .replace(/\b(Bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\b((?:sk|key)-[A-Za-z0-9_-]{12,}|gh[opsu]_[A-Za-z0-9]{12,})\b/g, "[redacted]")
    .replace(/([?&](?:token|secret|password|api[-_]?key)=)[^&#\s]*/gi, "$1[redacted]")
    .slice(0, MAX_ERROR_LOG_CHARS);
}

/** Bounded diagnostic fields only: never serialize request bodies or DB params. */
export function sanitizeErrorForLog(error: unknown, depth = 0): unknown {
  if (typeof error === "string") return sanitizeErrorTextForLog(error);
  if (error === null || typeof error !== "object") return error;
  const obj = error as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ["name", "message", "code", "status", "statusCode", "type"]) {
    const value = obj[key];
    if (typeof value === "string") result[key] = sanitizeErrorTextForLog(value);
    else if (typeof value === "number" || typeof value === "boolean") result[key] = value;
  }
  if (depth < 3 && obj.cause !== undefined) {
    result.cause = sanitizeErrorForLog(obj.cause, depth + 1);
  }
  return result;
}

/**
 * Check if debug logging is enabled (globally or for a category)
 */
function isDebugEnabled(category?: string): boolean {
  // In production, debug is off unless explicitly enabled
  if (IS_PRODUCTION && !DEBUG_ALL && DEBUG_CATEGORIES.size === 0) {
    return false;
  }

  // DEBUG=true enables all
  if (DEBUG_ALL) return true;

  // Check specific category
  if (category && DEBUG_CATEGORIES.size > 0) {
    return DEBUG_CATEGORIES.has(category.toLowerCase());
  }

  // No category specified and not DEBUG_ALL → off in prod, on in dev
  return !IS_PRODUCTION;
}

/**
 * Log a debug message (only if debug is enabled)
 *
 * @param category - Log category (e.g., "AI", "MCP", "Router")
 * @param message - Log message
 * @param meta - Optional metadata object
 */
export function debugLog(category: string, message: string, meta?: unknown): void {
  if (!isDebugEnabled(category)) return;

  const prefix = `[${category}]`;
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS

  if (meta !== undefined) {
    console.info(`${timestamp} ${prefix} ${message}`, meta);
  } else {
    console.info(`${timestamp} ${prefix} ${message}`);
  }
}

/**
 * Log an error (always logged, even in production)
 * Use this for actual errors that need attention
 */
export function errorLog(category: string, message: string, error?: unknown): void {
  const prefix = `[${sanitizeErrorTextForLog(category)}]`;
  const safeMessage = sanitizeErrorTextForLog(message);

  if (error instanceof Error) {
    console.error(`${prefix} ${safeMessage}:`, sanitizeErrorForLog(error));
    if (isDebugEnabled(category)) {
      console.error(error.stack ? sanitizeErrorTextForLog(error.stack) : undefined);
    }
  } else if (error !== undefined) {
    console.error(`${prefix} ${safeMessage}:`, sanitizeErrorForLog(error));
  } else {
    console.error(`${prefix} ${safeMessage}`);
  }
}

/**
 * Log a warning (always logged, but less severe than error)
 */
export function warnLog(category: string, message: string, meta?: unknown): void {
  const prefix = `[${category}]`;

  if (meta !== undefined) {
    console.warn(`${prefix} ${message}`, meta);
  } else {
    console.warn(`${prefix} ${message}`);
  }
}

