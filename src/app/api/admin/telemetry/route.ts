import { NextResponse } from "next/server";
import { db, dbConfigured } from "@/lib/db/client";
import { generationTelemetry } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(req: Request) {
  if (!dbConfigured) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

  try {
    const rows = await db
      .select()
      .from(generationTelemetry)
      .orderBy(desc(generationTelemetry.createdAt))
      .limit(limit);

    const records = rows.map((row) => ({
      id: row.id,
      chatId: row.chatId,
      versionId: row.versionId,
      scaffoldId: row.scaffoldId,
      scaffoldAlternatives: row.scaffoldAlternatives,
      model: row.model,
      modelTier: row.modelTier,
      buildIntent: row.buildIntent,
      buildMethod: row.buildMethod,
      promptClassification: row.promptClassification,
      retryCount: row.retryCount,
      autofixApplied: row.autofixApplied,
      syntaxFixerUsed: row.syntaxFixerUsed,
      preflightErrorCount: row.preflightErrorCount,
      preflightWarningCount: row.preflightWarningCount,
      seoIssueCount: row.seoIssueCount,
      previewSuccess: row.previewSuccess,
      previewBlockingReason: row.previewBlockingReason,
      qualityGateResult: row.qualityGateResult,
      durationMs: row.durationMs,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      fileCount: row.fileCount,
      scaffoldRetryUsed: row.scaffoldRetryUsed,
      scaffoldRetrySuggested: row.scaffoldRetrySuggested,
      deployResult: row.deployResult,
      userFeedback: row.userFeedback,
      meta: row.meta,
      createdAt: row.createdAt,
    }));

    return NextResponse.json({ success: true, records, count: records.length });
  } catch (error) {
    console.error("[admin/telemetry] Failed to fetch telemetry:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch telemetry" },
      { status: 500 },
    );
  }
}