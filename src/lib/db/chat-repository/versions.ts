import { db } from "../client";
import {
  type EngineVersionReleaseState,
  type EngineVersionVerificationState,
  selectPreferredEngineVersion,
} from "../engine-version-lifecycle";
import { engineChats, engineMessages, engineVersions } from "../schema";
import { and, eq, desc, sql } from "drizzle-orm";
import type { Message, Version } from "./types";
import { uuid, toRow, loadVersionById } from "./internal";
import { promoteVersion } from "./version-lifecycle";

const MAX_VERSION_INSERT_RETRIES = 3;

async function insertDraftVersionRow(
  executor: typeof db,
  params: {
    chatId: string;
    messageId: string | null;
    filesJson: string;
    previewUrl?: string;
    /** F2/F3 lifecycle stage. Defaults to "design". */
    lifecycleStage?: "design" | "integrations";
    /** When set, F3 row pointing at the F2 version it was forked from. */
    parentVersionId?: string | null;
    /** Fast Edit Lane provenance ("quick_edit") or null for normal versions. */
    editKind?: string | null;
    /**
     * Selected dossiers' declared env keys (F2 preview mock-seed contract).
     * Stored as jsonb; null/omitted when the generation selected no dossier
     * with env keys. See `engineVersions.selectedDossierEnvKeys` in schema.ts.
     */
    selectedDossierEnvKeys?: string[] | null;
  },
): Promise<Version> {
  const id = uuid();
  // Lineage contract (schema.ts `parentVersionId`): every F3/integrations row
  // must record which F2 design version it forked from. Prod chat fc0f053b
  // (2026-08-11) wrote two integrations rows with NULL parent, which breaks
  // the finalize-design reuse filter (every retry forks anew) and leaves the
  // version history without provenance. All known writers pass the parent, so
  // an unidentified path still exists — log loudly WITH a stack instead of
  // throwing, so the next occurrence is attributable without killing the
  // user's finished generation at the persist step.
  if (params.lifecycleStage === "integrations" && !params.parentVersionId) {
    console.error(
      "[versions] integrations version inserted WITHOUT parent_version_id — lineage contract violation (see schema.ts parentVersionId)",
      {
        chatId: params.chatId,
        messageId: params.messageId,
        editKind: params.editKind ?? null,
        stack: new Error("integrations-without-parent").stack,
      },
    );
  }
  const selectedDossierEnvKeysJson =
    Array.isArray(params.selectedDossierEnvKeys) && params.selectedDossierEnvKeys.length > 0
      ? JSON.stringify(params.selectedDossierEnvKeys)
      : null;

  for (let attempt = 0; attempt < MAX_VERSION_INSERT_RETRIES; attempt++) {
    try {
      await executor.execute(
        sql`INSERT INTO engine_versions (id, chat_id, message_id, version_number, files_json, repaired_files_json, preview_url, release_state, verification_state, verification_summary, repair_available_at, promoted_at, lifecycle_stage, parent_version_id, edit_kind, selected_dossier_env_keys, created_at)
            VALUES (
              ${id},
              ${params.chatId},
              ${params.messageId},
              (SELECT COALESCE(MAX(version_number), 0) + 1 FROM engine_versions WHERE chat_id = ${params.chatId}),
              ${params.filesJson},
              ${null},
              ${params.previewUrl ?? null},
              ${"draft"},
              ${"pending"},
              ${null},
              ${null},
              ${null},
              ${params.lifecycleStage ?? "design"},
              ${params.parentVersionId ?? null},
              ${params.editKind ?? null},
              ${selectedDossierEnvKeysJson}::jsonb,
              NOW()
            )`,
      );
      break;
    } catch (e: unknown) {
      const isUniqueViolation =
        e instanceof Error &&
        ("code" in e && (e as Record<string, unknown>).code === "23505");
      if (isUniqueViolation && attempt < MAX_VERSION_INSERT_RETRIES - 1) {
        continue;
      }
      throw e;
    }
  }

  return loadVersionById(executor, id);
}

/**
 * Inserts the assistant row and draft version in a single DB transaction.
 * If the version insert fails, the message row is rolled back (no orphan assistant).
 */
