import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { verifyPassword } from "@/lib/auth/auth";
import { getKostnadsfriPageBySlug } from "@/lib/db/services";
import {
  extractCompanyData,
  companyDataFromSlug,
  isPageAccessible,
  verifyDeterministicPassword,
} from "@/lib/kostnadsfri";

/**
 * POST /api/kostnadsfri/[slug]/verify — Verify password for a kostnadsfri page
 *
 * Works in two modes:
 * 1. DB record exists: verifies against stored password hash + returns stored company data
 * 2. No DB record: verifies against deterministic password (HMAC) + derives company name from slug
 *
 * This means ANY slug works without pre-creation.
 * Rate-limited to 5 attempts per hour per IP.
 */

const verifySchema = z.object({
  password: z.string().min(1, "Password is required"),
});

// Simple in-memory rate limiting for password attempts
const attemptStore = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkAttemptLimit(key: string): boolean {
  const now = Date.now();
  const entry = attemptStore.get(key);

  if (!entry || now > entry.resetAt) {
    attemptStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    // Rate limit by IP + slug
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const rateLimitKey = `${ip}:${slug}`;

    if (!checkAttemptLimit(rateLimitKey)) {
      return NextResponse.json(
        { success: false, error: "För många försök. Vänta en stund och försök igen." },
        { status: 429 },
      );
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const validation = verifySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Lösenord krävs." },
        { status: 400 },
      );
    }

    const { password } = validation.data;

    // Try DB first (pre-created pages with enriched data)
    let page;
    try {
      page = await getKostnadsfriPageBySlug(slug);
    } catch {
      // DB not available — fall through to deterministic verification
    }

    if (page) {
      // Mode 1: DB record exists — use stored hash + check accessibility
      const access = isPageAccessible(page);
      if (!access.accessible) {
        return NextResponse.json(
          { success: false, error: access.reason },
          { status: 403 },
        );
      }

      if (!verifyPassword(password, page.password_hash)) {
        return NextResponse.json(
          { success: false, error: "Felaktigt lösenord." },
          { status: 401 },
        );
      }

      return NextResponse.json({
        success: true,
        companyData: extractCompanyData(page),
      });
    }

    // Mode 2: No DB record — verify deterministically
    if (!verifyDeterministicPassword(slug, password)) {
      return NextResponse.json(
        { success: false, error: "Felaktigt lösenord." },
        { status: 401 },
      );
    }

    // Success — return slug-derived company data
    return NextResponse.json({
      success: true,
      companyData: companyDataFromSlug(slug),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API/kostnadsfri/verify] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
