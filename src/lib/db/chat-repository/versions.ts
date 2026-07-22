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
  },
): Promise<Version> {
  const id = uuid();

  for (let attempt = 0; attempt < MAX_VERSION_INSERT_RETRIES; attempt++) {
    try {
      await executor.execute(
        sql`INSERT INTO engine_versions (id, chat_id, message_id, version_number, files_json, repaired_files_json, preview_url, release_state, verification_state, verification_summary, repair_available_at, promoted_at, lifecycle_stage, parent_version_id, edit_kind, created_at)
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
     * Concatenated reasoning captured from the stream for this
     * assistant message. Persisted on the row so the builder UI can
     * re-show the "thinking" panel after an F5 refresh.
     */
    thinking?: string | null;
  } = {},
): Promise<{ message: Message; version: Version }> {
  const { tokenCount, uiParts, previewUrl, lifecycleStage, parentVersionId, editKind, thinking } =
    options;
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
  } = {},
): Promise<{ message: Message; version: Version }> {
  const { tokenCount, uiParts, thinking } = options;
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

export async function getVersionById(versionId: string): Promise<Version | null> {
  const rows = await db
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  return rows.length > 0 ? (toRow(rows[0]) as unknown as Version) : null;
}
