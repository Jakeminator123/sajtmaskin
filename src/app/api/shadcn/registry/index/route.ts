import { NextResponse } from "next/server";
import { getRegistryIndexWithCache } from "@/lib/shadcn-registry-cache";
import { getRegistryBaseUrl } from "@/lib/v0/v0-url-parser";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const style = searchParams.get("style")?.trim() || undefined;
  const source = (searchParams.get("source")?.trim() || "official") as
    | "official"
    | "legacy";
  const force = searchParams.get("force") === "1";

  try {
    const baseUrl = process.env.REGISTRY_BASE_URL?.trim() || getRegistryBaseUrl();
    const cache = await getRegistryIndexWithCache(
      { baseUrl, style, source },
      { force },
    );
    return NextResponse.json(cache.index);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Registry request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
