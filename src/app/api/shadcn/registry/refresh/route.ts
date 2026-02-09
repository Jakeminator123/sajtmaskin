import { NextResponse } from "next/server";
import { getDefaultRegistryScopes, refreshRegistryCache } from "@/lib/shadcn-registry-cache";
import { getRegistryBaseUrl } from "@/lib/v0/v0-url-parser";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const headerSecret = req.headers.get("x-cron-secret") || "";
  return bearer === secret || headerSecret === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const style = searchParams.get("style")?.trim() || undefined;
  const sourceParam = searchParams.get("source")?.trim() || undefined;
  const baseUrl = process.env.REGISTRY_BASE_URL?.trim() || getRegistryBaseUrl();

  const scopes = getDefaultRegistryScopes().filter((scope) =>
    sourceParam ? scope.source === sourceParam : true,
  );

  const refreshed = await Promise.all(
    scopes.map((scope) =>
      refreshRegistryCache({
        baseUrl,
        source: scope.source,
        style: style || scope.style,
      }),
    ),
  );

  return NextResponse.json({
    ok: true,
    refreshed: refreshed.map((entry) => ({
      source: entry.scope.source,
      baseUrl: entry.scope.baseUrl,
      style: entry.scope.style,
      fetchedAt: entry.fetchedAt,
      items: entry.index.items.length,
    })),
  });
}
