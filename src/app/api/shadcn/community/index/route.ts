import { NextResponse } from "next/server";
import {
  queryCommunityRegistryIndex,
  SHADCNBLOCKS_NAMESPACE,
} from "@/lib/shadcn/community-registry-index";

export const runtime = "nodejs";
export const revalidate = 300;

/**
 * GET /api/shadcn/community/index
 *
 * Publikt shadcnblocks-index (ingen nyckel). Query:
 * - namespace (default @shadcnblocks; only that namespace is supported yet)
 * - q, category, limit, cursor
 * - names=hero1,feature1… (featured resolve; skips pagination)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const namespace = (searchParams.get("namespace")?.trim() || SHADCNBLOCKS_NAMESPACE) as string;
  if (namespace !== SHADCNBLOCKS_NAMESPACE) {
    return NextResponse.json(
      { error: `Unsupported community namespace: ${namespace}` },
      { status: 400 },
    );
  }

  const q = searchParams.get("q")?.trim() || undefined;
  const category = searchParams.get("category")?.trim() || undefined;
  const cursor = searchParams.get("cursor")?.trim() || undefined;
  const namesRaw = searchParams.get("names")?.trim();
  const names = namesRaw
    ? namesRaw.split(",").map((part) => part.trim()).filter(Boolean)
    : undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const force = searchParams.get("force") === "1";

  try {
    const page = await queryCommunityRegistryIndex(
      {
        q,
        category,
        cursor,
        names,
        limit: Number.isFinite(limit) ? limit : undefined,
      },
      { force },
    );
    return NextResponse.json(page);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Community registry index failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
