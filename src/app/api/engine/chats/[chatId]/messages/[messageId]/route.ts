import { NextResponse } from "next/server";
import { getEngineChatByIdForRequest } from "@/lib/tenant";

const MAX_ENGINE_RESOURCE_ID_CHARS = 200;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const { chatId, messageId } = await ctx.params;

    if (
      !chatId ||
      chatId.length > MAX_ENGINE_RESOURCE_ID_CHARS ||
      !messageId ||
      messageId.length > MAX_ENGINE_RESOURCE_ID_CHARS
    ) {
      return NextResponse.json({ error: "Invalid resource ID" }, { status: 400 });
    }

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
    console.error("[API/engine/chats/:chatId/messages/:messageId] Failed to load message:", err);
    return NextResponse.json({ error: "Failed to load message" }, { status: 500 });
  }
}
