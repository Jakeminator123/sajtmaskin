import { NextResponse } from 'next/server';
import { assertV0Key } from '@/lib/v0';
import { db } from '@/lib/db/client';
import { versions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getChatByV0ChatIdForRequest } from '@/lib/tenant';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> }
) {
  try {
    assertV0Key();

    const { chatId } = await ctx.params;

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);

    if (dbChat) {
      const latestVersion = await db
        .select()
        .from(versions)
        .where(eq(versions.chatId, dbChat.id))
        .orderBy(desc(versions.createdAt))
        .limit(1);

      const latestDemoUrl = latestVersion.length > 0 ? latestVersion[0].demoUrl : null;

      return NextResponse.json({
        chatId,
        id: dbChat.id,
        v0ChatId: dbChat.v0ChatId,
        v0ProjectId: dbChat.v0ProjectId,
        webUrl: dbChat.webUrl,
        createdAt: dbChat.createdAt,
        updatedAt: dbChat.updatedAt,
        latestVersion:
          latestVersion.length > 0
            ? {
                versionId: latestVersion[0].v0VersionId,
                messageId: latestVersion[0].v0MessageId,
                demoUrl: latestVersion[0].demoUrl,
                createdAt: latestVersion[0].createdAt,
              }
            : null,
        demoUrl: latestDemoUrl,
      });
    }

    return NextResponse.json({
      chatId,
      message: 'Chat not found in database. It may need to be created first.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
