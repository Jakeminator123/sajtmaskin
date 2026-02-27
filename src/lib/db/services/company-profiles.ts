import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companyProfiles } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { CompanyProfile } from "./shared";

export async function saveCompanyProfile(
  profile: Omit<CompanyProfile, "id" | "created_at" | "updated_at">,
): Promise<CompanyProfile> {
  assertDbConfigured();
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

export async function getAllCompanyProfiles(): Promise<CompanyProfile[]> {
  assertDbConfigured();
  return db.select().from(companyProfiles).orderBy(desc(companyProfiles.updated_at));
}

export async function searchCompanyProfiles(search: string): Promise<CompanyProfile[]> {
  assertDbConfigured();
  const term = `%${search}%`;
  return db
    .select()
    .from(companyProfiles)
    .where(sql`${companyProfiles.company_name} ILIKE ${term}`)
    .orderBy(desc(companyProfiles.updated_at));
}

export async function linkCompanyProfileToProject(
  profileId: number | string,
  projectId: string,
): Promise<void> {
  assertDbConfigured();
  const id = typeof profileId === "string" ? parseInt(profileId, 10) : profileId;
  await db
    .update(companyProfiles)
    .set({ project_id: projectId, updated_at: new Date() })
    .where(eq(companyProfiles.id, id));
}
