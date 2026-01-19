import { NextResponse } from 'next/server';
import { assertV0Key, v0 } from '@/lib/v0';
import { sendMessageSchema } from '@/lib/validations/chatSchemas';
import { db } from '@/lib/db/client';
import { versions } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { withRateLimit } from '@/lib/rateLimit';
import { getChatByV0ChatIdForRequest } from '@/lib/tenant';

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, 'message:send', async () => {
    try {
      assertV0Key();

      const { chatId } = await ctx.params;
      const body = await req.json().catch(() => ({}));

      const validationResult = sendMessageSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const { message, attachments } = validationResult.data;

      const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
      if (!dbChat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      const result = await v0.chats.sendMessage({
        chatId,
        message,
        attachments,
      });

      const messageResult = result as any;
      const actualMessageId =
        messageResult.messageId ||
        messageResult.message?.id ||
        messageResult.latestVersion?.messageId ||
        null;
      const versionId = messageResult.versionId || messageResult.latestVersion?.id || null;
      const demoUrl =
        messageResult.demoUrl ||
        messageResult.demo_url ||
        messageResult.latestVersion?.demoUrl ||
        null;

      let savedVersionId: string | null = null;
      try {
        if (versionId) {
          savedVersionId = nanoid();
          await db.insert(versions).values({
            id: savedVersionId,
            chatId: dbChat.id,
            v0VersionId: versionId,
            v0MessageId: actualMessageId,
            demoUrl,
            metadata: messageResult,
          });
        }
      } catch (dbError) {
        console.error('Failed to save version to database:', dbError);
      }

      return NextResponse.json({
        ...result,
        savedVersionId,
        messageId: actualMessageId,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      );
    }
  });
}