export async function addAssistantMessageAndCreateDraftVersion(
  chatId: string,
  content: string,
  filesJson: string,
  options: {
    tokenCount?: number;
    uiParts?: Record<string, unknown>[] | null;
    previewUrl?: string;
    lifecycleStage?: "design" | "integrations";
    parentVersionId?: string | null;
    /** Fast Edit Lane provenance ("quick_edit") or null for normal versions. */
    editKind?: string | null;
    /**
     * Selected dossiers' declared env keys, persisted on the version row so
     * later preview (re)starts rebuild the F2 mock-seed `.env.local` surface.
     * Null/omitted when empty.
     */
    selectedDossierEnvKeys?: string[] | null;
    /**
     * Concatenated reasoning captured from the stream for this
     * assistant message. Persisted on the row so the builder UI can
     * re-show the "thinking" panel after an F5 refresh.
     */
    thinking?: string | null;
  } = {},
): Promise<{ message: Message; version: Version }> {
  const {
    tokenCount,
    uiParts,
    previewUrl,
    lifecycleStage,
    parentVersionId,
    editKind,
    selectedDossierEnvKeys,
    thinking,
  } = options;
  return db.transaction(async (tx) => {
    const messageId = uuid();
    await tx.insert(engineMessages).values({
      id: messageId,
      chatId,
      role: "assistant",
      content,
      uiParts: Array.isArray(uiParts) ? uiParts : null,
      tokenCount: tokenCount ?? null,
      thinking: typeof thinking === "string" && thinking.length > 0 ? thinking : null,
    });
    await tx
      .update(engineChats)
      .set({ updatedAt: new Date() })
      .where(eq(engineChats.id, chatId));

    // Drizzle `tx` is a transaction-scoped client with the same insert/select surface as `db`.
    const version = await insertDraftVersionRow(tx as unknown as typeof db, {
      chatId,
      messageId,
      filesJson,
      previewUrl,
      lifecycleStage,
      parentVersionId,
      editKind,
      selectedDossierEnvKeys,
    });

    const msgRows = await tx.select().from(engineMessages).where(eq(engineMessages.id, messageId)).limit(1);
    return {
      message: toRow(msgRows[0]) as unknown as Message,
      version,
    };
  });
}

/**
 * Create assistant message and update an existing version's files in one transaction.
 * Used by autofix / repair so the result replaces v1 instead of creating v2.
 */
export async function addAssistantMessageAndUpdateExistingVersion(
  chatId: string,
  versionId: string,
  content: string,
  filesJson: string,
  options: {
    tokenCount?: number;
    uiParts?: Record<string, unknown>[] | null;
    /** See `addAssistantMessageAndCreateDraftVersion` for semantics. */
    thinking?: string | null;
    /**
     * Backfill-only dossier env keys: written with COALESCE so an existing
     * non-null selection is NEVER overwritten (a repair rewrites files, not
     * the dossier selection), but a legacy NULL row created before the
     * column existed gets the repair run's computed keys — otherwise a
     * later force-restart/quick-edit fallback on that row drops the F2
     * mock-seed. Null/omitted = leave the column untouched.
     */
    selectedDossierEnvKeysBackfill?: string[] | null;
  } = {},
): Promise<{ message: Message; version: Version }> {
  const { tokenCount, uiParts, thinking, selectedDossierEnvKeysBackfill } = options;
  const backfillJson =
    Array.isArray(selectedDossierEnvKeysBackfill) && selectedDossierEnvKeysBackfill.length > 0
      ? JSON.stringify(selectedDossierEnvKeysBackfill)
      : null;
  return db.transaction(async (tx) => {
    const messageId = uuid();
    await tx.insert(engineMessages).values({
      id: messageId,
      chatId,
      role: "assistant",
      content,
      uiParts: Array.isArray(uiParts) ? uiParts : null,
      tokenCount: tokenCount ?? null,
      thinking: typeof thinking === "string" && thinking.length > 0 ? thinking : null,
    });
    await tx
      .update(engineChats)
      .set({ updatedAt: new Date() })
      .where(eq(engineChats.id, chatId));
    const result = await tx
      .update(engineVersions)
      .set({
        filesJson,
        previewUrl: null,
        repairedFilesJson: null,
        repairAvailableAt: null,
        messageId,
        releaseState: "draft" as EngineVersionReleaseState,
        verificationState: "pending" as EngineVersionVerificationState,
        verificationSummary: null,
        promotedAt: null,
        ...(backfillJson !== null
          ? {
              selectedDossierEnvKeys: sql`COALESCE(${engineVersions.selectedDossierEnvKeys}, ${backfillJson}::jsonb)`,
            }
          : {}),
      })
      .where(and(eq(engineVersions.id, versionId), eq(engineVersions.chatId, chatId)));
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("Version not found for chat.");
    }

    const msgRows = await tx.select().from(engineMessages).where(eq(engineMessages.id, messageId)).limit(1);
    const verRows = await tx
      .select()
      .from(engineVersions)
      .where(and(eq(engineVersions.id, versionId), eq(engineVersions.chatId, chatId)))
      .limit(1);
    return {
      message: toRow(msgRows[0]) as unknown as Message,
      version: toRow(verRows[0]) as unknown as Version,
    };
  });
}

