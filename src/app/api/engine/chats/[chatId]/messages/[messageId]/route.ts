import { NextResponse } from "next/server";
import { getEngineChatByIdForRequest } from "@/lib/tenant";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const { chatId, messageId } = await ctx.params;

    const chat = await getEngineChatByIdForRequest(req, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const message = chat.messages.find((m) => m.id === messageId);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: message.id,
      role: message.role,
      content: message.content,
      uiParts: Array.isArray(message.ui_parts) ? message.ui_parts : undefined,
      tokenCount: message.token_count,
      createdAt: message.created_at,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
