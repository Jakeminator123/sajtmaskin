import { NextResponse } from "next/server";
import { isInspectBridgeEnabled } from "@/lib/builder/inspect-bridge-feature";
import { INSPECT_BRIDGE_SCRIPT } from "@/lib/builder/inspect-bridge-script";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * Serverar inspector-bridge-scriptet (single source of truth) som laddas in i
 * preview-sidan via `<script src>`. 404 när flaggan är av → fullt reversibelt.
 */
export async function GET() {
  if (!isInspectBridgeEnabled()) {
    return new NextResponse("Inspect bridge disabled", { status: 404 });
  }
  return new NextResponse(INSPECT_BRIDGE_SCRIPT, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
