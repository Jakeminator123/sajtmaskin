import { NextResponse, type NextRequest } from "next/server";
import { defineEnableDraftMode } from "next-sanity/draft-mode";

import { isSanityConfigured } from "@/lib/sanity/api";
import { getDraftSanityClient } from "@/lib/sanity/client";
import { isSanityDraftTokenConfigured } from "@/lib/sanity/token";

/**
 * Enables Next.js draft mode for the Sanity Presentation Tool. Configure
 * this route as `previewMode.enable` in `sanity.config.ts` / `sanity/presentation`
 * (Studio lives outside this dossier).
 *
 * The Sanity client is created lazily INSIDE the request handler, after the
 * config guard below — never at module scope — so importing this route
 * cannot crash the build or unrelated routes when Sanity is unconfigured.
 */
export async function GET(request: NextRequest) {
  if (!isSanityConfigured() || !isSanityDraftTokenConfigured()) {
    return NextResponse.json(
      { ok: false, error: "cms-preview-not-configured" },
      { status: 503 },
    );
  }

  const { GET: enableDraftMode } = defineEnableDraftMode({
    client: getDraftSanityClient(),
  });
  return enableDraftMode(request);
}
