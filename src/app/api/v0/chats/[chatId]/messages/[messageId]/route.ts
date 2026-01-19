import { NextResponse } from 'next/server';
import { assertV0Key, v0 } from '@/lib/v0';
import { getChatByV0ChatIdForRequest } from '@/lib/tenant';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ chatId: string; messageId: string }> }
) {
  try {
    assertV0Key();

    const { chatId, messageId } = await ctx.params;

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const result = await v0.chats.getMessage({
      chatId,
      messageId,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
