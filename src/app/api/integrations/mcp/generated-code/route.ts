import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as chatRepo from "@/lib/db/chat-repository";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getVersionFiles, getLatestVersionFiles } from "@/lib/gen/version-manager";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";
import { assertV0Key, v0 } from "@/lib/v0";
import { hasValidMcpApiKey } from "@/lib/mcp/auth";
import {
  buildOwnEnginePreviewRuntime,
  createSandboxRuntimeFromFiles,
} from "@/lib/mcp/runtime-url";

export const runtime = "nodejs";

const querySchema = z.object({
  chatId: z.string().min(1),
  versionId: z.string().optional(),
  format: z.enum(["json", "manifest"]).default("json"),
});

const sandboxRequestSchema = z.object({
  chatId: z.string().min(1),
  versionId: z.string().optional(),
  mode: z.enum(["preview", "sandbox"]).default("sandbox"),
  runtime: z.enum(["node24", "node22", "python3.13"]).optional().default("node24"),
  vcpus: z.number().min(1).max(8).optional().default(2),
  timeoutMs: z.number().min(30_000).max(15 * 60_000).optional().default(5 * 60_000),
  installCommand: z.string().optional().default("npm install"),
  startCommand: z.string().optional().default("npm run dev"),
  ports: z.array(z.number()).optional().default([3000]),
});

type FileEntry = { name: string; content: string; language?: string };

function getOwnEngineProjectId(chatId: string): string | null {
  if (shouldUseV0Fallback()) return null;
  const chat = chatRepo.getChat(chatId);
  return typeof chat?.project_id === "string" && chat.project_id.trim()
    ? chat.project_id
    : null;
}

export async function GET(req: NextRequest) {
  if (!hasValidMcpApiKey(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    chatId: searchParams.get("chatId") ?? undefined,
    versionId: searchParams.get("versionId") ?? undefined,
    format: searchParams.get("format") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { chatId, versionId, format } = parsed.data;
  const projectId = getOwnEngineProjectId(chatId);

  try {
    const files = await fetchFiles(chatId, versionId ?? null);

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files found", chatId, versionId: versionId ?? null },
        { status: 404 },
      );
    }

    if (format === "manifest") {
      return NextResponse.json({
        projectId,
        chatId,
        versionId: versionId ?? null,
        totalFiles: files.length,
        totalBytes: files.reduce((sum, f) => sum + f.content.length, 0),
        files: files.map((f) => ({
          name: f.name,
          language: f.language ?? inferLanguage(f.name),
          bytes: f.content.length,
        })),
      });
    }

    return NextResponse.json({
      projectId,
      chatId,
      versionId: versionId ?? null,
      files,
    });
  } catch (err) {
    console.error("[mcp/generated-code] Error fetching files:", err);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!hasValidMcpApiKey(req)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sandboxRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    chatId,
    versionId,
    mode,
    runtime,
    vcpus,
    timeoutMs,
    installCommand,
    startCommand,
    ports,
  } = parsed.data;
  const projectId = getOwnEngineProjectId(chatId);

  try {
    if (mode === "preview") {
      if (shouldUseV0Fallback()) {
        return NextResponse.json(
          { error: "Own-engine preview URL is not available in v0 fallback mode" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        buildOwnEnginePreviewRuntime({
          chatId,
          versionId: versionId ?? null,
          projectId,
        }),
      );
    }

    const files = await fetchFiles(chatId, versionId ?? null);
    if (!files.length) {
      return NextResponse.json(
        { error: "No files found", chatId, versionId: versionId ?? null },
        { status: 404 },
      );
    }

    const sandboxRuntime = await createSandboxRuntimeFromFiles(files, {
      runtime,
      vcpus,
      timeoutMs,
      installCommand,
      startCommand,
      ports,
    });

    return NextResponse.json({
      ...sandboxRuntime,
      projectId,
      chatId,
      versionId: versionId ?? null,
    });
  } catch (err) {
    console.error("[mcp/generated-code] Error creating runtime URL:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create runtime URL" },
      { status: 500 },
    );
  }
}

async function fetchFiles(
  chatId: string,
  versionId: string | null,
): Promise<FileEntry[]> {
  if (!shouldUseV0Fallback()) {
    const raw = versionId
      ? getVersionFiles(versionId)
      : getLatestVersionFiles(chatId);
    if (!raw) return [];
    return raw.map((f) => ({
      name: f.path,
      content: f.content,
      language: f.language,
    }));
  }

  assertV0Key();

  const chat = await v0.chats.getById({ chatId });
  const targetVersionId =
    versionId ?? getV0LatestVersionId(chat) ?? null;

  if (!targetVersionId) return [];

  const result = await resolveVersionFiles({
    chatId,
    versionId: targetVersionId,
    options: { maxAttempts: 10, delayMs: 1500, minFiles: 1 },
  });

  if (result.files.length > 0) {
    return result.files.map((f) => ({
      name: f.name,
      content: typeof f.content === "string" ? f.content : "",
      language: inferLanguage(f.name),
    }));
  }

  const versionData = result.version as {
    files?: Array<{ name: string; content?: string }>;
  } | null;
  if (versionData?.files && Array.isArray(versionData.files)) {
    return versionData.files.map((f) => ({
      name: f.name,
      content: typeof f.content === "string" ? f.content : "",
      language: inferLanguage(f.name),
    }));
  }

  return [];
}

function getV0LatestVersionId(chat: unknown): string | null {
  const payload = chat as {
    latestVersion?: { id?: string | null } | null;
  } | null;
  const id = payload?.latestVersion?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function inferLanguage(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    tsx: "tsx",
    ts: "ts",
    jsx: "jsx",
    js: "js",
    css: "css",
    json: "json",
    md: "md",
    html: "html",
  };
  return map[ext] ?? "text";
}
