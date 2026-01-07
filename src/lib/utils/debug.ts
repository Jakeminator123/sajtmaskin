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
    .filter(
      (s) =>
        s &&
        !["1", "true", "yes", "y", "on", "false", "no", "0", "off"].includes(s)
    )
);

/**
 * Check if debug logging is enabled (globally or for a category)
 */
export function isDebugEnabled(category?: string): boolean {
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
export function debugLog(
  category: string,
  message: string,
  meta?: unknown
): void {
  if (!isDebugEnabled(category)) return;

  const prefix = `[${category}]`;
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS

  if (meta !== undefined) {
    console.log(`${timestamp} ${prefix} ${message}`, meta);
  } else {
    console.log(`${timestamp} ${prefix} ${message}`);
  }
}

/**
 * Log an error (always logged, even in production)
 * Use this for actual errors that need attention
 */
export function errorLog(
  category: string,
  message: string,
  error?: unknown
): void {
  const prefix = `[${category}]`;

  if (error instanceof Error) {
    console.error(`${prefix} ${message}:`, error.message);
    if (isDebugEnabled(category)) {
      console.error(error.stack);
    }
  } else if (error !== undefined) {
    console.error(`${prefix} ${message}:`, error);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

/**
 * Log a warning (always logged, but less severe than error)
 */
export function warnLog(
  category: string,
  message: string,
  meta?: unknown
): void {
  const prefix = `[${category}]`;

  if (meta !== undefined) {
    console.warn(`${prefix} ${message}`, meta);
  } else {
    console.warn(`${prefix} ${message}`);
  }
}

// ANSI color codes for terminal output
const COLORS = {
  reset: "\x1b[0m",
  magenta: "\x1b[35m",
  brightMagenta: "\x1b[95m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  yellow: "\x1b[33m",
};

/**
 * Truncate a string for logging with CLEAR indication that it was truncated.
 * ALWAYS use this instead of raw .substring() in logs to avoid confusion.
 *
 * @param text - The text to potentially truncate
 * @param maxLength - Maximum length before truncation (default: 500)
 * @param label - Optional label for what the text is (e.g., "prompt", "response")
 * @returns The text with truncation marker if truncated
 */
export function truncateForLog(
  text: string,
  maxLength: number = 500,
  label?: string
): string {
  if (!text) return "(empty)";

  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.substring(0, maxLength);
  const remaining = text.length - maxLength;
  const labelPart = label ? `[${label}] ` : "";

  return `${truncated}${COLORS.yellow}${COLORS.bold}... [TRUNKERAD: ${labelPart}${remaining} tecken till, totalt ${text.length} tecken]${COLORS.reset}`;
}

/**
 * Log the final prompt sent to v0 API with distinctive magenta color
 * This is ALWAYS logged (not affected by debug settings) because it's critical info
 *
 * @param prompt - The complete prompt being sent to v0
 * @param model - The model being used (e.g., "v0-1.5-lg")
 */
export function logFinalPrompt(prompt: string, model: string): void {
  const divider = "═".repeat(80);
  const timestamp = new Date().toISOString().slice(11, 23);

  console.log(
    `\n${COLORS.brightMagenta}${COLORS.bold}${divider}${COLORS.reset}`
  );
  console.log(
    `${COLORS.brightMagenta}${COLORS.bold}[v0 FINAL PROMPT] ${timestamp} | Model: ${model} | Length: ${prompt.length} chars${COLORS.reset}`
  );
  console.log(`${COLORS.brightMagenta}${COLORS.bold}${divider}${COLORS.reset}`);
  console.log(`${COLORS.magenta}${prompt}${COLORS.reset}`);
  console.log(
    `${COLORS.brightMagenta}${COLORS.bold}${divider}${COLORS.reset}\n`
  );
}

// Legacy export for backward compatibility
export { isDebugEnabled as isDebugEnabledLegacy };
