import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db/client";

/**
 * Lease must outlive the route `maxDuration` (300s). A live handler still
 * inside its platform deadline must not be stolen by a retry.
 */
export const TEMPLATE_INIT_CLAIM_LEASE_MS = 6 * 60 * 1000;

export type TemplateInitClaimStatus = "pending" | "completed" | "failed";

export type TemplateInitTablePresence = "exists" | "missing" | "unavailable";

export type ClaimedTemplateInit =
  | {
      kind: "acquired";
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId: string | null;
      chatId: string | null;
      versionId: string | null;
    }
  | {
      kind: "imported";
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId: string | null;
      chatId: string;
      versionId: string;
    }
  | {
      kind: "busy";
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId: string | null;
    }
  | {
      kind: "completed";
      claimKey: string;
      operationId: string;
      claimGeneration: number;
      projectId: string | null;
      chatId: string | null;
      versionId: string | null;
    }
  | {
      kind: "unavailable";
      reason: "missing" | "unavailable" | "db_error" | "not_configured";
    };

type ClaimRow = {
  claim_key: string;
  operation_id: string;
  status: string;
  claim_generation: number | string;
  project_id: string | null;
  chat_id: string | null;
  version_id: string | null;
  expires_at?: Date | string;
};

function asRows(result: unknown): ClaimRow[] {
  return (result as { rows?: ClaimRow[] } | undefined)?.rows ?? [];
}

function trimId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapRow(row: ClaimRow) {
  return {
    claimKey: row.claim_key,
    operationId: row.operation_id,
    claimGeneration: Number(row.claim_generation) || 1,
    projectId: trimId(row.project_id),
    chatId: trimId(row.chat_id),
    versionId: trimId(row.version_id),
  };
}

function asImported(
  mapped: ReturnType<typeof mapRow>,
): Extract<ClaimedTemplateInit, { kind: "imported" }> | null {
  if (!mapped.chatId || !mapped.versionId) return null;
  return {
    kind: "imported",
    claimKey: mapped.claimKey,
    operationId: mapped.operationId,
    claimGeneration: mapped.claimGeneration,
    projectId: mapped.projectId,
    chatId: mapped.chatId,
    versionId: mapped.versionId,
  };
}

function asAcquired(mapped: ReturnType<typeof mapRow>): Extract<ClaimedTemplateInit, { kind: "acquired" }> {
  return {
    kind: "acquired",
    claimKey: mapped.claimKey,
    operationId: mapped.operationId,
    claimGeneration: mapped.claimGeneration,
    projectId: mapped.projectId,
    chatId: mapped.chatId,
    versionId: mapped.versionId,
  };
}

/**
 * Durable key for one logical template-init.
 * Pass only a client-supplied projectId. A project recovered from owner-scoped
 * persist must not be passed in — that switches family and mints a new
 * operation_id, so credit idempotency no longer applies.
 */
export function buildTemplateInitClaimKey(input: {
  projectId?: string | null;
  templateId: string;
  userId?: string | null;
  sessionId?: string | null;
}): string | null {
  const templateId = trimId(input.templateId);
  if (!templateId) return null;
  const projectId = trimId(input.projectId);
  if (projectId) return `project:${projectId}:${templateId}`;
  const userId = trimId(input.userId);
  if (userId) return `owner:user:${userId}:${templateId}`;
  const sessionId = trimId(input.sessionId);
  if (sessionId) return `owner:session:${sessionId}:${templateId}`;
  return null;
}

export function templateInitClaimExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + TEMPLATE_INIT_CLAIM_LEASE_MS);
}

export async function templateInitOperationsTablePresence(): Promise<TemplateInitTablePresence> {
  if (!dbConfigured) return "unavailable";
  try {
    const res = await db.execute(sql`SELECT to_regclass('public.template_init_operations') AS oid`);
    const rows = (res as unknown as { rows?: Array<{ oid: string | null }> }).rows ?? [];
    if (rows.length === 0) return "unavailable";
    return rows[0]?.oid != null ? "exists" : "missing";
  } catch {
    return "unavailable";
  }
}

async function selectClaimRow(claimKey: string): Promise<ClaimRow | null> {
  const result = await db.execute(sql`
    SELECT claim_key, operation_id, status, claim_generation, project_id, chat_id, version_id, expires_at
    FROM template_init_operations
    WHERE claim_key = ${claimKey}
    LIMIT 1
  `);
  return asRows(result)[0] ?? null;
}

