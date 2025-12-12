import { NextResponse } from "next/server";

/**
 * Some browsers request /favicon.ico even if an icon is declared in metadata.
 * We don't keep a binary .ico in the repo, so we redirect to the SVG icon.
 */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/icon.svg", request.url), 302);
}


