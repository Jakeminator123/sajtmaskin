import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const redis = Redis.fromEnv();

function normalizeSlug(slug: unknown) {
  if (typeof slug !== "string") return null;
  const value = slug.trim();
  return value.length > 0 ? value : null;
}

async function hashIp(ip: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip),
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Expected application/json" }, { status: 400 });
  }

  const body = await req.json();
  const slug = normalizeSlug(body?.slug);

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "anonymous";
  const hash = await hashIp(ip);

  const dedupeKey = ["pageviews", "dedupe", slug, hash].join(":");
  const countKey = ["pageviews", slug].join(":");

  const isNew = await redis.set(dedupeKey, true, {
    nx: true,
    ex: 60 * 60 * 24,
  });

  if (isNew) {
    await redis.incr(countKey);
  }

  const views = (await redis.get<number>(countKey)) ?? 0;

  return NextResponse.json({ views, deduped: !isNew });
}
