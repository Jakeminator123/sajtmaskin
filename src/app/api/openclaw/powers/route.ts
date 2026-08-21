import { NextResponse } from "next/server";
import { z } from "zod";
import { OPENCLAW } from "@/lib/config";
import { withRateLimit } from "@/lib/rate-limit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  readLiveReviewGrant,
  writeLiveReviewGrant,
} from "@/lib/db/services/live-review-grants";
import { sanitizeOpenClawPowerIds } from "@/lib/openclaw/powers";

export const runtime = "nodejs";

const bodySchema = z.object({
  chatId: z.string().min(1),
  powersOn: z.boolean(),
  granted: z.array(z.unknown()).optional(),
});

async function scopedChat(req: Request, chatId: string) {
  return getEngineChatByIdForRequest(req, chatId).catch(() => null);
}

export async function GET(req: Request) {
  return withRateLimit(req, "openclaw:powers", async () => {
    const chatId = new URL(req.url).searchParams.get("chatId")?.trim() ?? "";
    if (!chatId) {
      return NextResponse.json({ error: "chatId required" }, { status: 400 });
    }
    const chat = await scopedChat(req, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const grant = (await readLiveReviewGrant(chatId)) ?? { powersOn: false, granted: [] };
    return NextResponse.json({
      powersOn: OPENCLAW.editEnabled && grant.powersOn,
      granted: OPENCLAW.editEnabled ? grant.granted : [],
    });
  });
}

export async function POST(req: Request) {
  return withRateLimit(req, "openclaw:powers", async () => {
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const chat = await scopedChat(req, parsed.data.chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const granted = OPENCLAW.editEnabled
      ? sanitizeOpenClawPowerIds(parsed.data.granted)
      : [];
    const powersOn = OPENCLAW.editEnabled && parsed.data.powersOn && granted.length > 0
      ? true
      : OPENCLAW.editEnabled && parsed.data.powersOn;
    const saved = await writeLiveReviewGrant({
      chatId: parsed.data.chatId,
      powersOn,
      granted,
    });
    if (!saved) {
      return NextResponse.json({ error: "Grant persist failed" }, { status: 500 });
    }
    return NextResponse.json(saved);
  });
}
