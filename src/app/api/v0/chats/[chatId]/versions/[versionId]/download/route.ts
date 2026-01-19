import { NextResponse } from 'next/server';
import { assertV0Key, v0 } from '@/lib/v0';
import { db } from '@/lib/db/client';
import { versions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getChatByV0ChatIdForRequest } from '@/lib/tenant';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ chatId: string; versionId: string }> }
) {
  try {
    assertV0Key();

    const { chatId, versionId } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'zip';
    const includeDefaultFiles = searchParams.get('includeDefaultFiles') !== 'false';

    const chat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    let version = await db
      .select()
      .from(versions)
      .where(and(eq(versions.chatId, chat.id), eq(versions.id, versionId)))
      .limit(1);

    if (version.length === 0) {
      version = await db
        .select()
        .from(versions)
        .where(and(eq(versions.chatId, chat.id), eq(versions.v0VersionId, versionId)))
        .limit(1);
    }

    if (version.length === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    try {
      const downloadFormat = format === 'tar' ? 'tarball' : 'zip';
      const downloadResult = await v0.chats.downloadVersion({
        chatId,
        versionId: version[0].v0VersionId,
        format: downloadFormat as 'zip' | 'tarball',
        includeDefaultFiles,
      });

      if (typeof downloadResult === 'string') {
        return NextResponse.redirect(downloadResult);
      }

      const contentType = format === 'zip' ? 'application/zip' : 'application/x-tar';
      const filename = `version-${versionId.slice(0, 8)}.${format}`;

      return new Response(downloadResult as any, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (apiError: any) {
      console.error('v0 download error:', apiError);
      return NextResponse.json(
        { error: 'Failed to download version', details: apiError.message },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error('Download error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
