import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { kostnadsfriPages } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { KostnadsfriPage } from "./shared";

export async function createKostnadsfriPage(data: {
  slug: string;
  passwordHash: string;
  companyName: string;
  industry?: string;
  website?: string;
  contactEmail?: string;
  contactName?: string;
  extraData?: Record<string, unknown>;
  expiresAt?: Date;
}): Promise<KostnadsfriPage> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(kostnadsfriPages)
    .values({
      slug: data.slug,
      password_hash: data.passwordHash,
      company_name: data.companyName,
      industry: data.industry || null,
      website: data.website || null,
      contact_email: data.contactEmail || null,
      contact_name: data.contactName || null,
      extra_data: data.extraData || null,
      status: "active",
      created_at: now,
      updated_at: now,
      expires_at: data.expiresAt || null,
    })
    .returning();
  return rows[0];
}

export async function getKostnadsfriPageBySlug(
  slug: string,
): Promise<KostnadsfriPage | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(kostnadsfriPages)
    .where(eq(kostnadsfriPages.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function markKostnadsfriConsumed(slug: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(kostnadsfriPages)
    .set({ consumed_at: new Date(), status: "consumed" })
    .where(eq(kostnadsfriPages.slug, slug));
}

export async function getAllKostnadsfriPages(): Promise<KostnadsfriPage[]> {
  assertDbConfigured();
  return db
    .select()
    .from(kostnadsfriPages)
    .orderBy(desc(kostnadsfriPages.created_at));
}