/**
 * Atomically reserve one template-init operation.
 *
 * The reservation IS the insert: `claim_key` is the primary key, so two
 * serverless handlers cannot both proceed. A retry reuses the same
 * `operation_id` (credits idempotency key). Fail-closed when the table
 * probe is indeterminate. A confirmed-missing table is also unavailable —
 * pending metadata on `project_data` is not a concurrency lock.
 */
export async function claimTemplateInit(input: {
  projectId?: string | null;
  templateId: string;
  userId?: string | null;
  sessionId?: string | null;
}): Promise<ClaimedTemplateInit> {
  if (!dbConfigured) return { kind: "unavailable", reason: "not_configured" };

  const claimKey = buildTemplateInitClaimKey(input);
  if (!claimKey) return { kind: "unavailable", reason: "db_error" };

  const presence = await templateInitOperationsTablePresence();
  if (presence !== "exists") {
    return { kind: "unavailable", reason: presence };
  }

  const projectId = trimId(input.projectId);
  const templateId = trimId(input.templateId);
  const userId = trimId(input.userId);
  const sessionId = trimId(input.sessionId);
  if (!templateId) return { kind: "unavailable", reason: "db_error" };

  const operationId = randomUUID();
  const leaseSeconds = Math.round(TEMPLATE_INIT_CLAIM_LEASE_MS / 1000);

  try {
    const inserted = asRows(
      await db.execute(sql`
        INSERT INTO template_init_operations (
          claim_key, operation_id, status, user_id, session_id, project_id,
          template_id, claim_generation, created_at, updated_at, expires_at
        ) VALUES (
          ${claimKey}, ${operationId}, 'pending', ${userId}, ${sessionId}, ${projectId},
          ${templateId}, 1, now(), now(),
          now() + ${leaseSeconds} * interval '1 second'
        )
        ON CONFLICT (claim_key) DO NOTHING
        RETURNING claim_key, operation_id, status, claim_generation, project_id, chat_id, version_id
      `),
    );
    if (inserted[0]) {
      return asAcquired(mapRow(inserted[0]));
    }

    const existing = await selectClaimRow(claimKey);
    if (!existing) return { kind: "unavailable", reason: "db_error" };
    const mapped = mapRow(existing);

    if (existing.status === "completed") {
      return {
        kind: "completed",
        claimKey: mapped.claimKey,
        operationId: mapped.operationId,
        claimGeneration: mapped.claimGeneration,
        projectId: mapped.projectId,
        chatId: mapped.chatId,
        versionId: mapped.versionId,
      };
    }

    if (existing.status === "pending") {
      const imported = asImported(mapped);
      if (imported) return imported;
      const expiresAt = existing.expires_at;
      const expired =
        expiresAt != null &&
        (expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime()) <=
          Date.now();
      if (!expired) {
        return {
          kind: "busy",
          claimKey: mapped.claimKey,
          operationId: mapped.operationId,
          claimGeneration: mapped.claimGeneration,
          projectId: mapped.projectId,
        };
      }
    }

    const taken = asRows(
      await db.execute(sql`
        UPDATE template_init_operations
        SET status = 'pending',
            claim_generation = claim_generation + 1,
            error = NULL,
            updated_at = now(),
            expires_at = now() + ${leaseSeconds} * interval '1 second'
        WHERE claim_key = ${claimKey}
          AND (
            status = 'failed'
            OR (
              status = 'pending'
              AND expires_at <= now()
            )
          )
        RETURNING claim_key, operation_id, status, claim_generation, project_id, chat_id, version_id
      `),
    );
    if (taken[0]) {
      const row = mapRow(taken[0]);
      return asImported(row) ?? asAcquired(row);
    }

    const raced = await selectClaimRow(claimKey);
    if (!raced) return { kind: "unavailable", reason: "db_error" };
    const racedMapped = mapRow(raced);
    if (raced.status === "completed") {
      return {
        kind: "completed",
        claimKey: racedMapped.claimKey,
        operationId: racedMapped.operationId,
        claimGeneration: racedMapped.claimGeneration,
        projectId: racedMapped.projectId,
        chatId: racedMapped.chatId,
        versionId: racedMapped.versionId,
      };
    }
    const racedImported = asImported(racedMapped);
    if (racedImported) return racedImported;
    return {
      kind: "busy",
      claimKey: racedMapped.claimKey,
      operationId: racedMapped.operationId,
      claimGeneration: racedMapped.claimGeneration,
      projectId: racedMapped.projectId,
    };
  } catch {
    return { kind: "unavailable", reason: "db_error" };
  }
}

