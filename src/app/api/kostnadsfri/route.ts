import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { hashPassword } from "@/lib/auth/auth";
import { createKostnadsfriPage, getKostnadsfriPageBySlug } from "@/lib/db/services";
import { generateSlug } from "@/lib/kostnadsfri";

/**
 * POST /api/kostnadsfri — Create a new kostnadsfri page
 *
 * Requires KOSTNADSFRI_API_KEY in the x-api-key header.
 * Creates a password-protected company landing page at /kostnadsfri/[slug].
 */

const createSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  password: z.string().min(4, "Password must be at least 4 characters"),
  expiresInDays: z.number().positive().optional(),
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

    const { companyName, industry, website, contactEmail, contactName, password, expiresInDays } =
      validation.data;

    // Generate slug
    const slug = generateSlug(companyName);

    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Could not generate a valid slug from company name" },
        { status: 400 },
      );
    }

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

    // Create page
    const page = await createKostnadsfriPage({
      slug,
      passwordHash,
      companyName,
      industry,
      website,
      contactEmail,
      contactName,
      expiresAt,
    });

    // Build the full URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sajtmaskin.vercel.app";
    const url = `${baseUrl}/kostnadsfri/${slug}`;

    return NextResponse.json({
      success: true,
      page: {
        id: page.id,
        slug: page.slug,
        companyName: page.company_name,
        url,
        expiresAt: page.expires_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API/kostnadsfri] Failed to create page:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
