import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { regenerateTemplateEmbeddings } from "@/lib/templates/template-embeddings-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

type RequestBody = {
  dryRun?: boolean;
};

export async function POST(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;

  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Template embeddings ar lokala och commitade artifacts. Regenerera dem lokalt och deploya om produktionen.",
      },
      { status: 409 },
    );
  }

  try {
    const result = await regenerateTemplateEmbeddings({
      dryRun: Boolean(body?.dryRun),
    });

    return NextResponse.json({
      success: true,
      storage: result.storage,
      persisted: result.persisted,
      persistedTo: result.persistedTo,
      count: result.generated._meta.count,
      model: result.generated._meta.model,
      dimensions: result.generated._meta.dimensions,
      elapsedMs: result.elapsedMs,
      message: result.persisted
        ? `Inbäddningar byggdes om och sparades (${result.storage}).`
        : "Inbäddningar byggdes om (provkörning, inget sparat).",
    });
  } catch (error) {
    console.error("[API/admin/templates/embeddings] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Kunde inte bygga om inbäddningar",
      },
      { status: 500 },
    );
  }
}
