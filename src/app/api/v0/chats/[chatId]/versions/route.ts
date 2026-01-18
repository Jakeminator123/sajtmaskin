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
    if (!dbChat) {
      return NextResponse.json({ versions: [] });
    }

    const dbVersions = await db
      .select()
      .from(versions)
      .where(eq(versions.chatId, dbChat.id))
      .orderBy(desc(versions.createdAt));

    const versionsList = dbVersions.map((v) => ({
      versionId: v.v0VersionId,
      id: v.id,
      messageId: v.v0MessageId,
      demoUrl: v.demoUrl,
      metadata: v.metadata,
      createdAt: v.createdAt,
    }));

    return NextResponse.json({ versions: versionsList });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
