import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { generationTelemetry } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export type CreateTelemetryRecord = {
  chatId: string;
  versionId?: string | null;
  scaffoldId?: string | null;
  scaffoldAlternatives?: string[] | null;
  scaffoldSelectionMethod?: string | null;
  scaffoldSelectionConfidence?: string | null;
  briefInfluencedSelection?: boolean;
  model: string;
  modelTier?: string | null;
  buildIntent?: string | null;
  buildMethod?: string | null;
  promptClassification?: string | null;
  retryCount?: number;
  autofixApplied?: boolean;
  syntaxFixerUsed?: boolean;
  preflightErrorCount?: number;
  preflightWarningCount?: number;
  seoIssueCount?: number;
  previewSuccess?: boolean | null;
  previewBlockingReason?: string | null;
  qualityGateResult?: string | null;
  durationMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  fileCount?: number | null;
  scaffoldRetryUsed?: boolean;
  scaffoldRetrySuggested?: string | null;
  meta?: Record<string, unknown> | null;
};

export type UpdateTelemetryRecord = Partial<
  Omit<CreateTelemetryRecord, "chatId" | "model"> & {
    deployResult?: string | null;
    userFeedback?: string | null;
  }
>;

export async function createGenerationTelemetryRecord(record: CreateTelemetryRecord) {
  assertDbConfigured();
  const id = nanoid();
  const rows = await db
    .insert(generationTelemetry)
    .values({
      id,
      chatId: record.chatId,
      versionId: record.versionId ?? null,
      scaffoldId: record.scaffoldId ?? null,
      scaffoldAlternatives: record.scaffoldAlternatives ?? null,
      scaffoldSelectionMethod: record.scaffoldSelectionMethod ?? null,
      scaffoldSelectionConfidence: record.scaffoldSelectionConfidence ?? null,
      briefInfluencedSelection: record.briefInfluencedSelection ?? false,
      model: record.model,
      modelTier: record.modelTier ?? null,
      buildIntent: record.buildIntent ?? null,
      buildMethod: record.buildMethod ?? null,
      promptClassification: record.promptClassification ?? null,
      retryCount: record.retryCount ?? 0,
      autofixApplied: record.autofixApplied ?? false,
      syntaxFixerUsed: record.syntaxFixerUsed ?? false,
      preflightErrorCount: record.preflightErrorCount ?? 0,
      preflightWarningCount: record.preflightWarningCount ?? 0,
      seoIssueCount: record.seoIssueCount ?? 0,
      previewSuccess: record.previewSuccess ?? null,
      previewBlockingReason: record.previewBlockingReason ?? null,
      qualityGateResult: record.qualityGateResult ?? null,
      durationMs: record.durationMs ?? null,
      promptTokens: record.promptTokens ?? null,
      completionTokens: record.completionTokens ?? null,
      fileCount: record.fileCount ?? null,
      scaffoldRetryUsed: record.scaffoldRetryUsed ?? false,
      scaffoldRetrySuggested: record.scaffoldRetrySuggested ?? null,
      meta: record.meta ?? null,
    })
    .returning();
  return rows[0];
}

export async function updateTelemetryRecord(
  id: string,
  updates: UpdateTelemetryRecord,
) {
  assertDbConfigured();
  const rows = await db
    .update(generationTelemetry)
    .set(updates)
    .where(eq(generationTelemetry.id, id))
    .returning();
  return rows[0];
}

export async function getTelemetryForVersion(versionId: string) {
  assertDbConfigured();
  return db
    .select()
    .from(generationTelemetry)
    .where(eq(generationTelemetry.versionId, versionId))
    .orderBy(desc(generationTelemetry.createdAt));
}
