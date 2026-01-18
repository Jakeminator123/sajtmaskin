import { NextResponse } from 'next/server';
import { Sandbox } from '@vercel/sandbox';
import ms, { StringValue } from 'ms';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { requireNotBot } from '@/lib/botProtection';

const createSandboxSchema = z.object({
  source: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('git'),
      url: z.string().url('Invalid Git URL'),
      branch: z.string().optional(),
    }),
    z.object({
      type: z.literal('files'),
      files: z.record(z.string(), z.string()),
    }),
  ]),
  timeout: z.string().optional().default('5m'),
  ports: z.array(z.number()).optional().default([3000]),
  runtime: z.enum(['node24', 'node22', 'python3.13']).optional().default('node24'),
  vcpus: z.number().min(1).max(8).optional().default(2),
  installCommand: z.string().optional().default('npm install'),
  startCommand: z.string().optional().default('npm run dev'),
});

const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 2_500_000;

function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (path.includes('..')) return false;
  return /^[A-Za-z0-9._/-]+$/.test(path);
}

function makeSafeHeredoc(content: string): { delimiter: string; body: string } {
  let delimiter = `SAJTMASKIN_EOF_${Math.random().toString(36).slice(2)}`;
  while (content.includes(delimiter)) {
    delimiter = `SAJTMASKIN_EOF_${Math.random().toString(36).slice(2)}`;
  }
  return { delimiter, body: content };
}

export async function POST(req: Request) {
  return withRateLimit(req, 'sandbox:create', async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      const oidcToken = process.env.VERCEL_OIDC_TOKEN;
      const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
      const teamId = process.env.VERCEL_TEAM_ID;
      const projectId = process.env.VERCEL_PROJECT_ID;

      if (!oidcToken && (!token || !teamId || !projectId)) {
        return NextResponse.json(
          {
            error: 'Sandbox requires authentication',
            setup:
              'Run `vercel link` then `vercel env pull` to get OIDC token, or set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID',
          },
          { status: 401 }
        );
      }

      const body = await req.json();
      const validationResult = createSandboxSchema.safeParse(body);

      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const { source, timeout, ports, runtime, vcpus, installCommand, startCommand } =
        validationResult.data;

      const timeoutMs = ms(timeout as StringValue);

      let sourceConfig: { type: 'git'; url: string; revision?: string } | undefined;

      if (source.type === 'git') {
        sourceConfig = {
          type: 'git',
          url: source.url,
          ...(source.branch && { revision: source.branch }),
        };
      } else {
        sourceConfig = {
          type: 'git',
          url: 'https://github.com/vercel/sandbox-example-next.git',
        };
      }

      const sandbox = await Sandbox.create({
        source: sourceConfig,
        resources: { vcpus },
        timeout: timeoutMs,
        ports,
        runtime,
      });

      const sandboxId = sandbox.sandboxId;

      if (source.type === 'files') {
        const entries = Object.entries(source.files);
        if (entries.length > MAX_FILES) {
          return NextResponse.json(
            { error: `Too many files for sandbox (${entries.length} > ${MAX_FILES})` },
            { status: 413 }
          );
        }

        let totalBytes = 0;
        for (const [filePath, content] of entries) {
          if (!isSafeRelativePath(filePath)) {
            return NextResponse.json({ error: `Unsafe file path: ${filePath}` }, { status: 400 });
          }
          totalBytes += Buffer.byteLength(content ?? '', 'utf8');
          if (totalBytes > MAX_TOTAL_BYTES) {
            return NextResponse.json(
              { error: `Sandbox files too large (${totalBytes} bytes > ${MAX_TOTAL_BYTES})` },
              { status: 413 }
            );
          }
        }

        for (const [filePath, content] of entries) {
          const { delimiter, body: fileBody } = makeSafeHeredoc(String(content ?? ''));
          await sandbox.runCommand({
            cmd: 'bash',
            args: [
              '-c',
              [
                `set -e`,
                `mkdir -p "$(dirname "${filePath}")"`,
                `cat > "${filePath}" <<'${delimiter}'`,
                fileBody,
                `${delimiter}`,
              ].join('\n'),
            ],
          });
        }
      }

      const installResult = await sandbox.runCommand({
        cmd: 'bash',
        args: ['-c', installCommand],
      });

      if (installResult.exitCode !== 0) {
        console.error('Install failed with exit code:', installResult.exitCode);
      }

      await sandbox.runCommand({
        cmd: 'bash',
        args: ['-c', startCommand],
        detached: true,
      });

      const urls: Record<number, string> = {};
      for (const port of ports) {
        urls[port] = sandbox.domain(port);
      }

      return NextResponse.json({
        success: true,
        sandboxId,
        urls,
        primaryUrl: urls[ports[0]] || null,
        timeout,
        runtime,
        ports,
      });
    } catch (err) {
      console.error('Error creating sandbox:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create sandbox' },
        { status: 500 }
      );
    }
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sandboxId = searchParams.get('sandboxId');

  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const sandbox = await Sandbox.get({ sandboxId });

    const ports = [3000];
    const urls: Record<number, string> = {};
    for (const port of ports) {
      urls[port] = sandbox.domain(port);
    }

    return NextResponse.json({
      sandboxId: sandbox.sandboxId,
      urls,
      primaryUrl: urls[3000] || null,
      status: sandbox.status,
      createdAt: sandbox.createdAt,
    });
  } catch (err) {
    console.error('Error getting sandbox:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to get sandbox' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const sandboxId = searchParams.get('sandboxId');

  if (!sandboxId) {
    return NextResponse.json(
      { error: 'sandboxId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const sandbox = await Sandbox.get({ sandboxId });
    await sandbox.stop();
    return NextResponse.json({ success: true, sandboxId });
  } catch (err) {
    console.error('Error deleting sandbox:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete sandbox' },
      { status: 500 }
    );
  }
}
