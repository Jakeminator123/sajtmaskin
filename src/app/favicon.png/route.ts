import { NextResponse } from "next/server";

/**
 * Some crawlers request /favicon.png even though the canonical icon is SVG.
 * Redirect instead of 404 so production logs stay clean.
 */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/icon.svg", request.url), 302);
}
