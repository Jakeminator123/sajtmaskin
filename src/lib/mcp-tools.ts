/**
 * MCP Tools Integration
 *
 * Provides tools for interacting with the MCP server from the orchestrator.
 * These tools enable documentation search and error reporting.
 *
 * NOTE: This module connects to the MCP server via HTTP/REST, not stdio.
 * The MCP server must be running on port 3847 (or configured port).
 *
 * @see services/mpc/server.mjs
 */

import { isAIFeatureEnabled } from "@/lib/ai/ai-sdk-features";
import { debugLog } from "@/lib/utils/debug";

// ============================================================================
// TYPES
// ============================================================================

export interface DocSearchResult {
  path: string;
  title: string;
  snippet: string;
  source: string;
  score?: number;
}

export interface ErrorLogEntry {
  timestamp: string;
  message: string;
  level: "error" | "warn" | "info";
  stack?: string;
  component?: string;
  context?: Record<string, unknown>;
}

export interface MCPToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// MCP CLIENT
// ============================================================================

/**
 * Check if MCP tools are enabled
 */
export function isMCPEnabled(): boolean {
  return isAIFeatureEnabled("mcpTools") && process.env.MCP_ENABLED !== "false";
}

/**
 * Search documentation via MCP server
 *
 * @param query - Search term
 * @param source - Which doc source to search (all, ai-sdk, openai, vercel, v0, local)
 * @param limit - Max results to return
 */
