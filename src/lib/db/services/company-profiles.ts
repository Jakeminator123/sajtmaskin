import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appProjects, companyProfiles } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { CompanyProfile } from "./shared";

export type OwnerScope = {
  userId?: string | null;
  sessionId?: string | null;
};

function buildOwnerCondition(scope: OwnerScope) {
  const userId = scope.userId?.trim();
  const sessionId = scope.sessionId?.trim();

  if (userId && sessionId) {
    return or(
      eq(appProjects.user_id, userId),
      and(isNull(appProjects.user_id), eq(appProjects.session_id, sessionId)),
    );
  }
  if (userId) return eq(appProjects.user_id, userId);
  if (sessionId) return and(isNull(appProjects.user_id), eq(appProjects.session_id, sessionId));
  return null;
}

async function verifyProjectOwnership(
  projectId: string,
  scope: OwnerScope,
): Promise<boolean> {
  const condition = buildOwnerCondition(scope);
  if (!condition) return false;
  const rows = await db
    .select({ id: appProjects.id })
    .from(appProjects)
    .where(and(eq(appProjects.id, projectId), condition))
    .limit(1);
  return rows.length > 0;
}

async function getOwnedProjectIds(scope: OwnerScope): Promise<string[]> {
  const condition = buildOwnerCondition(scope);
  if (!condition) return [];
  const rows = await db.select({ id: appProjects.id }).from(appProjects).where(condition);
  return rows.map((r) => r.id);
}

export async function saveCompanyProfile(
  profile: Omit<CompanyProfile, "id" | "created_at" | "updated_at">,
  scope: OwnerScope,
): Promise<CompanyProfile> {
  assertDbConfigured();

  if (profile.project_id) {
    const owned = await verifyProjectOwnership(profile.project_id, scope);
    if (!owned) throw new Error("Project not found or access denied");
  }

  const now = new Date();

  const existing = profile.project_id
    ? await db
        .select()
        .from(companyProfiles)
        .where(eq(companyProfiles.project_id, profile.project_id))
        .limit(1)
    : [];

  if (existing[0]) {
    const rows = await db
      .update(companyProfiles)
      .set({ ...profile, updated_at: now })
      .where(eq(companyProfiles.id, existing[0].id))
      .returning();
    return rows[0];
  }

  const rows = await db
    .insert(companyProfiles)
    .values({
      ...profile,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function getCompanyProfileByProjectId(
  projectId: string,
): Promise<CompanyProfile | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.project_id, projectId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCompanyProfileByName(name: string): Promise<CompanyProfile | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.company_name, name))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAllCompanyProfiles(scope: OwnerScope): Promise<CompanyProfile[]> {
  assertDbConfigured();
  const projectIds = await getOwnedProjectIds(scope);
  if (projectIds.length === 0) return [];
  return db
    .select()
    .from(companyProfiles)
    .where(inArray(companyProfiles.project_id, projectIds))
    .orderBy(desc(companyProfiles.updated_at));
}

export async function searchCompanyProfiles(
  search: string,
  scope: OwnerScope,
): Promise<CompanyProfile[]> {
  assertDbConfigured();
  const projectIds = await getOwnedProjectIds(scope);
  if (projectIds.length === 0) return [];
  const term = `%${search}%`;
  return db
    .select()
    .from(companyProfiles)
    .where(
      and(
        sql`${companyProfiles.company_name} ILIKE ${term}`,
        inArray(companyProfiles.project_id, projectIds),
      ),
    )
    .orderBy(desc(companyProfiles.updated_at));
}

export async function linkCompanyProfileToProject(
  profileId: number | string,
  projectId: string,
  scope: OwnerScope,
): Promise<void> {
  assertDbConfigured();

  const owned = await verifyProjectOwnership(projectId, scope);
  if (!owned) throw new Error("Project not found or access denied");

  const id = typeof profileId === "string" ? parseInt(profileId, 10) : profileId;
  await db
    .update(companyProfiles)
    .set({ project_id: projectId, updated_at: new Date() })
    .where(eq(companyProfiles.id, id));
}
