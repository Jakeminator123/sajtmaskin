import { NextResponse } from "next/server";
import { buildCommunityRegistryRequest } from "@/lib/shadcn/community-registry-fetch";
import { isUsableRegistryItem } from "@/lib/shadcn/registry-service";
import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import { SHADCNBLOCKS_NAMESPACE } from "@/lib/shadcn/community-registry-index";

export const runtime = "nodejs";
export const revalidate = 300;

const ITEM_TIMEOUT_MS = 8_000;

const NAMESPACE_URL_TEMPLATES: Record<string, string> = {
  [SHADCNBLOCKS_NAMESPACE]: "https://www.shadcnblocks.com/r/{name}.json",
};

/**
 * GET /api/shadcn/community/item?registry=@shadcnblocks&name=hero1
 *
 * Proxies a community registry item. Uses SHADCNBLOCKS_API_KEY Bearer when set
 * (via community-registry-fetch). Never echoes the key in error bodies.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const registry = searchParams.get("registry")?.trim() || SHADCNBLOCKS_NAMESPACE;
  const name = searchParams.get("name")?.trim();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const urlTemplate = NAMESPACE_URL_TEMPLATES[registry];
  if (!urlTemplate) {
    return NextResponse.json(
      { error: `Unsupported community registry: ${registry}` },
      { status: 400 },
    );
  }

  const url = urlTemplate.replace("{name}", encodeURIComponent(name));
  const request = buildCommunityRegistryRequest(url, {
    signal: AbortSignal.timeout(ITEM_TIMEOUT_MS),
  });

  let response: Response;
  try {
    response = await fetch(request.url, request.init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return NextResponse.json(
      { error: `Community registry fetch failed: ${msg}` },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Community registry request failed", status: response.status },
      { status: response.status },
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Community registry returned non-JSON response" },
      { status: 502 },
    );
  }

  const item = data as ShadcnRegistryItem;
  if (!isUsableRegistryItem(item)) {
    return NextResponse.json(
      { error: "Community registry item is empty or unusable" },
      { status: 502 },
    );
  }

  return NextResponse.json(item);
}
