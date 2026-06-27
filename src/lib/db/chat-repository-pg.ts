/**
 * Postgres-based engine chat repository (Drizzle).
 *
 * This is the canonical own-engine chat store.
 * The exported API remains stable for stream routes and builder flows.
 */
import { db } from "./client";
import {
  type EngineVersionReleaseState,
  type EngineVersionVerificationState,
  selectPreferredEngineVersion,
} from "./engine-version-lifecycle";
import {
  engineChats,
  engineMessages,
  engineVersions,
  engineGenerationLogs,
  engineVersionJobs,
} from "./schema";
import { and, eq, desc, gt, sql, type SQL } from "drizzle-orm";
import { REPAIR_ACCEPT_TIMEOUT_MS } from "@/lib/gen/defaults";
import { assertPromoteAllowed } from "./promote-guard";
import { recordRepairPassedQualityGate } from "./services/generation-telemetry";

export interface Chat {
  id: string;
  project_id: string;
  title: string | null;
  model: string;
  system_prompt: string | null;
  scaffold_id: string | null;
  orchestration_snapshot?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  ui_parts?: Record<string, unknown>[] | null;
  token_count: number | null;
  /**
   * Concatenated reasoning emitted during the stream that produced this
   * message. Persisted on assistant messages so the builder UI can
   * re-render the "thinking" panel after a refresh; null otherwise.
   */
  thinking?: string | null;
  created_at: string;
}

export interface Version {
  id: string;
  chat_id: string;
  message_id: string | null;
  version_number: number;
  files_json: string;
  repaired_files_json: string | null;
  preview_url: string | null;
  release_state: EngineVersionReleaseState;
  verification_state: EngineVersionVerificationState;
  verification_summary: string | null;
  repair_available_at: string | null;
  promoted_at: string | null;
  /** F2/F3 lifecycle stage; defaults to "design" for legacy rows. */
  lifecycle_stage: "design" | "integrations";
  /** F3 versions point at the F2 version they were forked from. */
  parent_version_id: string | null;
  /** Fast Edit Lane provenance ("quick_edit") or null for normal versions. */
  edit_kind: string | null;
  created_at: string;
}

export type VersionRepairStatus = {
  versionId: string;
  verificationState: EngineVersionVerificationState;
  hasPendingRepair: boolean;
  repairAvailableAt: string | null;
  wasAutoAccepted?: boolean;
};

export interface GenerationLog {
  id: string;
  chat_id: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  success: number;
  error_message: string | null;
  created_at: string;
}

export interface ChatWithMessages extends Chat {
  messages: Message[];
}

function uuid(): string {
  return crypto.randomUUID();
}

function toRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[snakeKey] = val instanceof Date ? val.toISOString() : val;
  }
  return out;
}

export async function createChat(
  projectId: string,
  model = "gpt-5.4",
  systemPrompt?: string,
  scaffoldId?: string,
): Promise<Chat> {
  const id = uuid();
  await db.insert(engineChats).values({
    id,
    projectId,
    model,
    systemPrompt: systemPrompt ?? null,
    scaffoldId: scaffoldId ?? null,
  });
  const rows = await db.select().from(engineChats).where(eq(engineChats.id, id)).limit(1);
  return toRow(rows[0]) as unknown as Chat;
}

export async function getChat(id: string): Promise<ChatWithMessages | null> {
  const chatRows = await db.select().from(engineChats).where(eq(engineChats.id, id)).limit(1);
  if (chatRows.length === 0) return null;
  const chat = toRow(chatRows[0]) as unknown as Chat;
  const msgRows = await db
    .select()
    .from(engineMessages)
    .where(eq(engineMessages.chatId, id))
    .orderBy(engineMessages.createdAt);
  const messages = msgRows.map((r) => toRow(r) as unknown as Message);
  return { ...chat, messages };
}

