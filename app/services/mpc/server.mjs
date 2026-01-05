import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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
  { name: "sajtmaskin-mpc", version: "0.1.0" },
  {
    capabilities: {
      resources: { listChanged: true },
      tools: { listChanged: true },
    },
  }
);

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

async function ensureEnvironment() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
  // Keep the log file around so appends never fail.
  await fs.appendFile(ERROR_LOG, "", { flag: "a" });
}

async function rotateLogIfNeeded() {
  try {
    const content = await fs.readFile(ERROR_LOG, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    if (lines.length > MAX_LOG_LINES) {
      // Behåll senaste MAX_LOG_LINES rader
      const trimmed = lines.slice(-MAX_LOG_LINES).join("\n") + "\n";
      await fs.writeFile(ERROR_LOG, trimmed, { encoding: "utf8" });
      console.error(`[mpc] Rotated log: removed ${lines.length - MAX_LOG_LINES} old entries`);
    }
  } catch {
    // File doesn't exist or is empty - that's fine
  }
}

async function appendError(entry) {
  const line = JSON.stringify(entry);
  await fs.appendFile(ERROR_LOG, `${line}\n`, { encoding: "utf8" });
  // Rotera vid behov (kör inte varje gång för prestanda)
  await rotateLogIfNeeded();
}

async function readRecentErrors(limit) {
  try {
    const content = await fs.readFile(ERROR_LOG, "utf8");
    const lines = content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit);
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

async function loadDocsIndex() {
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

function registerTools() {
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
}

async function start() {
  await ensureEnvironment();
  registerTools();
  const docsRegistered = await registerDocResources();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Surface readiness info to the host (Cursor shows stderr in the MCP output).
  console.error(
    `[mpc] ready with ${docsRegistered} doc(s); log file at ${ERROR_LOG}`
  );
}

start().catch((error) => {
  console.error("[mpc] failed to start", error);
  process.exit(1);
});

