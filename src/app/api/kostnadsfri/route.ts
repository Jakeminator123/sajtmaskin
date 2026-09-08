import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { hashPassword } from "@/lib/auth/auth";
import { createKostnadsfriPage, getKostnadsfriPageBySlug } from "@/lib/db/services/kostnadsfri";
import { buildKostnadsfriInvite, KostnadsfriInviteError } from "@/lib/kostnadsfri/invite";
import { normalizeKostnadsfriOpenClawConfig } from "@/lib/kostnadsfri/openclaw-config";

/**
 * POST /api/kostnadsfri — Create a new kostnadsfri page
 *
 * Requires KOSTNADSFRI_API_KEY in the x-api-key header.
 * Creates a password-protected company landing page at /kostnadsfri/[slug].
 *
 * Password can be provided explicitly, or omitted to auto-generate
 * a deterministic password from the company slug + secret seed.
 */

const createSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  password: z.string().min(4, "Password must be at least 4 characters").optional(),
  expiresInDays: z.number().positive().optional(),
  openclaw: z
    .object({
      roleLabel: z.string().trim().min(1).max(80).optional(),
      introTitle: z.string().trim().min(1).max(120).optional(),
      introBody: z.string().trim().min(1).max(320).optional(),
      starterPrompts: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get("x-api-key");
    const expectedKey = process.env.KOSTNADSFRI_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = createSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const {
      companyName,
      industry,
      website,
      contactEmail,
      contactName,
      password: explicitPassword,
      expiresInDays,
      openclaw,
    } =
      validation.data;

    // Slug + password (explicit or deterministic from slug + seed) + link
    let invite;
    try {
      invite = buildKostnadsfriInvite(companyName, { password: explicitPassword });
    } catch (error) {
      if (error instanceof KostnadsfriInviteError) {
        return NextResponse.json({ success: false, error: error.message }, { status: error.status });
      }
      throw error;
    }
    const { slug, password, url } = invite;

    // Check if slug already exists
    const existing = await getKostnadsfriPageBySlug(slug);
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A page with slug "${slug}" already exists` },
        { status: 409 },
      );
    }

    // Hash password
    const passwordHash = hashPassword(password);

    // Calculate expiry
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const openclawConfig = normalizeKostnadsfriOpenClawConfig(openclaw);

    // Create page
    const page = await createKostnadsfriPage({
      slug,
      passwordHash,
      companyName,
      industry,
      website,
      contactEmail,
      contactName,
      extraData: openclawConfig ? { openclaw: openclawConfig } : undefined,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      page: {
        id: page.id,
        slug: page.slug,
        companyName: page.company_name,
        password,
        url,
        expiresAt: page.expires_at,
        openclaw: openclawConfig,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API/kostnadsfri] Failed to create page:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