export async function addMessage(
  chatId: string,
  role: Message["role"],
  content: string,
  tokenCount?: number,
  uiParts?: Record<string, unknown>[] | null,
): Promise<Message> {
  const id = uuid();
  return await db.transaction(async (tx) => {
    await tx.insert(engineMessages).values({
      id,
      chatId,
      role,
      content,
      uiParts: Array.isArray(uiParts) ? uiParts : null,
      tokenCount: tokenCount ?? null,
    });
    await tx
      .update(engineChats)
      .set({ updatedAt: new Date() })
      .where(eq(engineChats.id, chatId));
    const rows = await tx
      .select()
      .from(engineMessages)
      .where(eq(engineMessages.id, id))
      .limit(1);
    return toRow(rows[0]) as unknown as Message;
  });
}

async function loadVersionById(
  executor: Pick<typeof db, "select">,
  versionId: string,
): Promise<Version> {
  const rows = await executor
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  return toRow(rows[0]) as unknown as Version;
}

async function getStoredVersion(versionId: string): Promise<Version> {
  return loadVersionById(db, versionId);
}

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
  lifecycle?: { stage?: "design" | "integrations"; parentVersionId?: string | null },
): Promise<Version> {
  return insertDraftVersionRow(db, {
    chatId,
    messageId,
    filesJson,
    previewUrl,
    lifecycleStage: lifecycle?.stage,
    parentVersionId: lifecycle?.parentVersionId,
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

export async function listChatsByProject(projectId: string): Promise<Chat[]> {
  const rows = await db
    .select()
    .from(engineChats)
    .where(eq(engineChats.projectId, projectId))
    .orderBy(desc(engineChats.updatedAt));
  return rows.map((r) => toRow(r) as unknown as Chat);
}

export async function updateChatProjectId(chatId: string, projectId: string): Promise<boolean> {
  const result = await db
    .update(engineChats)
    .set({ projectId, updatedAt: new Date() })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}

export async function updateChatScaffoldId(chatId: string, scaffoldId: string | null): Promise<boolean> {
  const result = await db
    .update(engineChats)
    .set({ scaffoldId, updatedAt: new Date() })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}

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
  const result = await db
    .update(engineChats)
    .set({ orchestrationSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
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

export async function updateVersionFiles(versionId: string, filesJson: string): Promise<boolean> {
  const result = await db
    .update(engineVersions)
    .set({
      filesJson,
      // Invalidate the cached tier-2 preview URL: the next preview-session
      // request must boot a fresh VM against the updated files instead of
      // short-circuiting to `startOutcome: "reused_url"` and showing the
      // previous snapshot. Without this, file mutations via /files were
      // silently masked by the stale URL (P19 ingress point 1).
      previewUrl: null,
      repairedFilesJson: null,
      repairAvailableAt: null,
      releaseState: sql<EngineVersionReleaseState>`
        CASE
          WHEN ${engineVersions.verificationState} = 'repair_available' THEN 'draft'
          ELSE ${engineVersions.releaseState}
        END
      `,
      verificationState: sql<EngineVersionVerificationState>`
        CASE
          WHEN ${engineVersions.verificationState} = 'repair_available' THEN 'pending'
          ELSE ${engineVersions.verificationState}
        END
      `,
      verificationSummary: sql<string | null>`
        CASE
          WHEN ${engineVersions.verificationState} = 'repair_available' THEN NULL
          ELSE ${engineVersions.verificationSummary}
        END
      `,
      promotedAt: sql<Date | null>`
        CASE
          WHEN ${engineVersions.verificationState} = 'repair_available' THEN NULL
          ELSE ${engineVersions.promotedAt}
        END
      `,
    })
    .where(eq(engineVersions.id, versionId));
  return (result.rowCount ?? 0) > 0;
}

export async function saveRepairedFiles(
  versionId: string,
  repairedFilesJson: string,
  verificationSummary: string | null = "Server repair completed. Waiting for acceptance.",
  runId?: string,
): Promise<Version | null> {
  if (!repairedFilesJson.trim()) return null;
  const result = await db
    .update(engineVersions)
    .set({
      repairedFilesJson,
      repairAvailableAt: new Date(),
      releaseState: "draft",
      verificationState: "repair_available",
      verificationSummary,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  // A repair only reaches `repair_available` after it passed its own quality
  // gate (`shouldPromoteAfterRepair`). Stamp that pass so the promotion guard
  // reads the *current* (repaired) signal instead of the stale finalize
  // `verifier_failed`/`preflight_failed` that flagged the pre-repair content —
  // otherwise `acceptRepair`'s guard would wedge a legitimately-fixed row.
  await recordRepairPassedQualityGate(versionId);
  return getStoredVersion(versionId);
}

export async function getRepairStatus(versionId: string): Promise<VersionRepairStatus | null> {
  const rows = await db
    .select({
      id: engineVersions.id,
      verificationState: engineVersions.verificationState,
      repairedFilesJson: engineVersions.repairedFilesJson,
      repairAvailableAt: engineVersions.repairAvailableAt,
    })
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    versionId: row.id,
    verificationState:
      (row.verificationState as EngineVersionVerificationState) ?? "pending",
    hasPendingRepair:
      typeof row.repairedFilesJson === "string" && row.repairedFilesJson.trim().length > 0,
    repairAvailableAt:
      row.repairAvailableAt instanceof Date ? row.repairAvailableAt.toISOString() : null,
  };
}

export async function acceptRepair(
  versionId: string,
  verificationSummary: string | null = "Server repair accepted.",
): Promise<Version | null> {
  // Codex P2 (missing-table fail-safe): resolve whether the lease table exists
  // ONCE, out of band. We must NOT name engine_version_jobs inside the UPDATE
  // when it is absent — Postgres resolves relations at parse/plan time, so a
  // `to_regclass(...) IS NULL OR ...` guard *inside* the statement still errors
  // "relation does not exist". to_regclass() in a standalone SELECT takes text
  // and never references the table as a relation, so it is safe pre-migration.
  const jobsExist = await leaseTableExists();
  return db.transaction(async (tx) => {
    // Codex P2 (serialize with acquireVersionLease): take the version-row lock
    // FIRST (FOR UPDATE). acquireVersionLease locks the same row before inserting
    // its lease, so the two contend; the no-active-lease UPDATE below then runs
    // as a later statement with a fresh READ COMMITTED snapshot and sees any
    // lease that committed in the gap — closing the promote-then-lease race.
    const rows = await tx
      .select({
        repairedFilesJson: engineVersions.repairedFilesJson,
      })
      .from(engineVersions)
      .where(eq(engineVersions.id, versionId))
      .limit(1)
      .for("update");
    const repairedFilesJson = rows[0]?.repairedFilesJson;
    if (typeof repairedFilesJson !== "string" || repairedFilesJson.trim().length === 0) {
      return null;
    }
    // False-green invariant: accepting a repair also promotes, so it must pass
    // through the same guard as `promoteVersion`. `saveRepairedFiles` stamped a
    // fresh `preflight_passed` signal when the repair passed its gate, so a
    // legitimate repair is allowed; a still-failing latest signal (e.g. the
    // stamp never landed, or telemetry was re-flagged) blocks promotion instead
    // of leaking a verifier-rejected row to `promoted`/`passed`.
    const guard = await assertPromoteAllowed(versionId);
    if (!guard.allowed) {
      console.warn(
        `[promote-guard] Refusing to accept repair for version ${versionId}: ${guard.reason}`,
      );
      return null;
    }
    const result = await tx
      .update(engineVersions)
      .set({
        // Codex P2 (stale payload): the WHERE binds repaired_files_json to the
        // exact value SELECTed above, so promoting the column reference writes
        // that same payload atomically — never a different concurrent repair.
        filesJson: sql`${engineVersions.repairedFilesJson}`,
        previewUrl: null,
        repairedFilesJson: null,
        repairAvailableAt: null,
        releaseState: "promoted" as EngineVersionReleaseState,
        verificationState: "passed" as EngineVersionVerificationState,
        verificationSummary,
        promotedAt: new Date(),
      })
      .where(
        and(
          eq(engineVersions.id, versionId),
          // Codex P2 (replacement-repair guard): only promote when the pending
          // repair is STILL the exact one read above. If a newer repair was
          // saved between the SELECT and here (and may not have reached its own
          // accept timeout), this no-ops instead of promoting it early. This
          // also subsumes the "not cleared" check (a non-empty string != NULL).
          sql`${engineVersions.repairedFilesJson} = ${repairedFilesJson}`,
          // Codex P2 (no active lease): atomic guard — the route +
          // maybeAutoAcceptTimedOutRepair pre-checks are only a fast-fail. Only
          // reference engine_version_jobs when it exists (see leaseTableExists).
          jobsExist
            ? sql`NOT EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.status = 'running' AND j.lease_expires_at > now())`
            : undefined,
        ),
      );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    const versionRows = await tx
      .select()
      .from(engineVersions)
      .where(eq(engineVersions.id, versionId))
      .limit(1);
    return toRow(versionRows[0]) as unknown as Version;
  });
}

type AutoAcceptResult = {
  version: Version;
  wasAutoAccepted: boolean;
};

function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function shouldAutoAcceptRepair(
  verificationState: EngineVersionVerificationState | null | undefined,
  repairAvailableAt: string | null | undefined,
): boolean {
  if (verificationState !== "repair_available") return false;
  const repairAvailableAtMs = parseIsoToMs(repairAvailableAt);
  if (repairAvailableAtMs === null) return false;
  return Date.now() - repairAvailableAtMs >= REPAIR_ACCEPT_TIMEOUT_MS;
}

export async function maybeAutoAcceptTimedOutRepair(version: Version): Promise<AutoAcceptResult> {
  if (!shouldAutoAcceptRepair(version.verification_state, version.repair_available_at)) {
    return { version, wasAutoAccepted: false };
  }
  // Codex P2: the explicit POST /accept-repair route guards on an active lease,
  // but auto-accept reaches `acceptRepair` from polling paths (readiness /
  // versions / chat GET). Guard it here too so a still-running verify/repair job
  // (which holds the lease) can never have its row promoted out from under it.
  // Fail-safe: a DB error degrades to the legacy always-try-accept behaviour.
  if (await hasActiveVersionLease(version.id).catch(() => false)) {
    return { version, wasAutoAccepted: false };
  }
  const accepted = await acceptRepair(
    version.id,
    "Server repair auto-accepted after timeout.",
  );
  if (!accepted) {
    return { version, wasAutoAccepted: false };
  }
  return { version: accepted, wasAutoAccepted: true };
}

export async function updateVersionPreviewUrl(
  versionId: string,
  previewUrl: string | null,
): Promise<boolean> {
  const result = await db
    .update(engineVersions)
    .set({ previewUrl })
    .where(eq(engineVersions.id, versionId));
  return (result.rowCount ?? 0) > 0;
}

// ── Distributed version lease (Plan C / P1) ──────────────────────────────────
//
// engine_version_jobs gives a cross-instance lock so two serverless instances
// can't run verify/repair on the same versionId concurrently, and so a frozen
// instance that thaws after its lease expired can't silently clobber a newer
// repair. The lock is per version_id (kind is metadata): whoever holds the one
// active (status='running') lease owns every mutation of that engine_versions
// row. See docs/plans/active/2026-06-27-server-verify-distributed-lock.md.

export type VersionJobKind = "server_verify" | "build_error_repair" | "manual_repair";

/**
 * Lease TTL in seconds. Generous (verify+repair can run several LLM passes);
 * holders call {@link renewVersionLease} between long passes. Tunable via the
 * owner decision in the plan doc (open question 1).
 */
export const VERSION_LEASE_TTL_SECONDS = 15 * 60;

const leaseTtlInterval = sql`now() + ${VERSION_LEASE_TTL_SECONDS} * interval '1 second'`;

/**
 * Atomically acquire the single active lease for a version. Returns the owning
 * `runId` when this caller won the lease (fresh insert OR takeover of an EXPIRED
 * lease), or `null` when another live lease already owns the version (caller
 * must then NOT run — same semantics as the old process-local `inflight` Set).
 */
export async function acquireVersionLease(
  versionId: string,
  kind: VersionJobKind,
): Promise<{ runId: string } | null> {
  const runId = uuid();
  const won = await db.transaction(async (tx) => {
    // Codex P2 (serialize lease acquisition with version-row updates): lock the
    // engine_versions row FIRST, in the same transaction as the lease insert.
    // The accept/readiness no-active-lease UPDATEs lock the same row before
    // re-checking the lease, so they can no longer take a NOT EXISTS snapshot
    // that predates this (uncommitted) lease and then promote/fail the version
    // out from under the new run. Without this, the lease insert touches only
    // engine_version_jobs, so the two paths never contend on a common lock.
    await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
    const result = await tx.execute(sql`
      INSERT INTO engine_version_jobs (id, version_id, kind, run_id, status, lease_expires_at)
      VALUES (${uuid()}, ${versionId}, ${kind}, ${runId}, 'running', ${leaseTtlInterval})
      ON CONFLICT (version_id) WHERE status = 'running'
      DO UPDATE SET run_id = EXCLUDED.run_id, kind = EXCLUDED.kind,
                    lease_expires_at = EXCLUDED.lease_expires_at, updated_at = now()
        WHERE engine_version_jobs.lease_expires_at < now()
      RETURNING run_id
    `);
    const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
    return rows.length > 0;
  });
  return won ? { runId } : null;
}

/** Extend the lease (call between long passes). False when the lease is no longer ours/active. */
export async function renewVersionLease(versionId: string, runId: string): Promise<boolean> {
  const result = await db
    .update(engineVersionJobs)
    .set({ leaseExpiresAt: leaseTtlInterval, updatedAt: sql`now()` })
    .where(
      and(
        eq(engineVersionJobs.versionId, versionId),
        eq(engineVersionJobs.runId, runId),
        eq(engineVersionJobs.status, "running"),
        // Codex P2: never resurrect an already-expired lease. A job that froze
        // or ran past the TTL has lost ownership (the row may have been taken
        // over via acquire's expiry path); renew must FAIL so the caller treats
        // it as lost and stops writing, instead of silently re-extending.
        gt(engineVersionJobs.leaseExpiresAt, sql`now()`),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}

/** Release the lease (status -> done|failed) so the version is free for the next job. */
export async function releaseVersionLease(
  versionId: string,
  runId: string,
  status: "done" | "failed" = "done",
): Promise<void> {
  await db
    .update(engineVersionJobs)
    .set({ status, updatedAt: sql`now()` })
    .where(and(eq(engineVersionJobs.versionId, versionId), eq(engineVersionJobs.runId, runId)));
}

/** True when an UNEXPIRED active lease exists for the version (any owner). */
/**
 * True when the engine_version_jobs lease table exists. Used to keep the shared
 * accept/watchdog paths working before add-engine-version-jobs.sql is applied
 * (rollout / local DB drift): we must decide whether to reference the table
 * BEFORE building a statement, because Postgres resolves relation names at
 * parse/plan time (an in-statement `to_regclass(...) IS NULL OR ...` guard
 * cannot short-circuit a missing relation). `to_regclass(text)` itself never
 * references the table as a relation, so this probe is safe pre-migration.
 */
async function leaseTableExists(): Promise<boolean> {
  try {
    const res = await db.execute(sql`SELECT to_regclass('public.engine_version_jobs') AS oid`);
    const rows = (res as unknown as { rows?: Array<{ oid: string | null }> }).rows ?? [];
    return rows.length > 0 && rows[0]?.oid != null;
  } catch {
    return false;
  }
}

export async function hasActiveVersionLease(versionId: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: engineVersionJobs.id })
      .from(engineVersionJobs)
      .where(
        and(
          eq(engineVersionJobs.versionId, versionId),
          eq(engineVersionJobs.status, "running"),
          gt(engineVersionJobs.leaseExpiresAt, sql`now()`),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    // Codex P2 (missing-table fail-safe): before add-engine-version-jobs.sql is
    // applied (rollout / local DB drift) this query throws "relation does not
    // exist". Fail open here so the legacy accept/readiness paths keep working;
    // the authoritative no-active-lease guard is the atomic UPDATE predicate in
    // acceptRepair / failVersionVerificationIfUnleased (gated by leaseTableExists).
    console.warn(`[lease] hasActiveVersionLease degraded for ${versionId}:`, err);
    return false;
  }
}

/**
 * Build the WHERE for a server-owned version mutation. When `runId` is provided
 * the UPDATE is conditioned (atomically) on this run still holding the active,
 * unexpired lease — so a run whose lease was taken over no-ops instead of
 * clobbering. When `runId` is omitted, behaviour is unchanged (finalize /
 * createAndPromote paths own the row inline, before any background job).
 */
function versionWriteWhere(versionId: string, runId?: string): SQL | undefined {
  const byId = eq(engineVersions.id, versionId);
  if (!runId) return byId;
  return and(
    byId,
    sql`EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.run_id = ${runId} AND j.status = 'running' AND j.lease_expires_at > now())`,
  );
}

export async function markVersionVerifying(
  versionId: string,
  verificationSummary: string | null = "Automatic verification in progress.",
  runId?: string,
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "verifying",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function markVersionRepairing(
  versionId: string,
  verificationSummary: string | null = "Server-side repair in progress.",
  runId?: string,
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "repairing",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function promoteVersion(
  versionId: string,
  verificationSummary: string | null = "Automatic verification passed.",
  runId?: string,
): Promise<Version | null> {
  // False-green invariant guard: refuse `promoted` while the finalize quality
  // gate (telemetry) says the verifier/preflight blocked this version. Every
  // promote path consults `assertPromoteAllowed`: this function (quality-gate
  // route, server-verify, createAndPromoteDraftVersion) and `acceptRepair` (the
  // repair-accept/auto-accept path, which reads the repaired-pass signal
  // stamped by `saveRepairedFiles`). Fail-open when no signal exists (see guard).
  const guard = await assertPromoteAllowed(versionId);
  if (!guard.allowed) {
    console.warn(
      `[promote-guard] Refusing to promote version ${versionId}: ${guard.reason}`,
    );
    return null;
  }
  const promotedAt = new Date();
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "promoted",
      verificationState: "passed",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function failVersionVerification(
  versionId: string,
  verificationSummary: string | null = "Automatic verification failed.",
  runId?: string,
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "failed",
      verificationSummary,
      repairedFilesJson: null,
      repairAvailableAt: null,
      promotedAt: null,
    })
    .where(versionWriteWhere(versionId, runId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

/**
 * Watchdog-only fail (Codex P2): marks a stale version failed ONLY if no active
 * lease owns it, atomically (single UPDATE with a NOT EXISTS guard). Stops a
 * readiness poll from failing a version that a verify/repair run legitimately
 * acquired in the gap between a separate `hasActiveVersionLease` check and the
 * write. Returns null (no-op) when a job holds the lease or the row is gone.
 */
export async function failVersionVerificationIfUnleased(
  versionId: string,
  verificationSummary: string,
): Promise<Version | null> {
  // Codex P2 (missing-table fail-safe): decide whether to reference the lease
  // table BEFORE building the statement (Postgres resolves relations at plan
  // time; an in-statement to_regclass guard cannot short-circuit a missing one).
  const jobsExist = await leaseTableExists();
  const updated = await db.transaction(async (tx) => {
    // Codex P2 (serialize with acquireVersionLease): lock the version row FIRST.
    // acquireVersionLease locks the same row before committing its lease, so a
    // verify/repair that starts in the gap can't slip its lease in after our
    // no-active-lease snapshot — the conditional UPDATE below is a separate
    // statement and re-snapshots after the lock, seeing the committed lease.
    await tx.execute(sql`SELECT 1 FROM engine_versions WHERE id = ${versionId} FOR UPDATE`);
    const result = await tx
      .update(engineVersions)
      .set({
        releaseState: "draft",
        verificationState: "failed",
        verificationSummary,
        repairedFilesJson: null,
        repairAvailableAt: null,
        promotedAt: null,
      })
      .where(
        and(
          eq(engineVersions.id, versionId),
          // Only enforce the no-active-lease guard once the table exists; before
          // migration this degrades to the legacy unconditional watchdog.
          jobsExist
            ? sql`NOT EXISTS (SELECT 1 FROM engine_version_jobs j WHERE j.version_id = ${versionId} AND j.status = 'running' AND j.lease_expires_at > now())`
            : undefined,
        ),
      );
    return (result.rowCount ?? 0) > 0;
  });
  if (!updated) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function markVersionSupersededByRepair(
  versionId: string,
  repairedVersionId: string | null = null,
  runId?: string,
): Promise<Version | null> {
  const summary = repairedVersionId
    ? `Superseded by repaired version ${repairedVersionId}.`
    : "Superseded by repaired version.";
  return failVersionVerification(versionId, summary, runId);
}

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

