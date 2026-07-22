import { NextResponse } from "next/server";
import {
  buildRegistryIndex,
  buildRegistryItem,
} from "@/lib/sajtmaskin-registry/registry";

/**
 * @sajtmaskin registry endpoint (shadcn-compatible):
 *
 *   GET /r/registry.json  → registry index (required by the shadcn CLI/MCP)
 *   GET /r/{name}.json    → registry item with inlined file content
 *
 * Static JSON built from committed files under `src/lib/sajtmaskin-registry/`
 * — no DB, no external fetch. Registered in `components.json` as
 * `"@sajtmaskin": "https://sajtmaskin.vercel.app/r/{name}.json"`.
 */

export const runtime = "nodejs";
// Content only changes with deploys; cache and revalidate hourly.
export const revalidate = 3600;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!name.endsWith(".json")) {
    return NextResponse.json(
      { error: "Registry paths end in .json (e.g. /r/registry.json)" },
      { status: 404 },
    );
  }
  const itemName = name.slice(0, -".json".length);
  if (itemName === "registry") {
    return NextResponse.json(buildRegistryIndex());
  }
  const item = buildRegistryItem(itemName);
  if (!item) {
    return NextResponse.json(
      { error: `Unknown registry item: ${itemName}` },
      { status: 404 },
    );
  }
  return NextResponse.json(item);
}
