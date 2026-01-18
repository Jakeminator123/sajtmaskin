import { assertV0Key, v0 } from '@/lib/v0';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatByV0ChatIdForRequest } from '@/lib/tenant';

const updateFilesSchema = z.object({
  versionId: z.string().min(1, 'Version ID is required'),
  files: z
    .array(
      z.object({
        name: z.string().min(1, 'File name is required'),
        content: z.string(),
        locked: z.boolean().optional(),
      })
    )
    .min(1, 'At least one file is required'),
});

export async function GET(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;
    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    const { searchParams } = new URL(req.url);
    const requestedVersionId = searchParams.get('versionId');

    const chat = await v0.chats.getById({ chatId });

    const versionIdToFetch = requestedVersionId || (chat as any).latestVersion?.id || null;

    if (!versionIdToFetch) {
      return NextResponse.json({ error: 'No version found for this chat' }, { status: 404 });
    }

    const version = await v0.chats.getVersion({
      chatId,
      versionId: versionIdToFetch,
      includeDefaultFiles: true,
    });

    return NextResponse.json({
      versionId: (version as any).id,
      files: (version as any).files || [],
    });
  } catch (err) {
    console.error('Error fetching files:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch files' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;
    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    const body = await req.json();

    const validationResult = updateFilesSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { versionId, files } = validationResult.data;

    const updatedVersion = await v0.chats.updateVersion({
      chatId,
      versionId,
      files,
    });

    return NextResponse.json({
      success: true,
      versionId: (updatedVersion as any).id,
      files: (updatedVersion as any).files,
      demoUrl: (updatedVersion as any).demoUrl,
    });
  } catch (err) {
    console.error('Error updating files:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update files' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;
    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    const body = await req.json();

    const singleFileSchema = z.object({
      versionId: z.string().min(1),
      fileName: z.string().min(1),
      content: z.string(),
      locked: z.boolean().optional(),
    });

    const validationResult = singleFileSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { versionId, fileName, content, locked } = validationResult.data;

    const currentVersion = await v0.chats.getVersion({
      chatId,
      versionId,
      includeDefaultFiles: true,
    });

    const updatedFiles = ((currentVersion as any).files || []).map((file: any) => {
      if (file.name === fileName) {
        return {
          name: fileName,
          content,
          locked: locked ?? file.locked,
        };
      }
      return {
        name: file.name,
        content: file.content,
        locked: file.locked,
      };
    });

    if (!updatedFiles.some((f: any) => f.name === fileName)) {
      updatedFiles.push({
        name: fileName,
        content,
        locked: locked ?? false,
      });
    }

    const updatedVersion = await v0.chats.updateVersion({
      chatId,
      versionId,
      files: updatedFiles,
    });

    return NextResponse.json({
      success: true,
      versionId: (updatedVersion as any).id,
      file: (updatedVersion as any).files?.find((f: any) => f.name === fileName),
      demoUrl: (updatedVersion as any).demoUrl,
    });
  } catch (err) {
    console.error('Error updating file:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update file' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();
    const { chatId } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId');
    const fileName = searchParams.get('fileName');

    if (!versionId || !fileName) {
      return NextResponse.json(
        { error: 'versionId and fileName are required query parameters' },
        { status: 400 }
      );
    }

    const currentVersion = await v0.chats.getVersion({
      chatId,
      versionId,
      includeDefaultFiles: true,
    });

    const updatedFiles = ((currentVersion as any).files || [])
      .filter((file: any) => file.name !== fileName)
      .map((file: any) => ({
        name: file.name,
        content: file.content,
        locked: file.locked,
      }));

    const updatedVersion = await v0.chats.updateVersion({
      chatId,
      versionId,
      files: updatedFiles,
    });

    return NextResponse.json({
      success: true,
      deleted: fileName,
      versionId: (updatedVersion as any).id,
      remainingFiles: (updatedVersion as any).files?.length ?? 0,
    });
  } catch (err) {
    console.error('Error deleting file:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete file' },
      { status: 500 }
    );
  }
}
