import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { deployments, versions } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod/v4';
import { withRateLimit } from '@/lib/rateLimit';
import { assertV0Key, v0 } from '@/lib/v0';
import { createDeploymentRecord, updateDeploymentStatus } from '@/lib/deployment';
import { materializeImagesInTextFiles, type ImageAssetStrategy } from '@/lib/imageAssets';
import {
  createVercelDeployment,
  getVercelDeployment,
  mapVercelReadyStateToStatus,
  sanitizeVercelProjectName,
  toVercelFilesFromTextFiles,
} from '@/lib/vercelDeploy';
import { getChatByIdForRequest, getChatByV0ChatIdForRequest } from '@/lib/tenant';
import { requireNotBot } from '@/lib/botProtection';
import { devLogAppend } from '@/lib/devLog';

export const runtime = 'nodejs';

function applyPreDeployFixes(files: Array<{ name: string; content: string }>): {
  files: Array<{ name: string; content: string }>;
  fixesApplied: string[];
} {
  const fixesApplied: string[] = [];
  const nextFiles = files.map((f) => ({ ...f }));

  const removeBrokenUtilityBlocks = (content: string) => {
    if (!content.includes('@utility')) {
      return { content, removed: 0 };
    }

    const marker = '@utility';
    let updated = content;
    let removed = 0;
    let index = 0;

    while (index < updated.length) {
      const start = updated.indexOf(marker, index);
      if (start === -1) break;

      const lineEnd = updated.indexOf('\n', start);
      const head = updated.slice(start, lineEnd === -1 ? updated.length : lineEnd);
      if (!head.includes('slide-in-from-top-')) {
        index = start + marker.length;
        continue;
      }

      const braceIndex = updated.indexOf('{', start);
      if (braceIndex === -1) {
        index = start + marker.length;
        continue;
      }

      let depth = 1;
      let cursor = braceIndex + 1;
      while (cursor < updated.length) {
        const ch = updated[cursor];
        if (ch === '{') depth += 1;
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        cursor += 1;
      }

      if (depth === 0) {
        index = cursor + 1;
        continue;
      }

      // Missing closing brace: remove the broken utility block (best-effort).
      const nextUtility = updated.indexOf(marker, start + marker.length);
      const cutEnd = nextUtility === -1 ? updated.length : nextUtility;
      updated = `${updated.slice(0, start)}${updated.slice(cutEnd)}`;
      removed += 1;
      index = start;
    }

    return { content: updated, removed };
  };

  for (const f of nextFiles) {
    if (typeof f.content !== 'string') continue;

    if (f.content.includes('Instrument_Serif') && f.content.includes('weight')) {
      const before = f.content;

      let updated = before
        .replace(/weight:\s*\[\s*"400"\s*,\s*"600"\s*\]/g, 'weight: ["400"]')
        .replace(/weight:\s*\[\s*'400'\s*,\s*'600'\s*\]/g, "weight: ['400']");

      if (updated === before) {
        updated = updated.replace(
          /(Instrument_Serif\(\{[\s\S]*?weight:\s*)\[([^\]]*)\]/g,
          (match, prefix, arr) => {
            const parts = String(arr)
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean);

            const filtered = parts.filter((p) => !/^(['"])600\1$/.test(p));
            if (filtered.length === parts.length) return match;
            const nextArr = `[${filtered.join(', ')}]`;
            return `${prefix}${nextArr}`;
          }
        );
      }

      if (updated !== before) {
        f.content = updated;
        fixesApplied.push(`Fixed Instrument_Serif invalid weight in ${f.name}`);
      }
    }

    if (f.name.endsWith('.css') && f.content.includes('@utility')) {
      const result = removeBrokenUtilityBlocks(f.content);
      if (result.removed > 0 && result.content !== f.content) {
        f.content = result.content;
        fixesApplied.push(
          `Removed ${result.removed} broken @utility block${result.removed > 1 ? 's' : ''} in ${f.name}`
        );
      }
    }
  }

  return { files: nextFiles, fixesApplied };
}

const createDeploymentSchema = z.object({
  chatId: z.string().min(1, 'chatId is required'),
  versionId: z.string().min(1, 'versionId is required'),
  projectName: z.string().optional(),
  target: z.enum(['production', 'preview']).optional(),
  imageStrategy: z.enum(['external', 'blob']).optional(),
  projectId: z.string().optional(),
});

export async function POST(req: Request) {
  return withRateLimit(req, 'deployment:create', async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      assertV0Key();

      const body = await req.json().catch(() => ({}));
      const validationResult = createDeploymentSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const { chatId, versionId, projectName, target, imageStrategy } = validationResult.data;
      const resolvedImageStrategy: ImageAssetStrategy =
        imageStrategy ?? (process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'external');

      let chat = await getChatByV0ChatIdForRequest(req, chatId);
      if (!chat) chat = await getChatByIdForRequest(req, chatId);

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      const internalChatId = chat.id;
      const v0ChatId = chat.v0ChatId;

      let version = await db
        .select()
        .from(versions)
        .where(and(eq(versions.chatId, internalChatId), eq(versions.id, versionId)))
        .limit(1);

      if (version.length === 0) {
        version = await db
          .select()
          .from(versions)
          .where(and(eq(versions.chatId, internalChatId), eq(versions.v0VersionId, versionId)))
          .limit(1);
      }

      if (version.length === 0) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }

      const internalVersionId = version[0].id;
      const v0VersionId = version[0].v0VersionId;

      devLogAppend('latest', {
        type: 'site.deploy.start',
        requestedChatId: chatId,
        internalChatId,
        v0ChatId,
        requestedVersionId: versionId,
        internalVersionId,
        v0VersionId,
        target: target || 'production',
        imageStrategy: resolvedImageStrategy,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[dev-log] deploy started', {
          v0ChatId,
          v0VersionId,
          target: target || 'production',
        });
      }

      const deploymentId = await createDeploymentRecord({
        chatId: internalChatId,
        versionId: internalVersionId,
      });

      try {
        const v0Version = await v0.chats.getVersion({
          chatId: v0ChatId,
          versionId: v0VersionId,
          includeDefaultFiles: true,
        });

        const rawFiles = Array.isArray((v0Version as any)?.files) ? (v0Version as any).files : [];
        const textFiles = rawFiles
          .filter((f: any) => f && typeof f.name === 'string' && typeof f.content === 'string')
          .map((f: any) => ({ name: f.name, content: f.content }));

        if (textFiles.length === 0) {
          await updateDeploymentStatus(deploymentId, 'error');
          return NextResponse.json(
            { error: 'No files returned from v0 for this version' },
            { status: 500 }
          );
        }

        const vercelProjectName = sanitizeVercelProjectName(projectName || `sajtmaskin-${v0ChatId}`);

        const { files: fixedFiles, fixesApplied } = applyPreDeployFixes(textFiles);
        if (fixesApplied.length > 0) {
          console.log('[deploy] applied fixes:', fixesApplied);
        }

        const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
        const imageAssets = await materializeImagesInTextFiles({
          files: fixedFiles,
          strategy: resolvedImageStrategy,
          blobToken,
          namespace: { chatId: v0ChatId, versionId: v0VersionId },
        });

        if (imageAssets.warnings.length > 0) {
          console.log('[deploy] image assets warnings:', imageAssets.warnings.slice(0, 5));
        }

        const vercelFiles = toVercelFilesFromTextFiles(imageAssets.files);

        const created = await createVercelDeployment({
          projectName: vercelProjectName,
          target: target || 'production',
          files: vercelFiles,
        });

        const mapped = mapVercelReadyStateToStatus(created.readyState);
        await updateDeploymentStatus(deploymentId, mapped.status, {
          vercelDeploymentId: created.vercelDeploymentId,
          vercelProjectId: created.vercelProjectId ?? undefined,
          url: created.url ?? undefined,
          inspectorUrl: created.inspectorUrl ?? undefined,
        });

        devLogAppend('latest', {
          type: 'site.deploy.done',
          internalChatId,
          v0ChatId,
          internalVersionId,
          v0VersionId,
          deploymentId,
          status: mapped.status,
          readyState: created.readyState,
          url: created.url ?? null,
          inspectorUrl: created.inspectorUrl ?? null,
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('[dev-log] deploy finished', {
            v0ChatId,
            v0VersionId,
            url: created.url ?? null,
          });
        }

        return NextResponse.json({
          id: deploymentId,
          chatId: internalChatId,
          versionId: internalVersionId,
          status: mapped.status,
          vercelDeploymentId: created.vercelDeploymentId,
          vercelProjectId: created.vercelProjectId,
          url: created.url,
          inspectorUrl: created.inspectorUrl,
          readyState: created.readyState,
          fixesApplied,
          imageStrategyRequested: imageStrategy ?? null,
          imageStrategyUsed: imageAssets.strategyUsed,
          imageAssetsSummary: imageAssets.summary,
          imageAssetsWarnings: imageAssets.warnings,
        });
      } catch (deployErr) {
        await updateDeploymentStatus(deploymentId, 'error');
        throw deployErr;
      }
    } catch (err) {
      console.error('Deployment error:', err);
      devLogAppend('latest', {
        type: 'site.deploy.error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      );
    }
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId query parameter is required' },
        { status: 400 }
      );
    }

    let chat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!chat) chat = await getChatByIdForRequest(req, chatId);

    if (!chat) {
      return NextResponse.json({ deployments: [] });
    }

    const internalChatId = chat.id;

    const result = await db
      .select()
      .from(deployments)
      .where(eq(deployments.chatId, internalChatId))
      .orderBy(desc(deployments.createdAt));

    const latestRefreshCandidate = result.find((d) => {
      const status = String(d.status || 'pending');
      const isTerminal = status === 'ready' || status === 'error' || status === 'cancelled';
      return Boolean(d.vercelDeploymentId) && !isTerminal;
    });

    if (latestRefreshCandidate?.vercelDeploymentId) {
      try {
        const vercel = await getVercelDeployment(latestRefreshCandidate.vercelDeploymentId);
        const mapped = mapVercelReadyStateToStatus(vercel.readyState);

        await updateDeploymentStatus(latestRefreshCandidate.id, mapped.status, {
          url: vercel.url ?? undefined,
          inspectorUrl: vercel.inspectorUrl ?? undefined,
          vercelProjectId: vercel.vercelProjectId ?? undefined,
        });

        latestRefreshCandidate.status = mapped.status as any;
        if (vercel.url) latestRefreshCandidate.url = vercel.url as any;
        if (vercel.inspectorUrl) latestRefreshCandidate.inspectorUrl = vercel.inspectorUrl as any;
        if (vercel.vercelProjectId) latestRefreshCandidate.vercelProjectId = vercel.vercelProjectId as any;
      } catch (err) {
        console.error('Failed to refresh latest deployment in list:', err);
      }
    }

    return NextResponse.json({
      deployments: result.map((d) => ({
        id: d.id,
        chatId: d.chatId,
        versionId: d.versionId,
        status: d.status,
        url: d.url,
        inspectorUrl: d.inspectorUrl,
        vercelDeploymentId: d.vercelDeploymentId,
        vercelProjectId: d.vercelProjectId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (err) {
    console.error('Get deployments error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
