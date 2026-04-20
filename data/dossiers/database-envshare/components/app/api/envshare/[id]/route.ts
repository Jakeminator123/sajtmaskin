import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const redis = Redis.fromEnv();

const createSchema = z.object({
  ciphertext: z.string().min(1),
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 7).optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = createSchema.parse(await request.json());
  const ttl = body.expiresInSeconds ?? 60 * 30;

  await redis.set(`envshare:doc:${params.id}`, body.ciphertext, { ex: ttl });
  await redis.incr("envshare:metrics:writes");

  return NextResponse.json({ ok: true, id: params.id, expiresInSeconds: ttl });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const key = `envshare:doc:${params.id}`;
  const ciphertext = await redis.get<string>(key);

  if (!ciphertext) {
    return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  }

  await redis.incr("envshare:metrics:reads");
  return NextResponse.json({ ciphertext });
}
