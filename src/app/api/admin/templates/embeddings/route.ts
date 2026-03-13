import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { regenerateTemplateEmbeddings } from "@/lib/templates/template-embeddings-refresh";
import type { TemplateEmbeddingsStoragePreference } from "@/lib/templates/template-embeddings-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

type RequestBody = {
  storage?: TemplateEmbeddingsStoragePreference;
  dryRun?: boolean;
};

function normalizeStorage(
  value: unknown,
): TemplateEmbeddingsStoragePreference | undefined {
  if (value === "blob" || value === "local" || value === "auto") return value;
  return undefined;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;

  try {
    const result = await regenerateTemplateEmbeddings({
      storagePreference: normalizeStorage(body?.storage),
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
        ? `Embeddings regenererade och sparade (${result.storage}).`
        : "Embeddings regenererade (dry run).",
    });
  } catch (error) {
    console.error("[API/admin/templates/embeddings] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to regenerate embeddings",
      },
      { status: 500 },
    );
  }
}
