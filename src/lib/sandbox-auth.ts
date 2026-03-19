/**
 * Shared credentials resolver for @vercel/sandbox.
 *
 * On Vercel: returns undefined so the SDK uses its internal OIDC header flow.
 * Locally:   returns explicit { token, teamId, projectId } using VERCEL_TOKEN
 *            as a personal access token, bypassing the brittle OIDC refresh.
 */

export type SandboxCredentials = {
  token: string;
  projectId: string;
  teamId: string;
};

const isOnVercel = () =>
  process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

export function getSandboxCredentials(): SandboxCredentials | undefined {
  if (isOnVercel()) return undefined;

  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (token && teamId && projectId) {
    return { token, projectId, teamId };
  }

  return undefined;
}

export function isSandboxConfigured(): boolean {
  if (isOnVercel()) return true;

  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;

  return Boolean(token && teamId && projectId);
}
