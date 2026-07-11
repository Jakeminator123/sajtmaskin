/**
 * Project preferences endpoint.
 *
 * Lightweight `PATCH`/`GET` for project-scoped settings persisted in
 * `project_data.meta`. Today covers:
 *
 * - `allowPlaceholdersInF3` (boolean) — added in the F3-readiness rework
 *   so the UI can opt the project into "use placeholders even for tier-3
 *   keys at F3 build time".
 * - `seo` (SEO opt-in + siteUrl + brand-overrides) — added in PR-A of the
 *   SEO-F3-promotion track. Persists what the future Bygg-dialog will
 *   write. Pipeline-koppling that *reads* this is PR-B scope.
 *
 * This route deliberately does NOT touch chat / files / messages so it is
 * safe to call from any panel without race conditions against the larger
 * `/save` endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getProjectByIdForOwner,
  getProjectData,
  saveProjectData,
} from "@/lib/db/services/projects";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  projectPreferencesPatchSchema,
  readSeoPreferencesFromMeta,
  SEO_PREFERENCES_DEFAULTS,
  type SeoPreferences,
  type SeoPreferencesPersisted,
} from "@/lib/projects/preferences-schema";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/**
 * Merge an inbound (Zod-validated) `seo` patch with the persisted shape.
 *
 * - Omitted fields keep their persisted value (true PATCH semantics —
 *   the UI can update one field without resending the whole object).
 * - Explicit `null` clears a field (caller can remove a previously set
 *   siteUrl or brand).
 * - `lastSetAt` is always refreshed when *any* SEO field is touched.
 */
function mergeSeoPatch(
  patch: SeoPreferences,
  persisted: SeoPreferencesPersisted,
  now: string,
): SeoPreferencesPersisted {
  return {
    optIn: patch.optIn !== undefined ? patch.optIn : persisted.optIn,
    siteUrl: patch.siteUrl !== undefined ? patch.siteUrl : persisted.siteUrl,
    brand: patch.brand !== undefined ? patch.brand : persisted.brand,
    lastSetAt: now,
  };
}

export async function PATCH(request: NextRequest, routeContext: RouteParams) {
  return withRateLimit(request, "preferences:patch", () =>
    handlePATCH(request, routeContext),
  );
}

async function handlePATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = projectPreferencesPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const existingData = await getProjectData(id);
    const existingMeta = asRecord(existingData?.meta);

    if (typeof parsed.data.allowPlaceholdersInF3 === "boolean") {
      existingMeta.allowPlaceholdersInF3 = parsed.data.allowPlaceholdersInF3;
    }

    if (parsed.data.seo !== undefined) {
      const existingSeo = readSeoPreferencesFromMeta(existingMeta);
      const merged = mergeSeoPatch(
        parsed.data.seo,
        existingSeo,
        new Date().toISOString(),
      );
      existingMeta.seo = merged;
    }

    await saveProjectData({
      project_id: id,
      meta: existingMeta,
    });

    return NextResponse.json({
      success: true,
      preferences: {
        allowPlaceholdersInF3: existingMeta.allowPlaceholdersInF3 === true,
        seo: readSeoPreferencesFromMeta(existingMeta),
      },
    });
  } catch (error) {
    console.error("[API] /api/projects/[id]/preferences PATCH failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, routeContext: RouteParams) {
  return withRateLimit(request, "preferences:get", () =>
    handleGET(request, routeContext),
  );
}

async function handleGET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const data = await getProjectData(id);
    const meta = asRecord(data?.meta);
    return NextResponse.json({
      success: true,
      preferences: {
        allowPlaceholdersInF3: meta.allowPlaceholdersInF3 === true,
        // Defaults kept centralized in the schema module so future fields
        // get a single source of truth.
        seo: data ? readSeoPreferencesFromMeta(meta) : { ...SEO_PREFERENCES_DEFAULTS },
      },
    });
  } catch (error) {
    console.error("[API] /api/projects/[id]/preferences GET failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
