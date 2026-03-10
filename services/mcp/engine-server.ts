#!/usr/bin/env npx tsx
/**
 * Direct local MCP server for the sajtmaskin own engine.
 *
 * This server talks straight to local engine libraries and storage instead of
 * proxying through Next.js HTTP routes. That keeps local agent workflows out
 * of project runtime / production integration paths.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { generateSiteFromPrompt } from "../../src/lib/mcp/generate-site";
import {
  createLocalGeneratedRuntime,
  loadGeneratedFile,
  loadGeneratedFiles,
  loadGeneratedManifest,
} from "../../src/lib/mcp/local-engine";

const server = new McpServer({
  name: "sajtmaskin-engine",
  version: "1.0.0",
});

server.tool(
  "generate_site",
  "Generate a brand-new site with the local own engine and return identifiers plus preview/runtime URLs.",
  {
    prompt: z.string().describe("User prompt describing the site or app to generate"),
    buildIntent: z
      .enum(["website", "template", "app"])
      .optional()
      .describe("website = normal site, template = small scope, app = interactive app"),
    modelId: z
      .string()
      .optional()
      .describe("Optional model/tier override, e.g. 'v0-max-fast'"),
    thinking: z.boolean().optional().describe("Enable model reasoning"),
    imageGenerations: z
      .boolean()
      .optional()
      .describe("Allow image generation/materialization"),
    scaffoldMode: z
      .enum(["auto", "manual", "off"])
      .optional()
      .describe("How scaffold selection should work"),
    scaffoldId: z
      .string()
      .optional()
      .describe("Specific scaffold ID if scaffoldMode=manual"),
    runtimeMode: z
      .enum(["preview", "sandbox"])
      .optional()
      .describe("preview = own-engine preview, sandbox = real runtime URL"),
  },
  async ({
    prompt,
    buildIntent,
    modelId,
    thinking,
    imageGenerations,
    scaffoldMode,
    scaffoldId,
    runtimeMode,
  }) => {
    const data = await generateSiteFromPrompt({
      prompt,
      buildIntent,
      modelId,
      thinking,
      imageGenerations,
      scaffoldMode,
      scaffoldId,
      runtimeMode,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Project ID: ${data.projectId}`,
            `Chat ID: ${data.chatId}`,
            `Version ID: ${data.versionId}`,
            `Message ID: ${data.messageId}`,
            `Scaffold: ${data.scaffoldId ?? "none"}`,
            `Files: ${data.filesCount}`,
            `Preview URL: ${data.previewUrl}`,
            `Runtime mode: ${data.runtimeMode}`,
            data.runtimeUrl ? `Runtime URL: ${data.runtimeUrl}` : null,
            data.sandboxId ? `Sandbox ID: ${data.sandboxId}` : null,
            data.runtime ? `Runtime: ${data.runtime}` : null,
            data.ports?.length ? `Ports: ${data.ports.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

server.tool(
  "get_site_files",
  "Fetch all generated files for an own-engine or v0-backed chat/version.",
  {
    chatId: z.string().describe("The chat ID"),
    versionId: z.string().optional().describe("Specific version ID (omit for latest)"),
  },
  async ({ chatId, versionId }) => {
    const files = await loadGeneratedFiles(chatId, versionId);
    const text = files
      .map((file) => `--- ${file.name} (${file.language}) ---\n${file.content}`)
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Found ${files.length} files for chat ${chatId}` +
            (versionId ? ` version ${versionId}` : "") +
            `:\n\n${text}`,
        },
      ],
    };
  },
);

server.tool(
  "get_site_manifest",
  "Get a lightweight generated project manifest without full file contents.",
  {
    chatId: z.string().describe("The chat ID"),
    versionId: z.string().optional().describe("Specific version ID (omit for latest)"),
  },
  async ({ chatId, versionId }) => {
    const data = await loadGeneratedManifest(chatId, versionId);
    const listing = data.files
      .map((file) => `  ${file.name} (${file.language}, ${file.bytes} bytes)`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Project manifest — ${data.totalFiles} files, ${data.totalBytes} bytes total` +
            `\nChat: ${data.chatId}` +
            (data.versionId ? `\nVersion: ${data.versionId}` : "") +
            (data.projectId ? `\nProject: ${data.projectId}` : "") +
            `\n\n${listing}`,
        },
      ],
    };
  },
);

server.tool(
  "get_site_file",
  "Fetch a single generated file by exact file path/name.",
  {
    chatId: z.string().describe("The chat ID"),
    fileName: z.string().describe("Exact file path/name to retrieve"),
    versionId: z.string().optional().describe("Specific version ID (omit for latest)"),
  },
  async ({ chatId, fileName, versionId }) => {
    const file = await loadGeneratedFile(chatId, fileName, versionId);
    if (!file) {
      const manifest = await loadGeneratedManifest(chatId, versionId);
      const available = manifest.files.map((entry) => entry.name).join(", ");
      return {
        content: [
          {
            type: "text" as const,
            text: `File "${fileName}" not found. Available files: ${available}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `--- ${file.name} (${file.language}) ---\n${file.content}`,
        },
      ],
    };
  },
);

server.tool(
  "create_site_runtime",
  "Create a runtime URL for a generated site version using preview or sandbox mode.",
  {
    chatId: z.string().describe("The chat ID"),
    versionId: z.string().optional().describe("Specific version ID (recommended)"),
    mode: z
      .enum(["preview", "sandbox"])
      .optional()
      .describe("preview = iframe-style own-engine preview, sandbox = real runtime URL"),
  },
  async ({ chatId, versionId, mode }) => {
    const data = await createLocalGeneratedRuntime({
      chatId,
      versionId,
      mode: mode ?? "sandbox",
    });

    const resolvedUrl = data.primaryUrl ?? data.url ?? null;
    if (!resolvedUrl) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No runtime URL was returned for chat ${chatId}.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Mode: ${data.mode}`,
            `Chat: ${data.chatId}`,
            data.versionId ? `Version: ${data.versionId}` : null,
            data.projectId ? `Project: ${data.projectId}` : null,
            data.sandboxId ? `Sandbox ID: ${data.sandboxId}` : null,
            data.runtime ? `Runtime: ${data.runtime}` : null,
            `URL: ${resolvedUrl}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Engine MCP server failed to start:", err);
  process.exit(1);
});
