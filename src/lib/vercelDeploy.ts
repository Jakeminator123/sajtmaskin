import { getVercelToken } from '@/lib/vercel';

export type VercelDeploymentTarget = 'production' | 'preview';

type VercelFile = {
  file: string;
  data: string;
  encoding: 'base64';
};

export type CreateVercelDeploymentInput = {
  projectName: string;
  target: VercelDeploymentTarget;
  files: VercelFile[];
};

export type CreateVercelDeploymentResult = {
  vercelDeploymentId: string;
  vercelProjectId: string | null;
  url: string | null;
  inspectorUrl: string | null;
  readyState: string | null;
};

export type GetVercelDeploymentResult = {
  vercelDeploymentId: string;
  vercelProjectId: string | null;
  url: string | null;
  inspectorUrl: string | null;
  readyState: string | null;
};

export function getVercelTeamId(): string | null {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId && teamId.trim().length > 0 ? teamId.trim() : null;
}

export function sanitizeVercelProjectName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

  const maxLen = 52;
  const truncated = cleaned.slice(0, maxLen).replace(/-+$/, '');

  return truncated.length > 0 ? truncated : `sajtmaskin-${Date.now()}`;
}

export function toVercelFilesFromTextFiles(
  files: Array<{ name: string; content: string }>
): VercelFile[] {
  return files
    .filter((f) => f && typeof f.name === 'string' && typeof f.content === 'string')
    .map((f) => ({
      file: f.name.replace(/^\/+/, ''),
      data: Buffer.from(f.content, 'utf8').toString('base64'),
      encoding: 'base64' as const,
    }));
}

export async function createVercelDeployment(
  input: CreateVercelDeploymentInput
): Promise<CreateVercelDeploymentResult> {
  const token = getVercelToken();
  const teamId = getVercelTeamId();

  const url = new URL('https://api.vercel.com/v13/deployments');
  if (teamId) url.searchParams.set('teamId', teamId);
  url.searchParams.set('skipAutoDetectionConfirmation', '1');

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.projectName,
      target: input.target,
      files: input.files,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (json && typeof json === 'object' && (json as any).error && (json as any).error.message) ||
      (json && typeof json === 'object' && (json as any).message) ||
      `Vercel deployment failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  const deploymentId = (json as any)?.id as string | undefined;
  if (!deploymentId) {
    throw new Error('Vercel deployment response missing id');
  }

  return {
    vercelDeploymentId: deploymentId,
    vercelProjectId: (json as any)?.projectId ?? null,
    url: (json as any)?.url ?? null,
    inspectorUrl: (json as any)?.inspectorUrl ?? null,
    readyState: (json as any)?.readyState ?? null,
  };
}

export async function getVercelDeployment(
  vercelDeploymentId: string
): Promise<GetVercelDeploymentResult> {
  const token = getVercelToken();
  const teamId = getVercelTeamId();

  const url = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(vercelDeploymentId)}`
  );
  if (teamId) url.searchParams.set('teamId', teamId);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (json && typeof json === 'object' && (json as any).error && (json as any).error.message) ||
      (json && typeof json === 'object' && (json as any).message) ||
      `Vercel deployment fetch failed (HTTP ${res.status})`;
    throw new Error(message);
  }

  return {
    vercelDeploymentId,
    vercelProjectId: (json as any)?.projectId ?? null,
    url: (json as any)?.url ?? null,
    inspectorUrl: (json as any)?.inspectorUrl ?? null,
    readyState: (json as any)?.readyState ?? null,
  };
}

export function mapVercelReadyStateToStatus(readyState: string | null): {
  status: 'pending' | 'building' | 'ready' | 'error' | 'cancelled';
} {
  const s = (readyState || '').toUpperCase();
  if (s === 'READY') return { status: 'ready' };
  if (s === 'ERROR') return { status: 'error' };
  if (s === 'CANCELED' || s === 'CANCELLED') return { status: 'cancelled' };
  if (s === 'QUEUED' || s === 'BUILDING' || s === 'INITIALIZING') return { status: 'building' };
  return { status: 'pending' };
}
