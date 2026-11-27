import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hasVideoGenerationStorage } from "@/lib/db/services/media";
import { getVideoGenerationCredentials } from "@/lib/media/video-generation-provider";
import { advanceVideoGeneration } from "@/lib/media/video-generation-runner";
import { listDueVideoGenerationIds } from "@/lib/media/video-generation-store";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + (secret ?? ""));
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const available = getVideoGenerationCredentials() || await hasVideoGenerationStorage();
    const ids = available ? await listDueVideoGenerationIds(6) : [];
    const results = await Promise.allSettled(ids.map((id) => advanceVideoGeneration(id)));
    const errors = results.filter((result) => result.status === "rejected").length;
    if (errors) console.error("[VideoGeneration] Reconcile step(s) failed:", errors);
    return NextResponse.json({ checked: ids.length, errors }, { status: errors ? 503 : 200 });
  } catch {
    console.error("[VideoGeneration] Reconcile unavailable");
    return NextResponse.json({ error: "Reconcile unavailable" }, { status: 503 });
  }
}
