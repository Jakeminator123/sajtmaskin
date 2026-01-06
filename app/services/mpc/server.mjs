import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "docs");
const LOGS_DIR = path.join(__dirname, "logs");
const ERROR_LOG = path.join(LOGS_DIR, "error-log.jsonl");

// Logg-rotation: max antal rader innan äldre tas bort
const MAX_LOG_LINES = 500;

const server = new McpServer(
  { name: "sajtmaskin-mpc", version: "0.2.0" },
  {
    capabilities: {
      resources: { listChanged: true },
      tools: { listChanged: true },
    },
  }
);

// ============================================
// SCHEMAS
// ============================================

const reportErrorSchema = z.object({
  message: z.string().min(1),
  level: z.enum(["error", "warn", "info"]).default("error"),
  stack: z.string().optional(),
  component: z.string().optional(),
  user: z.string().optional(),
  context: z.record(z.any()).optional(),
});

const listErrorSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

const searchDocsSchema = z.object({
  query: z.string().min(1).describe("Search term to find in documentation"),
  source: z
    .enum(["all", "ai-sdk", "openai", "vercel", "v0", "local"])
    .default("all")
    .describe("Which documentation source to search"),
  limit: z.number().int().min(1).max(20).default(5),
});

const getDocSchema = z.object({
  docPath: z
    .string()
    .min(1)
    .describe(
      "Path to doc file relative to docs folder, e.g. 'docgrab__ai-sdk.dev__docs/llms/llms.txt'"
    ),
});

// ============================================
// HELPERS: Filesystem
// ============================================

async function ensureEnvironment() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.appendFile(ERROR_LOG, "", { flag: "a" });
}

async function rotateLogIfNeeded() {
  try {
    const content = await fs.readFile(ERROR_LOG, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    if (lines.length > MAX_LOG_LINES) {
      const trimmed = lines.slice(-MAX_LOG_LINES).join("\n") + "\n";
      await fs.writeFile(ERROR_LOG, trimmed, { encoding: "utf8" });
      console.error(
        `[mpc] Rotated log: removed ${lines.length - MAX_LOG_LINES} old entries`
      );
    }
  } catch {
    // File doesn't exist or is empty - that's fine
  }
}

async function appendError(entry) {
  const line = JSON.stringify(entry);
  await fs.appendFile(ERROR_LOG, `${line}\n`, { encoding: "utf8" });
  await rotateLogIfNeeded();
}

async function readRecentErrors(limit) {
  try {
    const content = await fs.readFile(ERROR_LOG, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean).slice(-limit);
    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { corrupted: line };
      }
    });
  } catch (error) {
    return [{ error: `Could not read log: ${error.message}` }];
  }
}

// ============================================
// DOCS INDEXING (with subdirectories)
// ============================================

/**
 * Recursively find all doc files (.txt, .md, .json) in DOCS_DIR
 * Returns array of { relativePath, fullPath, name, ext, source }
 */
async function indexAllDocs() {
  const results = [];

  async function walk(dir, relPrefix = "") {
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
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".txt", ".md", ".json"].includes(ext)) {
          // Determine source from path
          let source = "local";
          if (relPath.includes("ai-sdk")) source = "ai-sdk";
          else if (relPath.includes("openai")) source = "openai";
          else if (relPath.includes("vercel.com")) source = "vercel";
          else if (relPath.includes("v0.app")) source = "v0";

          results.push({
            relativePath: relPath.replace(/\\/g, "/"),
            fullPath,
            name: entry.name,
            ext,
            source,
          });
        }
      }
    }
  }

  await walk(DOCS_DIR);
  return results;
}

/**
 * Search through indexed docs for a query string
 */
async function searchInDocs(query, source, limit) {
  const allDocs = await indexAllDocs();
  const queryLower = query.toLowerCase();
  const matches = [];

  // Filter by source if not "all"
  const filteredDocs =
    source === "all" ? allDocs : allDocs.filter((d) => d.source === source);

  for (const doc of filteredDocs) {
    try {
      const content = await fs.readFile(doc.fullPath, "utf8");
      const contentLower = content.toLowerCase();

      if (contentLower.includes(queryLower)) {
        // Find context around match
        const idx = contentLower.indexOf(queryLower);
        const start = Math.max(0, idx - 100);
        const end = Math.min(content.length, idx + query.length + 200);
        const snippet = content.slice(start, end).replace(/\s+/g, " ").trim();

        matches.push({
          path: doc.relativePath,
          source: doc.source,
          snippet:
            (start > 0 ? "..." : "") +
            snippet +
            (end < content.length ? "..." : ""),
        });

        if (matches.length >= limit) break;
      }
    } catch {
      // Skip files we can't read
    }
  }

  return matches;
}

// ============================================
// RESOURCE REGISTRATION
// ============================================

async function loadDocsIndex() {
  // Only load top-level .txt and .json files for backward compatibility
  const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        [".txt", ".json"].includes(path.extname(entry.name).toLowerCase())
    )
    .map((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      const mimeType = ext === ".json" ? "application/json" : "text/plain";
      const name = entry.name.slice(0, entry.name.length - ext.length);

      return {
        name,
        fileName: entry.name,
        uri: `docs://local/${name}`,
        mimeType,
        description: `Local doc ${entry.name}`,
      };
    });
}

