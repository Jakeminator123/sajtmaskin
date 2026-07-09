import { draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Exits draft mode and redirects home. `next-sanity/draft-mode` only exports
 * `defineEnableDraftMode` — there is no ready-made disable helper — so this
 * is the standard manual pattern from the Sanity docs, not a paraphrase of a
 * missing SDK export.
 */
export async function GET(request: NextRequest) {
  (await draftMode()).disable();
  return NextResponse.redirect(new URL("/", request.url));
}
