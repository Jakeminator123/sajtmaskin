#!/usr/bin/env npx tsx
/**
 * MCP server that exposes generated site code from sajtmaskin.
 *
 * Reads SAJTMASKIN_BASE_URL and MCP_GENERATED_CODE_API_KEY from env,
 * then proxies requests to the app's integration route. Works both
 * against a local dev server and a production deployment.
 *
 * Configured in .cursor/mcp.json as a stdio server.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (
  process.env.SAJTMASKIN_BASE_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const API_KEY = process.env.MCP_GENERATED_CODE_API_KEY ?? "";

const ROUTE = "/api/integrations/mcp/generated-code";
const GENERATE_ROUTE = "/api/integrations/mcp/generate-site";

async function fetchFromApp(
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(ROUTE, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "x-api-key": API_KEY,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `App returned ${res.status}: ${text.slice(0, 400)}`,
    );
  }

  return res.json();
}

async function postToApp(
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(ROUTE, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `App returned ${res.status}: ${text.slice(0, 400)}`,
    );
  }

  return res.json();
}

async function postToGenerateApp(
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(GENERATE_ROUTE, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8 * 60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `App returned ${res.status}: ${text.slice(0, 800)}`,
    );
  }

  return res.json();
}

const server = new McpServer({
  name: "sajtmaskin-generated-code",
  version: "1.0.0",
});

server.tool(
  "get_generated_files",
  "Fetch all generated files for a sajtmaskin chat/version. " +
    "Returns full file contents (name, content, language) for every file in the generated site.",
  {
    chatId: z.string().describe("The v0/own-engine chat ID"),
    versionId: z
      .string()
      .optional()
      .describe("Specific version ID (omit for latest)"),
    materialize: z
      .boolean()
      .optional()
      .describe("Upload placeholder images to Vercel Blob (default false)"),
  },
  async ({ chatId, versionId }) => {
    const data = (await fetchFromApp({
      chatId,
      ...(versionId ? { versionId } : {}),
      format: "json",
    })) as {
      chatId: string;
      versionId: string | null;
      files: Array<{ name: string; content: string; language?: string }>;
    };

    const text = data.files
      .map(
        (f) =>
          `--- ${f.name} (${f.language ?? "text"}) ---\n${f.content}`,
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${data.files.length} files for chat ${data.chatId}` +
            (data.versionId ? ` version ${data.versionId}` : "") +
            `:\n\n${text}`,
        },
      ],
    };
  },
);

server.tool(
  "generate_site_from_prompt",
  "Generate a brand-new site from a prompt, save it as a chat/version, and return either a preview URL or a real sandbox runtime URL.",
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
    thinking: z
      .boolean()
      .optional()
      .describe("Enable model reasoning"),
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
      .describe("preview = own-engine iframe preview, sandbox = real runtime URL"),
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
    const data = (await postToGenerateApp({
      prompt,
      ...(buildIntent ? { buildIntent } : {}),
      ...(modelId ? { modelId } : {}),
      ...(typeof thinking === "boolean" ? { thinking } : {}),
      ...(typeof imageGenerations === "boolean" ? { imageGenerations } : {}),
      ...(scaffoldMode ? { scaffoldMode } : {}),
      ...(scaffoldId ? { scaffoldId } : {}),
      ...(runtimeMode ? { runtimeMode } : {}),
    })) as {
      success: boolean;
      projectId: string;
      chatId: string;
      versionId: string;
      messageId: string;
      previewUrl: string;
      runtimeMode: "preview" | "sandbox";
      runtimeUrl: string | null;
      sandboxId?: string;
      runtime?: string;
      ports?: number[];
      scaffoldId: string | null;
      filesCount: number;
    };

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
          ].filter(Boolean).join("\n"),
        },
      ],
    };
  },
);

server.tool(
  "create_generated_runtime_url",
  "Create a URL for a generated site version. " +
    "Use mode=preview for own-engine HTML preview, or mode=sandbox for a real runtime URL via Vercel Sandbox.",
  {
    chatId: z.string().describe("The v0/own-engine chat ID"),
    versionId: z
      .string()
      .optional()
      .describe("Specific version ID (recommended)"),
    mode: z
      .enum(["preview", "sandbox"])
      .optional()
      .describe("preview = iframe-style own-engine preview, sandbox = real runtime URL"),
  },
  async ({ chatId, versionId, mode }) => {
    const data = (await postToApp({
      chatId,
      ...(versionId ? { versionId } : {}),
      mode: mode ?? "sandbox",
    })) as {
      mode: "preview" | "sandbox";
      chatId: string;
      versionId?: string | null;
      url?: string;
      sandboxId?: string;
      primaryUrl?: string | null;
      ports?: number[];
      runtime?: string;
    };

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
            data.sandboxId ? `Sandbox ID: ${data.sandboxId}` : null,
            data.runtime ? `Runtime: ${data.runtime}` : null,
            `URL: ${resolvedUrl}`,
          ].filter(Boolean).join("\n"),
        },
      ],
    };
  },
);

server.tool(
  "get_generated_manifest",
  "Get a lightweight manifest (file names, sizes, languages) without full content. " +
    "Useful for understanding project structure before fetching specific files.",
  {
    chatId: z.string().describe("The v0/own-engine chat ID"),
    versionId: z
      .string()
      .optional()
      .describe("Specific version ID (omit for latest)"),
  },
  async ({ chatId, versionId }) => {
    const data = (await fetchFromApp({
      chatId,
      ...(versionId ? { versionId } : {}),
      format: "manifest",
    })) as {
      chatId: string;
      versionId: string | null;
      totalFiles: number;
      totalBytes: number;
      files: Array<{ name: string; language: string; bytes: number }>;
    };

    const listing = data.files
      .map((f) => `  ${f.name}  (${f.language}, ${f.bytes} bytes)`)
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Project manifest — ${data.totalFiles} files, ${data.totalBytes} bytes total` +
            `\nChat: ${data.chatId}` +
            (data.versionId ? `\nVersion: ${data.versionId}` : "") +
            `\n\n${listing}`,
        },
      ],
    };
  },
);

server.tool(
  "get_generated_file",
  "Fetch a single file by name from a generated site. " +
    "Use get_generated_manifest first to discover available file names.",
  {
    chatId: z.string().describe("The v0/own-engine chat ID"),
    fileName: z.string().describe("Exact file path/name to retrieve"),
    versionId: z
      .string()
      .optional()
      .describe("Specific version ID (omit for latest)"),
  },
  async ({ chatId, fileName, versionId }) => {
    const data = (await fetchFromApp({
      chatId,
      ...(versionId ? { versionId } : {}),
      format: "json",
    })) as {
      files: Array<{ name: string; content: string; language?: string }>;
    };

    const file = data.files.find(
      (f) => f.name === fileName || f.name === `/${fileName}`,
    );

    if (!file) {
      const available = data.files.map((f) => f.name).join(", ");
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
          text: `--- ${file.name} (${file.language ?? "text"}) ---\n${file.content}`,
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
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
