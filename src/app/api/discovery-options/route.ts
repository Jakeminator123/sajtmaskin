import { NextResponse } from "next/server";

import { fallbackDiscoveryOptions } from "@viewser/components/discovery-wizard/discovery-options";

/**
 * Native discovery taxonomy for the ported wizard.
 *
 * The wizard merges this with its own client-side fallback, so it stays
 * functional even if this 404s — this route simply serves the canonical
 * option set from the ported taxonomy (no Python/governance-file dependency).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ options: fallbackDiscoveryOptions() });
}
