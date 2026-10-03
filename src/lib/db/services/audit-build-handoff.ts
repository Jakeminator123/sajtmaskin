import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { appProjects, promptHandoffs } from "@/lib/db/schema";
import { canCreateProject } from "@/lib/projects/project-cleanup";
import { buildAuditDisplayPrompt, type AuditHandoffPayload } from "@/lib/builder/audit-handoff";
import { assertDbConfigured } from "./shared";

export class AuditBuildHandoffError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: "AUDIT_HANDOFF_PROJECT_MISSING",
  ) {
    super(message);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Existing tables/PK only. Failed transactions create no project; ambiguous ACK retries reuse it. */
export async function createAuditProjectHandoff(params: {
  attemptId: string;
  userId: string;
  isPaidUser: boolean;
  payload: AuditHandoffPayload;
}): Promise<{ projectId: string; promptId: string; consumed: boolean }> {
  assertDbConfigured();
  if (
    !params.userId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.attemptId)
  ) {
    throw new AuditBuildHandoffError("Ogiltigt byggförsök.", 400);
  }
  const promptId = `audit_${createHash("sha256")
    .update(JSON.stringify([params.userId, params.attemptId.toLowerCase()]))
    .digest("hex")}`;
  return db.transaction(async (tx) => {
    // Serialize this owner's audit attempts, including quota count + insert.
    // The lock lasts only for the transaction, not for browser/network/cache work.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`audit-build:${params.userId}`}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(promptHandoffs)
      .where(and(eq(promptHandoffs.id, promptId), eq(promptHandoffs.user_id, params.userId)))
      .limit(1);
    if (existing) {
      if (
        existing.source !== "audit" ||
        canonical(existing.payload) !== canonical(params.payload) ||
        !existing.project_id
      ) {
        throw new AuditBuildHandoffError("Byggförsöket matchar inte denna analys.", 409);
      }
      const [project] = await tx
        .select()
        .from(appProjects)
        .where(and(eq(appProjects.id, existing.project_id), eq(appProjects.user_id, params.userId)))
        .limit(1);
      if (!project)
        throw new AuditBuildHandoffError("Projektet för byggförsöket finns inte längre.", 409, "AUDIT_HANDOFF_PROJECT_MISSING");
      return { projectId: project.id, promptId, consumed: Boolean(existing.consumed_at) };
    }
    const limit = await canCreateProject(params.userId, null, params.isPaidUser, tx);
    if (!limit.allowed)
      throw new AuditBuildHandoffError(limit.reason || "Projektgränsen har nåtts.", 403);
    // Display copy is stored with the first accepted attempt, not identity.
    const prompt = buildAuditDisplayPrompt(params.payload);
    const projectId = nanoid();
    const now = new Date();
    await tx.insert(appProjects).values({
      id: projectId,
      user_id: params.userId,
      name: `Audit - ${now.toLocaleDateString("sv-SE")}`,
      category: "audit",
      description: prompt.substring(0, 100),
      created_at: now,
      updated_at: now,
    });
    await tx.insert(promptHandoffs).values({
      id: promptId,
      prompt,
      source: "audit",
      project_id: projectId,
      user_id: params.userId,
      payload: params.payload,
      created_at: now,
    });
    return { projectId, promptId, consumed: false };
  });
}