export async function createDraftVersion(
  chatId: string,
  messageId: string | null,
  filesJson: string,
  previewUrl?: string,
  lifecycle?: {
    stage?: "design" | "integrations";
    parentVersionId?: string | null;
    /** Provenance marker, e.g. "imported_repo" for verbatim v0-template imports. */
    editKind?: string | null;
    /**
     * Selected dossiers' declared env keys — copied from the parent version by
     * the deterministic F3 fork so the row carries the same preview env
     * contract as its F2 base (the mock-seed itself only runs in F2/design).
     */
    selectedDossierEnvKeys?: string[] | null;
  },
): Promise<Version> {
  return insertDraftVersionRow(db, {
    chatId,
    messageId,
    filesJson,
    previewUrl,
    lifecycleStage: lifecycle?.stage,
    parentVersionId: lifecycle?.parentVersionId,
    editKind: lifecycle?.editKind,
    selectedDossierEnvKeys: lifecycle?.selectedDossierEnvKeys,
  });
}

export async function createAndPromoteDraftVersion(
  chatId: string,
  messageId: string | null,
  filesJson: string,
  verificationSummary: string | null = "Automatic verification passed.",
  previewUrl?: string,
): Promise<Version | null> {
  const version = await createDraftVersion(chatId, messageId, filesJson, previewUrl);
  return promoteVersion(version.id, verificationSummary);
}

export async function getLatestVersion(chatId: string): Promise<Version | null> {
  const rows = await db
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.chatId, chatId))
    .orderBy(desc(engineVersions.versionNumber))
    .limit(1);
  return rows.length > 0 ? (toRow(rows[0]) as unknown as Version) : null;
}

export async function getPreferredVersion(chatId: string): Promise<Version | null> {
  const versions = await getVersionsByChat(chatId);
  return selectPreferredEngineVersion(versions) ?? null;
}

export async function getVersionsByChat(chatId: string): Promise<Version[]> {
  const rows = await db
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.chatId, chatId))
    .orderBy(desc(engineVersions.versionNumber));
  return rows.map((r) => toRow(r) as unknown as Version);
}

/**
 * True when the chat's version history contains an `edit_kind="imported_repo"`
 * row — i.e. the chat started from a verbatim repo import (v0-template from
 * Blob via `POST /api/template`, or ZIP/GitHub via `/api/engine/chats/init`).
 *
 * Canonical detection for "imported repo mode": follow-up orchestration,
 * finalize preflight and export/verify assembly all branch on this signal so
 * an imported repo is edited verbatim instead of being forced through the
 * own-engine scaffold contract (baseline dep pins, scaffold-file injection).
 */
export async function chatHasImportedRepoVersion(chatId: string): Promise<boolean> {
  const rows = await db
    .select({ id: engineVersions.id })
    .from(engineVersions)
    .where(
      and(
        eq(engineVersions.chatId, chatId),
        eq(engineVersions.editKind, "imported_repo"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function getVersionById(versionId: string): Promise<Version | null> {
  const rows = await db
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  return rows.length > 0 ? (toRow(rows[0]) as unknown as Version) : null;
}
