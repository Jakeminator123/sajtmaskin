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

// Legacy export for backward compatibility
export { isDebugEnabled as isDebugEnabledLegacy };