export async function bindTemplateInitProject(input: {
  claimKey: string;
  operationId: string;
  claimGeneration: number;
  projectId: string;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const presence = await templateInitOperationsTablePresence();
  if (presence !== "exists") return false;
  const result = await db.execute(sql`
    UPDATE template_init_operations
    SET project_id = ${input.projectId},
        updated_at = now()
    WHERE claim_key = ${input.claimKey}
      AND operation_id = ${input.operationId}
      AND claim_generation = ${input.claimGeneration}
      AND status = 'pending'
    RETURNING operation_id
  `);
  return asRows(result).length > 0;
}

export async function recordTemplateInitImport(input: {
  claimKey: string;
  operationId: string;
  claimGeneration: number;
  projectId: string;
  chatId: string;
  versionId: string;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const presence = await templateInitOperationsTablePresence();
  if (presence !== "exists") return false;
  const result = await db.execute(sql`
    UPDATE template_init_operations
    SET project_id = ${input.projectId},
        chat_id = ${input.chatId},
        version_id = ${input.versionId},
        error = NULL,
        updated_at = now()
    WHERE claim_key = ${input.claimKey}
      AND operation_id = ${input.operationId}
      AND claim_generation = ${input.claimGeneration}
      AND status = 'pending'
    RETURNING operation_id
  `);
  return asRows(result).length > 0;
}

export async function completeTemplateInitClaim(input: {
  claimKey: string;
  operationId: string;
  claimGeneration: number;
  projectId: string;
  chatId: string;
  versionId: string;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const presence = await templateInitOperationsTablePresence();
  if (presence !== "exists") return false;
  const result = await db.execute(sql`
    UPDATE template_init_operations
    SET status = 'completed',
        project_id = ${input.projectId},
        chat_id = ${input.chatId},
        version_id = ${input.versionId},
        error = NULL,
        updated_at = now()
    WHERE claim_key = ${input.claimKey}
      AND operation_id = ${input.operationId}
      AND claim_generation = ${input.claimGeneration}
      AND status = 'pending'
    RETURNING operation_id
  `);
  return asRows(result).length > 0;
}

/**
 * True when a prior template-init for the same logical scope was fully debited
 * (claim row reached `completed`). Persist alone is not payment proof.
 */
export async function hasTemplateInitPaymentProof(input: {
  projectId?: string | null;
  templateId: string;
  userId?: string | null;
  sessionId?: string | null;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const presence = await templateInitOperationsTablePresence();
  if (presence !== "exists") return false;

  const templateId = trimId(input.templateId);
  if (!templateId) return false;

  const claimKeys = new Set<string>();
  const projectKey = buildTemplateInitClaimKey({
    projectId: input.projectId,
    templateId,
    userId: input.userId,
    sessionId: input.sessionId,
  });
  if (projectKey) claimKeys.add(projectKey);
  const ownerKey = buildTemplateInitClaimKey({
    templateId,
    userId: input.userId,
    sessionId: input.sessionId,
  });
  if (ownerKey) claimKeys.add(ownerKey);
  if (claimKeys.size === 0) return false;

  try {
    for (const claimKey of claimKeys) {
      const row = await selectClaimRow(claimKey);
      if (row?.status === "completed") return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function failTemplateInitClaim(input: {
  claimKey: string;
  operationId: string;
  claimGeneration: number;
  error?: string;
  projectId?: string | null;
}): Promise<boolean> {
  if (!dbConfigured) return false;
  const presence = await templateInitOperationsTablePresence();
  if (presence !== "exists") return false;
  const projectId = trimId(input.projectId);
  const result = await db.execute(sql`
    UPDATE template_init_operations
    SET status = 'failed',
        error = ${input.error ?? null},
        project_id = COALESCE(${projectId}, project_id),
        updated_at = now()
    WHERE claim_key = ${input.claimKey}
      AND operation_id = ${input.operationId}
      AND claim_generation = ${input.claimGeneration}
      AND status = 'pending'
    RETURNING operation_id
  `);
  return asRows(result).length > 0;
}
