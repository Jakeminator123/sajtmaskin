#!/usr/bin/env npx tsx
/**
 * MCP server that exposes internal scaffold manifests, tags, and file
 * contents for interactive research in Cursor.
 *
 * Reads scaffold data directly from the TypeScript registry (no network
 * calls needed). Configured in .cursor/mcp.json as a stdio server.
 *
 * NOTE: This server exposes the 10 internal runtime scaffolds only.
 * External Vercel templates (_template_refs/) are NOT served here —
 * they are research refs for future scaffold creation.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getAllScaffolds, getScaffoldById, getScaffoldByFamily } from "../../src/lib/gen/scaffolds/registry";
import type { ScaffoldManifest } from "../../src/lib/gen/scaffolds/types";

const server = new McpServer({
  name: "sajtmaskin-scaffolds",
  version: "1.0.0",
});

function formatManifest(s: ScaffoldManifest): string {
  return [
    `## ${s.label} (${s.id})`,
    `Family: ${s.family}`,
    `Build intents: ${s.buildIntents.join(", ")}`,
    `Tags: ${s.tags.join(", ")}`,
    `Description: ${s.description}`,
    `Files: ${s.files.length}`,
    `Prompt hints: ${s.promptHints.length > 0 ? s.promptHints.join("; ") : "none"}`,
  ].join("\n");
}

server.tool(
  "list_scaffolds",
  "List all available internal scaffolds with their family, tags, and file counts.",
  {},
  async () => {
    const scaffolds = getAllScaffolds();
    const listing = scaffolds
      .map((s) => `- **${s.label}** (${s.id}) — family: ${s.family}, tags: [${s.tags.join(", ")}], files: ${s.files.length}`)
      .join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `${scaffolds.length} scaffolds available:\n\n${listing}`,
      }],
    };
  },
);

server.tool(
  "get_scaffold",
  "Get detailed information about a specific scaffold by ID or family name.",
  {
    identifier: z.string().describe("Scaffold ID (e.g. 'landing-page') or family name (e.g. 'ecommerce')"),
  },
  async ({ identifier }) => {
    const scaffold = getScaffoldById(identifier) ?? getScaffoldByFamily(identifier as any);

    if (!scaffold) {
      const all = getAllScaffolds();
      const available = all.map((s) => `${s.id} (${s.family})`).join(", ");
      return {
        content: [{
          type: "text" as const,
          text: `Scaffold "${identifier}" not found.\n\nAvailable: ${available}`,
        }],
        isError: true,
      };
    }

    const fileList = scaffold.files
      .map((f) => `  ${f.path} (${f.content.length} chars)`)
      .join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `${formatManifest(scaffold)}\n\n### File manifest\n${fileList}`,
      }],
    };
  },
);

server.tool(
  "get_scaffold_file",
  "Get the full content of a specific file from a scaffold.",
  {
    scaffoldId: z.string().describe("Scaffold ID (e.g. 'landing-page')"),
    filePath: z.string().describe("File path within the scaffold (e.g. 'app/page.tsx')"),
  },
  async ({ scaffoldId, filePath }) => {
    const scaffold = getScaffoldById(scaffoldId);
    if (!scaffold) {
      return {
        content: [{
          type: "text" as const,
          text: `Scaffold "${scaffoldId}" not found.`,
        }],
        isError: true,
      };
    }

    const file = scaffold.files.find(
      (f) => f.path === filePath || f.path === `/${filePath}`,
    );

    if (!file) {
      const available = scaffold.files.map((f) => f.path).join(", ");
      return {
        content: [{
          type: "text" as const,
          text: `File "${filePath}" not found in scaffold "${scaffoldId}".\n\nAvailable files: ${available}`,
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: `--- ${file.path} (scaffold: ${scaffold.label}) ---\n${file.content}`,
      }],
    };
  },
);

server.tool(
  "search_scaffolds_by_tag",
  "Find scaffolds that match given tags or keywords.",
  {
    query: z.string().describe("Space or comma-separated tags/keywords to search for"),
  },
  async ({ query }) => {
    const terms = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const scaffolds = getAllScaffolds();

    const matches = scaffolds
      .map((s) => {
        const searchable = `${s.label} ${s.family} ${s.tags.join(" ")} ${s.description} ${s.promptHints.join(" ")}`.toLowerCase();
        const hits = terms.filter((t) => searchable.includes(t));
        return { scaffold: s, hits: hits.length, matched: hits };
      })
      .filter((m) => m.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    if (matches.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No scaffolds match "${query}".`,
        }],
      };
    }

    const listing = matches
      .map((m) => `- **${m.scaffold.label}** (${m.scaffold.id}) — matched: [${m.matched.join(", ")}]`)
      .join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `Found ${matches.length} scaffolds matching "${query}":\n\n${listing}`,
      }],
    };
  },
);

server.tool(
  "compare_scaffolds",
  "Compare two scaffolds side by side: files, tags, and structure.",
  {
    scaffoldA: z.string().describe("First scaffold ID"),
    scaffoldB: z.string().describe("Second scaffold ID"),
  },
  async ({ scaffoldA, scaffoldB }) => {
    const a = getScaffoldById(scaffoldA);
    const b = getScaffoldById(scaffoldB);

    if (!a || !b) {
      return {
        content: [{
          type: "text" as const,
          text: `One or both scaffolds not found: ${scaffoldA}, ${scaffoldB}`,
        }],
        isError: true,
      };
    }

    const aFiles = new Set(a.files.map((f) => f.path));
    const bFiles = new Set(b.files.map((f) => f.path));
    const shared = [...aFiles].filter((f) => bFiles.has(f));
    const onlyA = [...aFiles].filter((f) => !bFiles.has(f));
    const onlyB = [...bFiles].filter((f) => !aFiles.has(f));

    return {
      content: [{
        type: "text" as const,
        text: [
          `## Comparison: ${a.label} vs ${b.label}`,
          "",
          `| | ${a.label} | ${b.label} |`,
          `|---|---|---|`,
          `| Family | ${a.family} | ${b.family} |`,
          `| Files | ${a.files.length} | ${b.files.length} |`,
          `| Tags | ${a.tags.join(", ")} | ${b.tags.join(", ")} |`,
          `| Intents | ${a.buildIntents.join(", ")} | ${b.buildIntents.join(", ")} |`,
          "",
          `### Shared files (${shared.length})`,
          shared.map((f) => `- ${f}`).join("\n") || "(none)",
          "",
          `### Only in ${a.label} (${onlyA.length})`,
          onlyA.map((f) => `- ${f}`).join("\n") || "(none)",
          "",
          `### Only in ${b.label} (${onlyB.length})`,
          onlyB.map((f) => `- ${f}`).join("\n") || "(none)",
        ].join("\n"),
      }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Scaffold MCP server failed to start:", err);
  process.exit(1);
});
