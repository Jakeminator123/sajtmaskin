import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, "docs");
const LLM_DOCS_DIR = path.join(__dirname, "..", "..", "LLM");
const LOGS_DIR = path.join(__dirname, "logs");
const ACCESS_LOG = path.join(LOGS_DIR, "access-log.jsonl");

// Logg-rotation: max antal rader innan äldre tas bort
const MAX_LOG_LINES = 500;
const SUPPORTED_EXTS = new Set([".txt", ".md", ".json"]);
const MAX_DEDUPE_BYTES = 512 * 1024; // Only compare small files to avoid heavy IO

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
 * Recursively find all doc files in configured doc sources.
 * Returns array of { resourceName, relativePath, fullPath, mimeType, ext }
 */
async function indexAllDocs() {
  const results = [];
  const normalizedIndex = new Map();
  const docSources = [
    { dir: DOCS_DIR, prefix: "", priority: 0 },
    { dir: LLM_DOCS_DIR, prefix: "llm", priority: 1 },
  ];

  async function areFilesIdentical(fileA, fileB, size) {
    if (size > MAX_DEDUPE_BYTES) return false;
    const [bufA, bufB] = await Promise.all([fs.readFile(fileA), fs.readFile(fileB)]);
    return bufA.equals(bufB);
  }

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
          const stat = await fs.stat(fullPath);
          const relativePath = relPath.replace(/\\/g, "/");
          const resourceName = relativePath.slice(0, relativePath.length - ext.length);
          const normalizedPath = relativePath.replace(/^llm\//, "");
          const normalizedName = normalizedPath.slice(0, normalizedPath.length - ext.length);
          const size = stat.size;
          const existingBySize = normalizedIndex.get(normalizedName);
          if (existingBySize && existingBySize.has(size) && size <= MAX_DEDUPE_BYTES) {
            const candidates = existingBySize.get(size) || [];
            let isDuplicate = false;
            for (const candidate of candidates) {
              if (await areFilesIdentical(candidate.fullPath, fullPath, size)) {
                isDuplicate = true;
                break;
              }
            }
            if (isDuplicate) {
              continue;
            }
          }
          const mimeType =
            ext === ".json" ? "application/json" : ext === ".md" ? "text/markdown" : "text/plain";

          results.push({
            resourceName,
            relativePath,
            fullPath,
            mimeType,
            ext,
          });
          const nextBySize = existingBySize || new Map();
          const list = nextBySize.get(size) || [];
          list.push({ fullPath });
          nextBySize.set(size, list);
          normalizedIndex.set(normalizedName, nextBySize);
        }
      }
    }
  }

  for (const source of docSources) {
    const prefix = source.prefix ? source.prefix : "";
    await walk(source.dir, prefix);
  }
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
      description: "Docs stored in services/mpc/docs and LLM/",
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
