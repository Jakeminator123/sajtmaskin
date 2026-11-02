import { NextResponse } from "next/server";
import { z } from "zod";
import { OPENCLAW } from "@/lib/config";
import { withRateLimit } from "@/lib/rate-limit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  readLiveReviewGrantState,
  writeLiveReviewGrant,
} from "@/lib/db/services/live-review-grants";
import { sanitizeOpenClawPowerIds } from "@/lib/openclaw/powers";

export const runtime = "nodejs";

const bodySchema = z.object({
  chatId: z.string().min(1).max(200),
  powersOn: z.boolean(),
  granted: z.array(z.string().max(100)).max(20).optional(),
});

async function scopedChat(req: Request, chatId: string) {
  return getEngineChatByIdForRequest(req, chatId).catch(() => null);
}

export async function GET(req: Request) {
  return withRateLimit(req, "openclaw:powers", async () => {
    const chatId = new URL(req.url).searchParams.get("chatId")?.trim() ?? "";
    if (!chatId || chatId.length > 200) {
      return NextResponse.json({ error: "chatId required" }, { status: 400 });
    }
    const chat = await scopedChat(req, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const state = await readLiveReviewGrantState(chatId);
    // Ett läsfel får inte se ut som «ingen grant»: klienten skulle då skriva
    // standardbefogenheterna över ett uttryckligt av-val. 503 → klienten
    // behåller sitt lokala läge och försöker inte persistera något.
    if (state.status === "error") {
      return NextResponse.json({ error: "grant_unavailable" }, { status: 503 });
    }
    const grant = state.status === "present" ? state.grant : { powersOn: false, granted: [] };
    return NextResponse.json({
      powersOn: OPENCLAW.editEnabled && grant.powersOn,
      granted: OPENCLAW.editEnabled ? grant.granted : [],
      // Skiljer «ingen grant finns» från «grant uttryckligen av» så klienten
      // kan ge en ny builderchatt standardbefogenheterna utan att återställa
      // ett val användaren redan gjort (`OPENCLAW_BUILDER_DEFAULT_POWERS`).
      persisted: state.status === "present",
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
