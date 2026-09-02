import { NextResponse } from "next/server";
import { getDefaultRegistryScopes, refreshRegistryCache } from "@/lib/shadcn/registry-cache";
import { getRegistryBaseUrl } from "@/lib/shadcn/registry-url";
import { isCronRefreshAuthorized } from "./cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronRefreshAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const style = searchParams.get("style")?.trim() || undefined;
  const sourceParam = searchParams.get("source")?.trim() || undefined;
  const baseUrl = getRegistryBaseUrl();

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
