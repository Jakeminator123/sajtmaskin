import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { withRateLimit } from "@/lib/rate-limit";
import { listServerPostcheckCandidates } from "@/lib/db/chat-repository-pg";
import { runVersionPostchecks } from "@/lib/gen/verify/server-verify";

export const maxDuration = 300;
const bodySchema = z.object({ versionId: z.string().trim().min(1).max(200) }).strict();

/** The browser only wakes the existing server owner; it supplies no repair authority. */
export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const deadlineEpochMs = Date.now() + (maxDuration - 20) * 1000;
  return withRateLimit(req, "engine:postchecks", async () => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { chatId } = await ctx.params;
    const versionId = parsed.data.versionId;
    try {
      if (!(await getEngineVersionForChatByIdForRequest(req, chatId, versionId))) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      // Scope BEFORE pagination: this request cannot select another tenant's work.
      const candidates = await listServerPostcheckCandidates(1, deadlineEpochMs, { chatId, versionId });
      if (Date.now() >= deadlineEpochMs || !candidates.some(c => c.chatId === chatId && c.versionId === versionId)) {
        return NextResponse.json({ accepted: false });
      }
      after(async () => {
        try {
          // Revalidates latest version, leases, stored policy, age, backoff and paid budget.
          await runVersionPostchecks({ chatId, versionId, entry: "resume", deadlineEpochMs });
        } catch (error) {
          console.error("[postchecks recovery]", error);
        }
      });
      return NextResponse.json({ accepted: true }, { status: 202 });
    } catch {
      return NextResponse.json({ error: "Postchecks unavailable" }, { status: 503 });
    }
  }, { failClosedOnTimeout: true });
}
