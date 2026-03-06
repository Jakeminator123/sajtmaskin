import { NextResponse } from "next/server";
import { regenerateTemplateEmbeddings } from "@/lib/templates/template-embeddings-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  const headerSecret = req.headers.get("x-cron-secret") || "";

  return bearer === secret || headerSecret === secret;
}

function isEnabled(): boolean {
  return process.env.TEMPLATE_EMBEDDINGS_AUTO_REBUILD?.trim().toLowerCase() === "true";
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isEnabled()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "TEMPLATE_EMBEDDINGS_AUTO_REBUILD is disabled.",
    });
  }

  try {
    const result = await regenerateTemplateEmbeddings();
    return NextResponse.json({
      success: true,
      skipped: false,
      storage: result.storage,
      persistedTo: result.persistedTo,
      count: result.generated._meta.count,
      model: result.generated._meta.model,
      elapsedMs: result.elapsedMs,
      message: "Template embeddings refreshed.",
    });
  } catch (error) {
    console.error("[API/cron/templates/embeddings] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cron embeddings refresh failed",
      },
      { status: 500 },
    );
  }
}
