import { db } from "../client";
import { engineGenerationLogs } from "../schema";
import { eq } from "drizzle-orm";
import type { GenerationLog } from "./types";
import { uuid, toRow } from "./internal";

export async function logGeneration(
  chatId: string,
  model: string,
  tokens: { prompt?: number; completion?: number },
  durationMs: number,
  success: boolean,
  error?: string,
): Promise<GenerationLog> {
  const id = uuid();
  await db.insert(engineGenerationLogs).values({
    id,
    chatId,
    model,
    promptTokens: tokens.prompt ?? null,
    completionTokens: tokens.completion ?? null,
    durationMs,
    success,
    errorMessage: error ?? null,
  });
  const rows = await db
    .select()
    .from(engineGenerationLogs)
    .where(eq(engineGenerationLogs.id, id))
    .limit(1);
  return toRow(rows[0]) as unknown as GenerationLog;
}
