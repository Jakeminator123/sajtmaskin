import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { listServerPostcheckCandidates } from "@/lib/db/chat-repository-pg";
import { runVersionPostchecks } from "@/lib/gen/verify/server-verify";

// Unscheduled local declaration, not evidence of deployed platform capacity.
export const maxDuration = 950;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // This opt-in permits recovery work; it neither creates a schedule nor affects generation.
  if (process.env.SAJTMASKIN_POSTCHECKS_SCHEDULE_ENABLED !== "1") {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  const deadlineEpochMs = Date.now() + maxDuration * 1000 - 20_000;
  try {
    const candidates = await listServerPostcheckCandidates(2, deadlineEpochMs);
    const results = [];
    for (const candidate of candidates.slice(0, 2)) {
      if (Date.now() >= deadlineEpochMs) break;
      const outcome = await runVersionPostchecks({ ...candidate, entry: "resume", deadlineEpochMs });
      results.push({ versionId: candidate.versionId, outcome });
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("[postchecks cron] selection failed", error);
    return NextResponse.json({ error: "Postchecks unavailable" }, { status: 503 });
  }
}
