import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdminAccess } from "@/lib/auth/admin";
import { hashPassword } from "@/lib/auth/auth";
import {
  createKostnadsfriPage,
  getKostnadsfriPageBySlug,
  getKostnadsfriVisitStats,
  listKostnadsfriPages,
} from "@/lib/db/services/kostnadsfri";
import { hasKostnadsfriPasswordSecret, isPageAccessible } from "@/lib/kostnadsfri";
import { buildKostnadsfriInvite, KostnadsfriInviteError } from "@/lib/kostnadsfri/invite";

/**
 * Admin view of the kostnadsfri mail-link flow.
 *
 * GET  — pre-created pages + visit statistics per slug (from `page_views`).
 * POST — generate slug, password and link for a company name; optionally save
 *        a DB record so the page gets stored company data and an expiry.
 *
 * The public `POST /api/kostnadsfri` (x-api-key) stays the machine entry; this
 * route is the human one behind the admin session. Both build the invite via
 * `buildKostnadsfriInvite`, so the password shown here is exactly the one the
 * verify route will accept for a slug without a DB record.
 */

const generateSchema = z.object({
  companyName: z.string().trim().min(1, "Företagsnamn krävs").max(120),
  saveRecord: z.boolean().optional(),
  industry: z.string().trim().max(60).optional(),
  website: z.string().trim().max(300).optional(),
  contactEmail: z.email().optional().or(z.literal("")),
  contactName: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;

  const rawDays = parseInt(req.nextUrl.searchParams.get("days") || "90", 10);
  const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 3650 ? rawDays : 90;

  try {
    const [rows, visits] = await Promise.all([
      listKostnadsfriPages(),
      getKostnadsfriVisitStats(days),
    ]);

    const pages = rows.map((page) => {
      const access = isPageAccessible(page);
      return {
        slug: page.slug,
        companyName: page.company_name,
        industry: page.industry,
        website: page.website,
        contactEmail: page.contact_email,
        contactName: page.contact_name,
        status: access.accessible ? (page.status ?? "active") : "expired",
        createdAt: page.created_at,
        expiresAt: page.expires_at,
        consumedAt: page.consumed_at,
      };
    });

    return NextResponse.json({
      success: true,
      days,
      configured: hasKostnadsfriPasswordSecret(),
      pages,
      stats: visits.perSlug,
      recent: visits.recent,
      truncated: visits.truncated,
    });
  } catch (error) {
    console.error("[API/admin/kostnadsfri] Failed to load:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte läsa kostnadsfri-data." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;

  const body = await req.json().catch(() => ({}));
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Ogiltig begäran." },
      { status: 400 },
    );
  }

  const { companyName, saveRecord, industry, website, contactEmail, contactName, expiresInDays } =
    parsed.data;

  let invite;
  try {
    invite = buildKostnadsfriInvite(companyName);
  } catch (error) {
    if (error instanceof KostnadsfriInviteError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    throw error;
  }

  if (!saveRecord) {
    return NextResponse.json({ success: true, invite, saved: false });
  }

  try {
    const existing = await getKostnadsfriPageBySlug(invite.slug);
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Det finns redan en sparad sida för "${invite.slug}". Länken och lösenordet ovan gäller ändå.`,
          invite,
        },
        { status: 409 },
      );
    }

    await createKostnadsfriPage({
      slug: invite.slug,
      passwordHash: hashPassword(invite.password),
      companyName: invite.companyName,
      industry: industry || undefined,
      website: website || undefined,
      contactEmail: contactEmail || undefined,
      contactName: contactName || undefined,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
    });

    return NextResponse.json({ success: true, invite, saved: true });
  } catch (error) {
    console.error("[API/admin/kostnadsfri] Failed to save page:", error);
    return NextResponse.json(
      { success: false, error: "Länken skapades men kunde inte sparas i databasen.", invite },
      { status: 500 },
    );
  }
}
