import { db } from "../client";
import { engineChats } from "../schema";
import { eq, sql } from "drizzle-orm";
import {
  coerceKnownImageReplacementMap,
  KNOWN_IMAGE_REPLACEMENTS_DB_HARD_CEILING,
  KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY,
  type KnownImageReplacementMap,
} from "@/lib/utils/image-validator";

export async function getChatOrchestrationSnapshot(
  chatId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ orchestrationSnapshot: engineChats.orchestrationSnapshot })
    .from(engineChats)
    .where(eq(engineChats.id, chatId))
    .limit(1);
  if (rows.length === 0) return null;
  const v = rows[0].orchestrationSnapshot;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function updateChatOrchestrationSnapshot(
  chatId: string,
  snapshot: Record<string, unknown> | null,
): Promise<boolean> {
  // Bugbot HIGH (PR #376): the finalize snapshot persist is built from an
  // EARLIER read and previously replaced the whole jsonb column, so it could
  // race with `recordKnownBrokenImageReplacements`' atomic append and drop the
  // healed-image map. Merge that one key SQL-side — the DB column's current
  // `knownBrokenImageReplacements` is unioned with the incoming snapshot's —
  // while every other key keeps the replace semantics callers rely on.
  if (snapshot === null) {
    const result = await db
      .update(engineChats)
      .set({ orchestrationSnapshot: null, updatedAt: new Date() })
      .where(eq(engineChats.id, chatId));
    return (result.rowCount ?? 0) > 0;
  }
  const snapshotJson = JSON.stringify(snapshot);
  const mergedReplacementsExpr = sql`coalesce(${engineChats.orchestrationSnapshot}->${KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY}, '{}'::jsonb)
        || coalesce(${snapshotJson}::jsonb->${KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY}, '{}'::jsonb)`;
  const result = await db
    .update(engineChats)
    .set({
      orchestrationSnapshot: sql<Record<string, unknown>>`CASE
        WHEN (${mergedReplacementsExpr}) = '{}'::jsonb THEN ${snapshotJson}::jsonb
        ELSE jsonb_set(
          ${snapshotJson}::jsonb,
          '{knownBrokenImageReplacements}'::text[],
          ${mergedReplacementsExpr},
          true
        )
      END`,
      updatedAt: new Date(),
    })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}

/**
 * Durable F3-approval record (review round 2, fix 5): append the approved
 * dossier capabilities + provider keys from a confirmed "Godkänn förslag"
 * round to the chat's orchestration snapshot (set-union, targeted `jsonb_set`
 * so a concurrent finalize's whole-column merge is never clobbered by this
 * write). Read back via `readF3ApprovedFromSnapshot` /
 * `FollowUpContract.f3ApprovedCapabilities` so the F3 capability-scope treats
 * an earlier approval as approved even when its build round produced no file
 * evidence. Best-effort at the callsite; no-op when both lists are empty.
 */
export async function appendF3ApprovedToSnapshot(
  chatId: string,
  capabilities: string[],
  providers: string[],
): Promise<boolean> {
  const cleanCapabilities = Array.from(
    new Set(
      capabilities
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const cleanProviders = Array.from(
    new Set(
      providers
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (cleanCapabilities.length === 0 && cleanProviders.length === 0) return false;
  const capabilitiesJson = JSON.stringify(cleanCapabilities);
  const providersJson = JSON.stringify(cleanProviders);
  const unionExpr = (key: string, incomingJson: string) =>
    sql`(SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        coalesce(${engineChats.orchestrationSnapshot}->${key}, '[]'::jsonb)
        || ${incomingJson}::jsonb
      ) AS entries(value))`;
  const result = await db
    .update(engineChats)
    .set({
      orchestrationSnapshot: sql<Record<string, unknown>>`jsonb_set(
        jsonb_set(
          coalesce(${engineChats.orchestrationSnapshot}, '{}'::jsonb),
          '{f3ApprovedCapabilities}'::text[],
          ${unionExpr("f3ApprovedCapabilities", capabilitiesJson)},
          true
        ),
        '{f3ApprovedProviders}'::text[],
        ${unionExpr("f3ApprovedProviders", providersJson)},
        true
      )`,
      updatedAt: new Date(),
    })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}

export async function getKnownBrokenImageReplacements(
  chatId: string,
): Promise<KnownImageReplacementMap> {
  const snapshot = await getChatOrchestrationSnapshot(chatId);
  return coerceKnownImageReplacementMap(snapshot?.[KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY]);
}

export async function recordKnownBrokenImageReplacements(
  chatId: string,
  replacements: KnownImageReplacementMap,
): Promise<boolean> {
  const clean = coerceKnownImageReplacementMap(replacements);
  if (Object.keys(clean).length === 0) return false;
  const replacementsJson = JSON.stringify(clean);
  // Codex P2 (PR #376 round 2): the union alone lets the COLUMN creep past
  // the read cap (51, 52, …) since only the incoming batch is capped. Hard
  // ceiling heuristic: when the merged map would exceed
  // KNOWN_IMAGE_REPLACEMENTS_DB_HARD_CEILING (2× the read cap), reset the
  // key to just the incoming (already capped) batch in the same UPDATE.
  // JSONB does not preserve insertion order, so exact FIFO in the DB is not
  // the goal — a bounded column size is the guarantee.
  const mergedMapExpr = sql`coalesce(${engineChats.orchestrationSnapshot}->${KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY}, '{}'::jsonb)
        || ${replacementsJson}::jsonb`;
  const result = await db
    .update(engineChats)
    .set({
      orchestrationSnapshot: sql<Record<string, unknown>>`jsonb_set(
        coalesce(${engineChats.orchestrationSnapshot}, '{}'::jsonb),
        '{knownBrokenImageReplacements}'::text[],
        CASE
          WHEN (SELECT count(*) FROM jsonb_object_keys(${mergedMapExpr})) > ${KNOWN_IMAGE_REPLACEMENTS_DB_HARD_CEILING}
          THEN ${replacementsJson}::jsonb
          ELSE ${mergedMapExpr}
        END,
        true
      )`,
      updatedAt: new Date(),
    })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}
