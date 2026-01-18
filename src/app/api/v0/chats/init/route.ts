import { NextResponse } from 'next/server';
import { assertV0Key, v0 } from '@/lib/v0';
import { db } from '@/lib/db/client';
import { chats, versions } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { withRateLimit } from '@/lib/rateLimit';
import { z } from 'zod/v4';
import { ensureProjectForRequest } from '@/lib/tenant';

export const runtime = 'nodejs';

function normalizeGithubRepoUrl(
  inputUrl: string,
  inputBranch?: string
): { repoUrl: string; branch?: string } {
  try {
    const url = new URL(inputUrl);
    const host = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);

    if (host !== 'github.com') {
      return { repoUrl: inputUrl, ...(inputBranch ? { branch: inputBranch } : {}) };
    }

    const owner = parts[0];
    const repoRaw = parts[1];
    if (!owner || !repoRaw) {
      return { repoUrl: inputUrl, ...(inputBranch ? { branch: inputBranch } : {}) };
    }

    const repo = repoRaw.replace(/\.git$/i, '');

    let branch = inputBranch?.trim() || '';
    if (!branch) {
      const treeIdx = parts.indexOf('tree');
      if (treeIdx >= 0 && typeof parts[treeIdx + 1] === 'string') {
        branch = parts[treeIdx + 1];
      }
    }

    const repoUrl = `https://github.com/${owner}/${repo}`;
    return { repoUrl, ...(branch ? { branch } : {}) };
  } catch {
    return { repoUrl: inputUrl, ...(inputBranch ? { branch: inputBranch } : {}) };
  }
}

const initChatSchema = z.object({
  source: z.union([
    z.object({
      type: z.literal('github'),
      url: z.string().url('Invalid GitHub URL'),
      branch: z.string().optional(),
    }),
    z.object({
      type: z.literal('zip'),
      content: z.string().min(1, 'ZIP content is required'),
    }),
  ]),
  message: z.string().optional(),
  projectId: z.string().optional(),
  lockConfigFiles: z.boolean().default(true),
  lockedFiles: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  return withRateLimit(req, 'chat:create', async () => {
    try {
      assertV0Key();

      const body = await req.json().catch(() => ({}));

      const validationResult = initChatSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const { source, message, projectId, lockConfigFiles, lockedFiles } = validationResult.data;

      const configLockedFiles =
        lockedFiles ||
        (lockConfigFiles
          ? [
              'package.json',
              'tsconfig.json',
              'next.config.js',
              'next.config.mjs',
              'tailwind.config.js',
              'tailwind.config.ts',
              '.env',
              '.env.local',
              '.gitignore',
            ]
          : []);
      const lockedSet = new Set(configLockedFiles.map((p) => p.replace(/^\.?\//, '')));

      const initParams: any = {
        ...(projectId ? { projectId } : {}),
        ...(message ? { message } : {}),
      };

      if (source.type === 'github') {
        const normalized = normalizeGithubRepoUrl(source.url, source.branch);
        initParams.type = 'repo';
        initParams.repo = {
          url: normalized.repoUrl,
          ...(normalized.branch ? { branch: normalized.branch } : {}),
        };
      } else {
        initParams.type = 'zip';
        initParams.zip = {
          content: source.content,
        };
      }

      const result = await (v0.chats as any).init(initParams);

      try {
        if (lockConfigFiles) {
          const v0ChatIdCandidate =
            (result && typeof result === 'object' && (result as any).id) ||
            (result && typeof result === 'object' && (result as any).chat?.id) ||
            null;

          if (typeof v0ChatIdCandidate === 'string' && v0ChatIdCandidate.length > 0) {
            const v0Chat = await v0.chats.getById({ chatId: v0ChatIdCandidate });
            const latestVersionId =
              (v0Chat as any)?.latestVersion?.id ||
              (v0Chat as any)?.latestVersion?.versionId ||
              null;

            if (latestVersionId) {
              const version = await v0.chats.getVersion({
                chatId: v0ChatIdCandidate,
                versionId: latestVersionId,
                includeDefaultFiles: true,
              });

              const files = Array.isArray((version as any)?.files) ? (version as any).files : [];
              if (files.length > 0) {
                const updatedFiles = files.map((f: any) => {
                  const rawName = typeof f?.name === 'string' ? f.name : '';
                  const normalized = rawName.replace(/^\.?\//, '');
                  const shouldLock = lockedSet.has(normalized);
                  return {
                    name: rawName,
                    content: typeof f?.content === 'string' ? f.content : '',
                    locked: shouldLock,
                  };
                });

                await v0.chats.updateVersion({
                  chatId: v0ChatIdCandidate,
                  versionId: latestVersionId,
                  files: updatedFiles,
                });
              }
            }
          }
        }
      } catch (lockErr) {
        console.error('Failed to lock config files after init:', lockErr);
      }

      let internalChatId: string | null = null;
      try {
        internalChatId = nanoid();
        const chatResult = 'id' in result ? result : null;
        const v0ProjectId =
          (chatResult && 'projectId' in chatResult ? chatResult.projectId : null) ||
          projectId ||
          '';

        let internalProjectId: string | null = null;

        if (v0ProjectId) {
          const importName =
            source.type === 'github'
              ? (() => {
                  const normalized = normalizeGithubRepoUrl(source.url, source.branch);
                  try {
                    const u = new URL(normalized.repoUrl);
                    return `Import: ${u.pathname.replace(/^\//, '')}`;
                  } catch {
                    return `Import: ${source.url}`;
                  }
                })()
              : `ZIP Import ${new Date().toISOString().slice(0, 10)}`;

          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: importName,
          });
          internalProjectId = project.id;
        }

        if (chatResult && 'id' in chatResult) {
          await db.insert(chats).values({
            id: internalChatId,
            v0ChatId: chatResult.id,
            v0ProjectId,
            projectId: internalProjectId,
            webUrl: ('webUrl' in chatResult ? chatResult.webUrl : null) || null,
          });

          const latestVersion = (chatResult as any).latestVersion;
          if (latestVersion) {
            const versionId = latestVersion.id || latestVersion.versionId;
            const demoUrl = latestVersion.demoUrl || latestVersion.demo_url || null;

            if (versionId) {
              await db.insert(versions).values({
                id: nanoid(),
                chatId: internalChatId,
                v0VersionId: versionId,
                v0MessageId: latestVersion.messageId || null,
                demoUrl: demoUrl,
                metadata: latestVersion,
              });
            }
          }
        }
      } catch (dbError) {
        console.error('Failed to save init chat to database:', dbError);
      }

      return NextResponse.json({
        ...result,
        internalChatId,
        source: source.type,
        lockedFiles: configLockedFiles,
      });
    } catch (err) {
      console.error('Init chat error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      );
    }
  });
}
