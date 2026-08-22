import { db } from "../client";
import { engineChats, engineVersions } from "../schema";
import { eq, sql } from "drizzle-orm";
import {
  coerceKnownImageReplacementMap,
  KNOWN_IMAGE_REPLACEMENTS_DB_HARD_CEILING,
  KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY,
  type KnownImageReplacementMap,
} from "@/lib/utils/image-validator";
import {
  parsePlanDesignAuthority,
  PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY,
  type PlanDesignAuthority,
} from "@/lib/gen/plan/design-authority";

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
  options: { consumePendingPlanDesignLineageHash?: string | null } = {},
): Promise<boolean> {
  // Bugbot HIGH (PR #376): the finalize snapshot persist is built from an
  // EARLIER read and previously replaced the whole jsonb column. Preserve the
  // two concurrently-written keys SQL-side: union current healed-image data,
  // and keep the current pending Plan Design Authority unless this exact
  // lineage is being consumed. Every other key keeps replace semantics.
  if (snapshot === null) {
    const result = await db
      .update(engineChats)
      .set({ orchestrationSnapshot: null, updatedAt: new Date() })
      .where(eq(engineChats.id, chatId));
    return (result.rowCount ?? 0) > 0;
  }
  const snapshotJson = JSON.stringify(snapshot);
  const currentSnapshotExpr = sql`coalesce(${engineChats.orchestrationSnapshot}, '{}'::jsonb)`;
  const incomingSnapshotExpr = sql`${snapshotJson}::jsonb`;
  // Finalizers still build their merge from an earlier JS read. Completion
  // time alone is not causal: a slow repair of historical v1 can finish after
  // v2 and otherwise roll the chat-wide Brief/Variant authority back. Compare
  // the two persisted version numbers first whenever both snapshots identify
  // different, chat-owned versions. `capturedAt` remains the tie-breaker for
  // the same mutable version (or a legacy snapshot without usable identity).
  const currentVersionNumberExpr = sql`(
    SELECT ${engineVersions.versionNumber}
    FROM ${engineVersions}
    WHERE ${engineVersions.id} = ${currentSnapshotExpr}->>'lastVersionId'
      AND ${engineVersions.chatId} = ${chatId}
    LIMIT 1
  )`;
  const incomingVersionNumberExpr = sql`(
    SELECT ${engineVersions.versionNumber}
    FROM ${engineVersions}
    WHERE ${engineVersions.id} = ${incomingSnapshotExpr}->>'lastVersionId'
      AND ${engineVersions.chatId} = ${chatId}
    LIMIT 1
  )`;
  const causalSnapshotWinnerExpr = sql`CASE
    WHEN ${currentSnapshotExpr} ? 'lastVersionId'
      AND ${incomingSnapshotExpr} ? 'lastVersionId'
      AND ${currentSnapshotExpr}->>'lastVersionId' <> ${incomingSnapshotExpr}->>'lastVersionId'
      AND ${currentVersionNumberExpr} IS NOT NULL
      AND ${incomingVersionNumberExpr} IS NOT NULL
    THEN CASE
      WHEN ${currentVersionNumberExpr} >= ${incomingVersionNumberExpr}
      THEN ${currentSnapshotExpr}
      ELSE ${incomingSnapshotExpr}
    END
    WHEN ${currentSnapshotExpr} ? 'capturedAt'
      AND ${incomingSnapshotExpr} ? 'capturedAt'
      AND ${currentSnapshotExpr}->>'capturedAt' >= ${incomingSnapshotExpr}->>'capturedAt'
    THEN ${currentSnapshotExpr}
    ELSE ${incomingSnapshotExpr}
  END`;
  // A plan can be created while an older build is finalizing. Always preserve
  // the DB column's CURRENT pending authority instead of trusting the stale JS
  // snapshot. The approved build consumes it atomically only when the expected
  // lineage still matches, so build A can never erase a newer plan B.
  const livePendingPlanExpr = sql`nullif(
    ${engineChats.orchestrationSnapshot}->${PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY},
    'null'::jsonb
  )`;
  const incomingWithoutPendingPlanExpr = sql`${causalSnapshotWinnerExpr} - ${PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY}`;
  const expectedPlanLineage = options.consumePendingPlanDesignLineageHash?.trim() || null;
  const pendingPlanSafeSnapshotExpr = expectedPlanLineage
    ? sql`CASE
        WHEN ${livePendingPlanExpr} IS NULL
          OR ${livePendingPlanExpr}->>'lineageHash' = ${expectedPlanLineage}
        THEN ${incomingWithoutPendingPlanExpr}
        ELSE jsonb_set(
          ${incomingWithoutPendingPlanExpr},
          ARRAY[${PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY}]::text[],
          ${livePendingPlanExpr},
          true
        )
      END`
    : sql`CASE
        WHEN ${livePendingPlanExpr} IS NULL THEN ${incomingWithoutPendingPlanExpr}
        ELSE jsonb_set(
          ${incomingWithoutPendingPlanExpr},
          ARRAY[${PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY}]::text[],
          ${livePendingPlanExpr},
          true
        )
      END`;
  const mergedReplacementsExpr = sql`coalesce(${currentSnapshotExpr}->${KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY}, '{}'::jsonb)
        || coalesce(${causalSnapshotWinnerExpr}->${KNOWN_IMAGE_REPLACEMENTS_SNAPSHOT_KEY}, '{}'::jsonb)`;
  const result = await db
    .update(engineChats)
    .set({
      orchestrationSnapshot: sql<Record<string, unknown>>`CASE
        WHEN (${mergedReplacementsExpr}) = '{}'::jsonb THEN ${pendingPlanSafeSnapshotExpr}
        ELSE jsonb_set(
          ${pendingPlanSafeSnapshotExpr},
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
 * Persist the runtime-finalized Plan → Build design handoff without replacing
 * the accepted-version snapshot. The approved build reads this DB-owned value,
 * never the plan JSON echoed back by the browser.
 */
export async function setPendingPlanDesignAuthority(
  chatId: string,
  authority: PlanDesignAuthority,
): Promise<boolean> {
  const parsed = parsePlanDesignAuthority(authority);
  if (!parsed) return false;
  const authorityJson = JSON.stringify(parsed);
  const result = await db
    .update(engineChats)
    .set({
      orchestrationSnapshot: sql<Record<string, unknown>>`jsonb_set(
        coalesce(${engineChats.orchestrationSnapshot}, '{}'::jsonb),
        ARRAY[${PENDING_PLAN_AUTHORITY_SNAPSHOT_KEY}]::text[],
        ${authorityJson}::jsonb,
        true
      )`,
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
  /**
   * Provider-/dossier-id som det här godkännandet ERSÄTTER — syskon till de
   * capabilities som godkänns nu. Utan dem blir unionen fel sorts minne: ett
   * tidigare godkänt `clerk-auth` som aldrig gav filbevis ligger kvar när
   * användaren byter till `supabase-auth`, båda matar `dossierProviderHints`,
   * och `pickForCapability` föredrar defaulten vid dubbelträff — alltså byggs
   * Clerk igen trots bytet.
   */
  supersededProviders: string[] = [],
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
  // Ett id som godkänns nu får aldrig städas bort av sin egen ersättningslista.
  const cleanSuperseded = Array.from(
    new Set(
      supersededProviders
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).filter((p) => !cleanProviders.includes(p));
  const capabilitiesJson = JSON.stringify(cleanCapabilities);
  const providersJson = JSON.stringify(cleanProviders);
  const supersededJson = JSON.stringify(cleanSuperseded);
  // Tom ersättningslista ⇒ subfrågan ger inga rader ⇒ `NOT IN` är sant för
  // alla, alltså exakt den gamla rena unionen.
  const unionExpr = (key: string, incomingJson: string, dropJson?: string) =>
    sql`(SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
      FROM jsonb_array_elements_text(
        coalesce(${engineChats.orchestrationSnapshot}->${key}, '[]'::jsonb)
        || ${incomingJson}::jsonb
      ) AS entries(value)
      WHERE value NOT IN (
        SELECT dropped FROM jsonb_array_elements_text(
          ${dropJson ?? "[]"}::jsonb
        ) AS superseded(dropped)
      ))`;
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
        ${unionExpr("f3ApprovedProviders", providersJson, supersededJson)},
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
