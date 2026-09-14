import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { hashPassword } from "@/lib/auth/auth";
import {
  createKostnadsfriPage,
  getKostnadsfriPageBySlug,
  listKostnadsfriPages,
  markKostnadsfriPageSent,
} from "@/lib/db/services/kostnadsfri";
import type { KostnadsfriPage } from "@/lib/db/services/shared";
import { buildKostnadsfriInvite, KostnadsfriInviteError } from "@/lib/kostnadsfri/invite";
import { normalizeKostnadsfriOpenClawConfig } from "@/lib/kostnadsfri/openclaw-config";

/**
 * Machine entry for the kostnadsfri mail-link flow. Requires
 * KOSTNADSFRI_API_KEY in the x-api-key header.
 *
 * POST — create a password-protected company landing page at
 *        /kostnadsfri/[slug]. Password can be provided explicitly, or omitted
 *        to auto-generate a deterministic password from the slug + secret seed.
 *        With `sentAt` the call is an upsert instead: an existing slug records
 *        the send (200) rather than conflicting (409).
 * GET  — the send register: every stored page without credentials, newest
 *        first. Backs the external mail tool and `/admin/kostnadsfri`.
 */

const createSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  password: z.string().min(4, "Password must be at least 4 characters").optional(),
  expiresInDays: z.number().positive().optional(),
  /**
   * When the invite mail went out (ISO 8601 with timezone — `Z` or `±HH:MM`,
   * so Python's `datetime.isoformat()` is accepted as-is). Presence turns the
   * call into an upsert; absence keeps the original create-only behaviour.
   */
  sentAt: z.string().datetime({ offset: true }).optional(),
  /** Who registered the send, e.g. `python-utskick`. Defaults to `api`. */
  source: z.string().min(1).max(60).optional(),
  openclaw: z
    .object({
      roleLabel: z.string().trim().min(1).max(80).optional(),
      introTitle: z.string().trim().min(1).max(120).optional(),
      introBody: z.string().trim().min(1).max(320).optional(),
      starterPrompts: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
    })
    .optional(),
});

/** Default `source` when a send is registered without naming its origin. */
const DEFAULT_SEND_SOURCE = "api";

/** Hard cap on the register read so the list can never grow unbounded. */
const LIST_LIMIT = 2000;

function isAuthorized(request: NextRequest): boolean {
  const expectedKey = process.env.KOSTNADSFRI_API_KEY;
  return Boolean(expectedKey) && request.headers.get("x-api-key") === expectedKey;
}

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Register-safe view of a row: never the password hash, never `extra_data`
 * (which is handed to the browser after a successful password verification).
 */
function serializePage(page: KostnadsfriPage) {
  return {
    slug: page.slug,
    companyName: page.company_name,
    contactEmail: page.contact_email,
    contactName: page.contact_name,
    status: page.status,
    sentAt: toIso(page.sent_at),
    source: page.source,
    createdAt: toIso(page.created_at),
    expiresAt: toIso(page.expires_at),
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) return unauthorized();

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
      sentAt,
      source,
      openclaw,
    } = validation.data;

    // Slug + password (explicit or deterministic from slug + seed) + link
    let invite;
    try {
      invite = buildKostnadsfriInvite(companyName, { password: explicitPassword });
    } catch (error) {
      if (error instanceof KostnadsfriInviteError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    const { slug, password, url } = invite;

    const existing = await getKostnadsfriPageBySlug(slug);
    if (existing) {
      // Without `sentAt` this route stays create-only, so a known slug is a
      // conflict exactly like before.
      if (!sentAt) {
        return NextResponse.json(
          { success: false, error: `A page with slug "${slug}" already exists` },
          { status: 409 },
        );
      }

      const updated = await markKostnadsfriPageSent(slug, {
        sentAt: new Date(sentAt),
        source: source || DEFAULT_SEND_SOURCE,
        contactEmail,
      });
      if (!updated) {
        // Row disappeared between the lookup and the update.
        return NextResponse.json(
          { success: false, error: `A page with slug "${slug}" no longer exists` },
          { status: 409 },
        );
      }

      // No password here: a row created with its own explicit password cannot
      // be recovered from the seed, so the derived one would be a lie.
      return NextResponse.json({
        success: true,
        updated: true,
        page: { id: updated.id, ...serializePage(updated), url },
      });
    }

    const passwordHash = hashPassword(password);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const openclawConfig = normalizeKostnadsfriOpenClawConfig(openclaw);

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
      sentAt: sentAt ? new Date(sentAt) : undefined,
      source: sentAt ? source || DEFAULT_SEND_SOURCE : undefined,
    });

    return NextResponse.json({
      success: true,
      updated: false,
      page: {
        id: page.id,
        ...serializePage(page),
        password,
        url,
        openclaw: openclawConfig,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API/kostnadsfri] Failed to create page:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) return unauthorized();

    const rows = await listKostnadsfriPages(LIST_LIMIT);
    return NextResponse.json({ success: true, pages: rows.map(serializePage) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API/kostnadsfri] Failed to list pages:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
