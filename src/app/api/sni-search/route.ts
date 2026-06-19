import { NextResponse } from "next/server";

/**
 * SNI 2025 search for the wizard industry typeahead (ADR 0045 in the source
 * repo). The full SNI mirror (~1,882 labels + industry-profiles) is not ported
 * yet, so this returns an empty match set — the typeahead degrades gracefully
 * to its ported profession + category index. Wire to a native SNI dataset
 * later to restore the enrichment layer.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ matches: [] });
}