export async function searchDocs(
  query: string,
  source: "all" | "ai-sdk" | "openai" | "vercel" | "v0" | "local" = "all",
  limit: number = 5
): Promise<MCPToolResult<DocSearchResult[]>> {
  if (!isMCPEnabled()) {
    return { success: false, error: "MCP tools not enabled" };
  }

  try {
    debugLog("MCP", `Searching docs: "${query}" in ${source}`);

    // For now, we simulate the search locally since MCP uses stdio transport
    // In production, you'd call the MCP server via a REST wrapper or use
    // the MCP SDK directly
    const results = await searchDocsLocally(query, source, limit);

    return { success: true, data: results };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    debugLog("MCP", `Search error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get a specific documentation file
 *
 * @param docPath - Path to doc file relative to docs folder
 */
export async function getDoc(docPath: string): Promise<MCPToolResult<string>> {
  if (!isMCPEnabled()) {
    return { success: false, error: "MCP tools not enabled" };
  }

  try {
    debugLog("MCP", `Getting doc: ${docPath}`);

    // Read doc file locally
    const content = await getDocLocally(docPath);

    return { success: true, data: content };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Report an error to the MCP error log
 */
export async function reportError(
  message: string,
  options: {
    level?: "error" | "warn" | "info";
    stack?: string;
    component?: string;
    context?: Record<string, unknown>;
  } = {}
): Promise<MCPToolResult<void>> {
  if (!isMCPEnabled()) {
    return { success: false, error: "MCP tools not enabled" };
  }

  try {
    debugLog("MCP", `Reporting ${options.level || "error"}: ${message}`);

    // Log to console for now (MCP server handles persistence via stdio)
    console.error(`[MCP Error] ${options.component || "unknown"}: ${message}`);
    if (options.stack) {
      console.error(options.stack);
    }

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * List available documentation sources
 */
export async function listDocSources(): Promise<
  MCPToolResult<{ name: string; fileCount: number }[]>
> {
  if (!isMCPEnabled()) {
    return { success: false, error: "MCP tools not enabled" };
  }

  const docs = await indexDocs();
  const counts: Record<
    "ai-sdk" | "openai" | "vercel" | "v0" | "local",
    number
  > = {
    "ai-sdk": 0,
    openai: 0,
    vercel: 0,
    v0: 0,
    local: 0,
  };

  for (const doc of docs) {
    counts[doc.source] = (counts[doc.source] || 0) + 1;
  }

  const ordered: { name: keyof typeof counts; fileCount: number }[] = [
    { name: "ai-sdk", fileCount: counts["ai-sdk"] },
    { name: "openai", fileCount: counts.openai },
    { name: "vercel", fileCount: counts.vercel },
    { name: "v0", fileCount: counts.v0 },
    { name: "local", fileCount: counts.local },
  ];

  return { success: true, data: ordered };
}

// ============================================================================
// LOCAL IMPLEMENTATIONS (fallback when MCP server not available via HTTP)
// ============================================================================

import fs from "fs/promises";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "services", "mpc", "docs");

type DocSource = "ai-sdk" | "openai" | "vercel" | "v0" | "local";

interface IndexedDoc {
  relativePath: string;
  fullPath: string;
  source: DocSource;
}

function detectDocSource(relPath: string): DocSource {
  const lower = relPath.toLowerCase();
  if (lower.includes("ai-sdk")) return "ai-sdk";
  if (lower.includes("openai")) return "openai";
  if (lower.includes("vercel.com")) return "vercel";
  if (lower.includes("v0.app") || lower.includes("v0.dev")) return "v0";
  return "local";
}

async function indexDocs(): Promise<IndexedDoc[]> {
  const results: IndexedDoc[] = [];

  async function walk(dir: string, relPrefix = ""): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (![".txt", ".md", ".json"].includes(ext)) continue;

      results.push({
        relativePath: relPath.replace(/\\/g, "/"),
        fullPath,
        source: detectDocSource(relPath),
      });
    }
  }

  await walk(DOCS_DIR);
  return results;
}

async function searchDocsLocally(
  query: string,
  source: "all" | DocSource,
  limit: number
): Promise<DocSearchResult[]> {
  const results: DocSearchResult[] = [];
  const queryLower = query.toLowerCase();

  try {
    const docs = await indexDocs();
    const filtered =
      source === "all" ? docs : docs.filter((doc) => doc.source === source);

    for (const doc of filtered) {
      const content = await fs.readFile(doc.fullPath, "utf-8");
      const contentLower = content.toLowerCase();
      if (!contentLower.includes(queryLower)) continue;

      const matchIndex = contentLower.indexOf(queryLower);
      const start = Math.max(0, matchIndex - 100);
      const end = Math.min(content.length, matchIndex + query.length + 200);
      const snippet = content.slice(start, end).replace(/\s+/g, " ").trim();

      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : doc.relativePath;

      results.push({
        path: doc.relativePath,
        title,
        snippet: snippet.length > 200 ? `${snippet.slice(0, 200)}...` : snippet,
        source: doc.source,
      });

      if (results.length >= limit) break;
    }
  } catch (error) {
    debugLog("MCP", `Local search error: ${error}`);
  }

  return results.slice(0, limit);
}

async function getDocLocally(docPath: string): Promise<string> {
  const fullPath = path.join(DOCS_DIR, docPath);

  // Security check - prevent path traversal
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(DOCS_DIR))) {
    throw new Error("Invalid document path");
  }

  return fs.readFile(fullPath, "utf-8");
}

// ============================================================================
// AI SDK TOOL DEFINITIONS (for use with generateText)
// ============================================================================

/**
 * Get MCP tools formatted for AI SDK's tool calling
 *
 * Usage in generateText:
 * ```typescript
 * import { getMCPTools } from "@/lib/mcp-tools";
 *
 * const result = await generateText({
 *   model: provider.model,
 *   tools: getMCPTools(),
 *   prompt: "Search for information about v0 API templates",
 * });
 * ```
 */
export function getMCPTools() {
  if (!isMCPEnabled()) {
    return {};
  }

  return {
    searchDocs: {
      description: "Search project documentation for relevant information",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search term to find in documentation",
          },
          source: {
            type: "string",
            enum: ["all", "ai-sdk", "openai", "vercel", "v0", "local"],
            description: "Which documentation source to search",
          },
        },
        required: ["query"],
      },
      execute: async ({
        query,
        source,
      }: {
        query: string;
        source?: string;
      }) => {
        const result = await searchDocs(
          query,
          (source as "all" | "ai-sdk" | "openai" | "vercel" | "v0" | "local") ||
            "all"
        );
        return result.success
          ? JSON.stringify(result.data)
          : `Error: ${result.error}`;
      },
    },
    getDoc: {
      description: "Get the contents of a specific documentation file",
      parameters: {
        type: "object" as const,
        properties: {
          docPath: {
            type: "string",
            description:
              "Path to doc file relative to docs folder, e.g. 'docgrab__v0.dev__docs/md/docs_api.md'",
          },
        },
        required: ["docPath"],
      },
      execute: async ({ docPath }: { docPath: string }) => {
        const result = await getDoc(docPath);
        return result.success
          ? result.data?.slice(0, 4000) || "" // Limit size
          : `Error: ${result.error}`;
      },
    },
    reportError: {
      description: "Report an error to the error log for debugging",
      parameters: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description: "Error message",
          },
          level: {
            type: "string",
            enum: ["error", "warn", "info"],
          },
          component: {
            type: "string",
            description: "Component or module where error occurred",
          },
        },
        required: ["message"],
      },
      execute: async ({
        message,
        level,
        component,
      }: {
        message: string;
        level?: string;
        component?: string;
      }) => {
        await reportError(message, {
          level: level as "error" | "warn" | "info",
          component,
        });
        return "Error reported successfully";
      },
    },
  };
}
