/**
 * MCP Tools Integration
 *
 * Provides tools for interacting with the MCP server from the orchestrator.
 * These tools enable documentation search and error reporting.
 *
 * NOTE: This module connects to the MCP server via HTTP/REST, not stdio.
 * The MCP server must be running on port 3847 (or configured port).
 *
 * @see app/services/mpc/server.mjs
 */

import { isAIFeatureEnabled } from "./ai-sdk-features";
import { debugLog } from "./debug";

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

  // Return known sources
  const sources = [
    { name: "ai-sdk", fileCount: 79 },
    { name: "openai", fileCount: 50 },
    { name: "v0", fileCount: 40 },
    { name: "vercel", fileCount: 60 },
    { name: "local", fileCount: 10 },
  ];

  return { success: true, data: sources };
}

// ============================================================================
// LOCAL IMPLEMENTATIONS (fallback when MCP server not available via HTTP)
// ============================================================================

import fs from "fs/promises";
import path from "path";

const DOCS_DIR = path.join(process.cwd(), "services", "mpc", "docs");

async function searchDocsLocally(
  query: string,
  source: string,
  limit: number
): Promise<DocSearchResult[]> {
  const results: DocSearchResult[] = [];
  const queryLower = query.toLowerCase();

  try {
    // Determine which directories to search
    const sourceDirs: string[] = [];
    if (source === "all" || source === "ai-sdk") {
      sourceDirs.push("docgrab__ai-sdk.dev__docs");
    }
    if (source === "all" || source === "openai") {
      sourceDirs.push("docgrab__platform.openai.com__docs");
    }
    if (source === "all" || source === "v0") {
      sourceDirs.push("docgrab__v0.dev__docs");
    }
    if (source === "all" || source === "vercel") {
      sourceDirs.push("docgrab__vercel.com__docs");
    }
    if (source === "all" || source === "local") {
      sourceDirs.push(""); // Root docs folder
    }

    for (const dir of sourceDirs) {
      const dirPath = path.join(DOCS_DIR, dir, "md");

      try {
        await fs.access(dirPath);
        const files = await fs.readdir(dirPath);

        for (const file of files) {
          if (!file.endsWith(".md") && !file.endsWith(".txt")) continue;

          const filePath = path.join(dirPath, file);
          const content = await fs.readFile(filePath, "utf-8");
          const contentLower = content.toLowerCase();

          if (contentLower.includes(queryLower)) {
            // Find snippet around match
            const matchIndex = contentLower.indexOf(queryLower);
            const start = Math.max(0, matchIndex - 100);
            const end = Math.min(
              content.length,
              matchIndex + query.length + 100
            );
            const snippet = content
              .slice(start, end)
              .replace(/\n/g, " ")
              .trim();

            // Extract title from first heading
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch
              ? titleMatch[1]
              : file.replace(/\.(md|txt)$/, "");

            results.push({
              path: path.relative(DOCS_DIR, filePath),
              title,
              snippet:
                snippet.length > 200 ? snippet.slice(0, 200) + "..." : snippet,
              source: dir || "local",
            });

            if (results.length >= limit) break;
          }
        }

        if (results.length >= limit) break;
      } catch {
        // Directory doesn't exist or can't be read
        continue;
      }
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