async function registerDocResources() {
  const docsIndex = await loadDocsIndex();
  const template = new ResourceTemplate("docs://local/{name}", {
    list: async () => ({
      resources: docsIndex.map((doc) => ({
        uri: doc.uri,
        name: doc.name,
        description: doc.description,
        mimeType: doc.mimeType,
      })),
    }),
  });

  server.registerResource(
    "local-docs",
    template,
    {
      title: "Local MPC docs",
      description: "Docs stored in app/services/mpc/docs",
      mimeType: "text/plain",
    },
    async (_uri, variables) => {
      const doc = docsIndex.find((entry) => entry.name === variables.name);
      if (!doc) {
        throw new Error(`Doc ${variables.name} not found`);
      }

      const text = await fs.readFile(path.join(DOCS_DIR, doc.fileName), "utf8");
      return {
        contents: [
          {
            uri: doc.uri,
            mimeType: doc.mimeType,
            text,
          },
        ],
      };
    }
  );

  return docsIndex.length;
}

// ============================================
// TOOL REGISTRATION
// ============================================

function registerTools() {
  // --- report_error ---
  server.registerTool(
    "report_error",
    {
      title: "Report an error",
      description:
        "Persist an error/event to the local MPC log so Cursor agents can inspect it later.",
      inputSchema: reportErrorSchema,
    },
    async (args, extra) => {
      const entry = {
        ...args,
        timestamp: new Date().toISOString(),
        sessionId: extra?.sessionId ?? null,
        requestId: extra?.requestInfo?.id ?? null,
      };

      await appendError(entry);

      return {
        content: [
          {
            type: "text",
            text: `Logged ${entry.level} at ${entry.timestamp}`,
          },
        ],
        structuredContent: entry,
      };
    }
  );

  // --- list_errors ---
  server.registerTool(
    "list_errors",
    {
      title: "List recent errors",
      description: "Return the latest error entries from the local MPC log.",
      inputSchema: listErrorSchema,
    },
    async ({ limit }) => {
      const entries = await readRecentErrors(limit ?? 10);

      if (!entries.length) {
        return {
          content: [{ type: "text", text: "No error entries yet." }],
        };
      }

      const summary = entries
        .map((entry) => {
          if (entry.corrupted || entry.error) {
            return `[invalid] ${JSON.stringify(entry)}`;
          }
          return `[${entry.timestamp ?? "no-ts"}] ${entry.level ?? "info"} ${
            entry.message ?? "No message"
          }`;
        })
        .join("\n");

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { entries },
      };
    }
  );

  // --- search_docs ---
  server.registerTool(
    "search_docs",
    {
      title: "Search documentation",
      description:
        "Search through all scraped documentation (AI SDK, OpenAI, Vercel, v0) for a query string. Returns matching snippets with file paths.",
      inputSchema: searchDocsSchema,
    },
    async ({ query, source, limit }) => {
      const matches = await searchInDocs(query, source ?? "all", limit ?? 5);

      if (!matches.length) {
        return {
          content: [
            {
              type: "text",
              text: `No matches found for "${query}" in ${
                source ?? "all"
              } documentation.`,
            },
          ],
        };
      }

      const summary = matches
        .map((m, i) => `[${i + 1}] ${m.source} | ${m.path}\n    ${m.snippet}`)
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${matches.length} match(es) for "${query}":\n\n${summary}`,
          },
        ],
        structuredContent: { query, source, matches },
      };
    }
  );

  // --- get_doc ---
  server.registerTool(
    "get_doc",
    {
      title: "Get documentation file",
      description:
        "Read a specific documentation file by its relative path. Use search_docs first to find relevant files.",
      inputSchema: getDocSchema,
    },
    async ({ docPath }) => {
      const fullPath = path.join(DOCS_DIR, docPath);

      // Security: ensure path is within DOCS_DIR
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(DOCS_DIR))) {
        return {
          content: [
            { type: "text", text: "Error: Path is outside docs directory." },
          ],
        };
      }

      try {
        const content = await fs.readFile(resolved, "utf8");

        // Truncate if too long (>50k chars)
        const maxLen = 50000;
        const truncated = content.length > maxLen;
        const text = truncated
          ? content.slice(0, maxLen) + "\n\n[...truncated]"
          : content;

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            path: docPath,
            size: content.length,
            truncated,
          },
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error reading file: ${error.message}` },
          ],
        };
      }
    }
  );

  // --- list_doc_sources ---
  server.registerTool(
    "list_doc_sources",
    {
      title: "List documentation sources",
      description: "List all available documentation sources and file counts.",
      inputSchema: z.object({}),
    },
    async () => {
      const allDocs = await indexAllDocs();

      // Group by source
      const bySource = {};
      for (const doc of allDocs) {
        bySource[doc.source] = (bySource[doc.source] || 0) + 1;
      }

      // List docgrab folders
      const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });
      const folders = entries
        .filter((e) => e.isDirectory() && e.name.startsWith("docgrab__"))
        .map((e) => e.name);

      const summary = [
        `Documentation sources (${allDocs.length} files total):`,
        "",
        ...Object.entries(bySource).map(
          ([src, count]) => `  ${src}: ${count} files`
        ),
        "",
        "Scraped documentation folders:",
        ...folders.map((f) => `  - ${f}`),
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { totalFiles: allDocs.length, bySource, folders },
      };
    }
  );
}

// ============================================
// MAIN
// ============================================

async function start() {
  await ensureEnvironment();
  registerTools();
  const docsRegistered = await registerDocResources();

  // Count all docs including subdirs
  const allDocs = await indexAllDocs();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[mpc] ready with ${docsRegistered} top-level doc(s), ${allDocs.length} total indexed files; log at ${ERROR_LOG}`
  );
}

start().catch((error) => {
  console.error("[mpc] failed to start", error);
  process.exit(1);
});
