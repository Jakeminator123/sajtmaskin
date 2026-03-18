import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { readPreviewDiagnosticMeta } from "@/lib/gen/preview-diagnostics";
import {
  createEngineVersionErrorLog,
  createEngineVersionErrorLogs,
  getEngineVersionErrorLogs,
} from "@/lib/db/services";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

type ErrorLogPayload = {
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

type ErrorLogRow = {
  level: string;
  category?: string | null;
  message: string;
  meta?: unknown;
};

function buildErrorLogSummary(logs: ErrorLogRow[]) {
  const byLevel = { info: 0, warning: 0, error: 0 };
  const byCategory: Record<string, number> = {};

  for (const log of logs) {
    const level =
      log.level === "error" || log.level === "warning" || log.level === "info"
        ? log.level
        : "info";
    byLevel[level] += 1;
    const category = typeof log.category === "string" && log.category.trim()
      ? log.category.trim()
      : "uncategorized";
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }

  const latestRender =
    logs.find((log) => log.category === "render-telemetry" || log.category === "preview") ?? null;
  const latestRenderMeta = readPreviewDiagnosticMeta(latestRender?.meta);

  return {
    total: logs.length,
    byLevel,
    byCategory,
    latestPreflight:
      logs.find((log) => typeof log.category === "string" && log.category.startsWith("preflight:")) ?? null,
    latestQualityGate:
      logs.find(
        (log) =>
          typeof log.category === "string" &&
          (log.category === "preflight:quality-gate" || log.category.startsWith("quality-gate:")),
      ) ?? null,
    latestRender,
    latestPreviewCode: latestRenderMeta.previewCode,
    latestPreviewStage: latestRenderMeta.previewStage,
  };
}

export async function POST(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const internalChatId = scopedVersion.chat.id;
    const internalVersionId = scopedVersion.version.id;
    const body = (await request.json().catch(() => null)) as
      | { logs?: ErrorLogPayload[] }
      | ErrorLogPayload
      | null;
    if (!body) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    if ("logs" in body && Array.isArray(body.logs)) {
      const rows = await createEngineVersionErrorLogs(
        body.logs.map((log) => ({
          chatId: internalChatId,
          versionId: internalVersionId,
          level: log.level,
          category: log.category || null,
          message: log.message,
          meta: log.meta || null,
        })),
      );
      return NextResponse.json({ success: true, stored: true, logs: rows });
    }

    const payload = body as ErrorLogPayload;
    const row = await createEngineVersionErrorLog({
      chatId: internalChatId,
      versionId: internalVersionId,
      level: payload.level,
      category: payload.category || null,
      message: payload.message,
      meta: payload.meta || null,
    });
    return NextResponse.json({ success: true, stored: true, log: row });
  } catch (error) {
    console.error("[API] Failed to store version error log:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const logs = await getEngineVersionErrorLogs(scopedVersion.version.id);
    return NextResponse.json({ success: true, stored: true, logs, summary: buildErrorLogSummary(logs) });
  } catch (error) {
    console.error("[API] Failed to load version error logs:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
