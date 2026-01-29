import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "docs");
const LOGS_DIR = path.join(__dirname, "logs");
const ACCESS_LOG = path.join(LOGS_DIR, "access-log.jsonl");

// Logg-rotation: max antal rader innan äldre tas bort
const MAX_LOG_LINES = 500;
const SUPPORTED_EXTS = new Set([".txt", ".md", ".json"]);

const server = new McpServer(
  { name: "sajtmaskin-mpc", version: "0.3.0" },
  {
    capabilities: {
      resources: { listChanged: true },
    },
  },
);

// ============================================
// HELPERS: Filesystem + logging
// ============================================

async function ensureEnvironment() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.appendFile(ACCESS_LOG, "", { flag: "a" });
}

async function rotateLogIfNeeded() {
  try {
    const content = await fs.readFile(ACCESS_LOG, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);

    if (lines.length > MAX_LOG_LINES) {
      const trimmed = lines.slice(-MAX_LOG_LINES).join("\n") + "\n";
      await fs.writeFile(ACCESS_LOG, trimmed, { encoding: "utf8" });
      console.error(
        `[mpc] Rotated access log: removed ${lines.length - MAX_LOG_LINES} old entries`,
      );
    }
  } catch {
    // File doesn't exist or is empty - that's fine
  }
}

async function appendAccessLog(entry) {
  const line = JSON.stringify({
    ...entry,
    timestamp: entry?.timestamp ?? new Date().toISOString(),
  });
  await fs.appendFile(ACCESS_LOG, `${line}\n`, { encoding: "utf8" });
  await rotateLogIfNeeded();
}

// ============================================
// DOCS INDEXING (with subdirectories)
// ============================================

/**
 * Recursively find all doc files in DOCS_DIR.
 * Returns array of { resourceName, relativePath, fullPath, mimeType, ext }
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
        if (SUPPORTED_EXTS.has(ext)) {
          const relativePath = relPath.replace(/\\/g, "/");
          const resourceName = relativePath.slice(0, relativePath.length - ext.length);
          const mimeType =
            ext === ".json" ? "application/json" : ext === ".md" ? "text/markdown" : "text/plain";

          results.push({
            resourceName,
            relativePath,
            fullPath,
            mimeType,
            ext,
          });
        }
      }
    }
  }

  await walk(DOCS_DIR);
  return results.sort((a, b) => a.resourceName.localeCompare(b.resourceName));
}

// ============================================
// RESOURCE REGISTRATION
// ============================================

async function registerDocResources() {
  const initialDocs = await indexAllDocs();
  const template = new ResourceTemplate("docs://local/{name}", {
    list: async () => {
      const docsIndex = await indexAllDocs();
      await appendAccessLog({ event: "list", count: docsIndex.length });
      console.error(`[mpc] list docs: ${docsIndex.length}`);

      return {
        resources: docsIndex.map((doc) => ({
          uri: `docs://local/${doc.resourceName}`,
          name: doc.resourceName,
          description: `Local doc ${doc.relativePath}`,
          mimeType: doc.mimeType,
        })),
      };
    },
  });

  server.registerResource(
    "local-docs",
    template,
    {
      title: "Local MPC docs",
      description: "Docs stored in services/mpc/docs",
      mimeType: "text/plain",
    },
    async (_uri, variables) => {
      const docsIndex = await indexAllDocs();
      const doc = docsIndex.find((entry) => entry.resourceName === variables.name);
      if (!doc) {
        await appendAccessLog({ event: "missing", name: variables.name });
        console.error(`[mpc] missing doc: ${variables.name}`);
        throw new Error(`Doc ${variables.name} not found`);
      }

      const text = await fs.readFile(doc.fullPath, "utf8");
      await appendAccessLog({
        event: "read",
        name: doc.resourceName,
        path: doc.relativePath,
        bytes: text.length,
      });
      console.error(`[mpc] read ${doc.relativePath} (${text.length} chars)`);

      return {
        contents: [
          {
            uri: `docs://local/${doc.resourceName}`,
            mimeType: doc.mimeType,
            text,
          },
        ],
      };
    },
  );

  return initialDocs.length;
}

// ============================================
// MAIN
// ============================================

async function start() {
  await ensureEnvironment();
  const docsRegistered = await registerDocResources();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[mpc] ready with ${docsRegistered} doc(s); access log at ${ACCESS_LOG}`);
}

start().catch((error) => {
  console.error("[mpc] failed to start", error);
  process.exit(1);
});
