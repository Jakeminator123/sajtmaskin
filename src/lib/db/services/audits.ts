import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userAudits } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { UserAudit } from "./shared";

function extractAuditScores(result: Record<string, unknown> | null): {
  score_overall: number | null;
  score_seo: number | null;
  score_ux: number | null;
  score_performance: number | null;
  score_security: number | null;
} {
  const scores =
    result && typeof result === "object" && "audit_scores" in result
      ? (result.audit_scores as Record<string, number | undefined>)
      : null;

  if (!scores) {
    return {
      score_overall: null,
      score_seo: null,
      score_ux: null,
      score_performance: null,
      score_security: null,
    };
  }

  const values = Object.values(scores).filter((v) => typeof v === "number") as number[];
  const overall =
    values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null;

  return {
    score_overall: overall,
    score_seo: scores.seo ?? null,
    score_ux: scores.ux ?? null,
    score_performance: scores.performance ?? null,
    score_security: scores.security ?? null,
  };
}

export async function saveUserAudit(
  userId: string,
  url: string,
  domain: string,
  auditResult: Record<string, unknown>,
): Promise<UserAudit> {
  assertDbConfigured();
  const scores = extractAuditScores(auditResult);
  const companyName =
    typeof auditResult.company === "string" ? (auditResult.company as string) : null;
  const rows = await db
    .insert(userAudits)
    .values({
      user_id: userId,
      url,
      domain,
      company_name: companyName,
      score_overall: scores.score_overall,
      score_seo: scores.score_seo,
      score_ux: scores.score_ux,
      score_performance: scores.score_performance,
      score_security: scores.score_security,
      audit_result: JSON.stringify(auditResult),
      created_at: new Date(),
    })
    .returning();
  return rows[0];
}

export async function getUserAudits(userId: string): Promise<UserAudit[]> {
  assertDbConfigured();
  return db
    .select()
    .from(userAudits)
    .where(eq(userAudits.user_id, userId))
    .orderBy(desc(userAudits.created_at));
}

export async function getUserAuditCount(userId: string): Promise<number> {
  assertDbConfigured();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(userAudits)
    .where(eq(userAudits.user_id, userId));
  return rows[0]?.count ?? 0;
}

export async function getUserAuditById(auditId: number, userId: string): Promise<UserAudit | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(userAudits)
    .where(and(eq(userAudits.id, auditId), eq(userAudits.user_id, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteUserAudit(auditId: number, userId: string): Promise<boolean> {
  assertDbConfigured();
  const result = await db
    .delete(userAudits)
    .where(and(eq(userAudits.id, auditId), eq(userAudits.user_id, userId)))
    .returning({ id: userAudits.id });
  return result.length > 0;
}
