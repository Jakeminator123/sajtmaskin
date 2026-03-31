/**
 * Lightweight Vercel REST client (fetch-based, no SDK dependency)
 * ===============================================================
 *
 * Why fetch instead of SDK?
 * - SDK install was flaky in this environment
 * - Fetch keeps the integration dependency-free and predictable
 * - Endpoints used here are stable (deployments + projects)
 */

import { getVercelToken, hasVercelRestToken } from "@/lib/vercel";

const VERCEL_API_BASE = "https://api.vercel.com";

function requireToken(): string {
  return getVercelToken();
}

async function vercelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = requireToken();
  const res = await fetch(`${VERCEL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Vercel] ${res.status} ${res.statusText} for ${path}: ${text}`);
  }

  return (await res.json()) as T;
}

/**
 * Check if Vercel integration is configured
 */
export function isVercelConfigured(): boolean {
  return hasVercelRestToken();
}

/**
 * List environment variables for a project
 */
export async function listEnvironmentVariables(
  projectId: string,
  teamId?: string,
): Promise<
  Array<{
    id?: string;
    key: string;
    target: string[];
    type?: string;
  }>
> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const { envs } = await vercelFetch<{
      envs: Array<{
        id?: string;
        key: string;
        value: string;
        target?: string[];
        type?: string;
      }>;
    }>(`/v9/projects/${projectId}/env${query}`);

    return envs.map((e) => ({
      id: e.id,
      key: e.key,
      target: e.target || [],
      type: e.type,
    }));
  } catch (error) {
    console.error("[Vercel] Failed to list environment variables:", error);
    throw error;
  }
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string, teamId?: string): Promise<void> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    await vercelFetch(`/v9/projects/${encodeURIComponent(projectId)}${query}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.error("[Vercel] Failed to delete project:", error);
    throw error;
  }
}

/**
 * List projects for the authenticated user / team
 */
export async function listProjects(
  teamId?: string,
): Promise<Array<{ id: string; name: string; framework: string | null }>> {
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const { projects } = await vercelFetch<{
    projects: Array<{ id: string; name: string; framework: string | null }>;
  }>(`/v9/projects${query}`);
  return projects;
}

// ============ Domain Management ============

/**
 * Check domain price via Registrar API (v1)
 */
export async function getDomainPrice(
  domain: string,
  teamId?: string,
): Promise<{
  name: string;
  price: number;
  period: number;
}> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

    const data = await vercelFetch<{
      purchasePrice: number;
      years: number;
    }>(`/v1/registrar/domains/${encodeURIComponent(domain)}/price${query}`);

    return { name: domain, price: data.purchasePrice, period: data.years };
  } catch (error) {
    console.error("[Vercel] Failed to get domain price:", error);
    throw error;
  }
}

/**
 * Check if a domain is available for purchase via Registrar API (v1)
 */
export async function checkDomainAvailability(
  domain: string,
  teamId?: string,
): Promise<{
  name: string;
  available: boolean;
}> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

    const data = await vercelFetch<{
      available: boolean;
    }>(`/v1/registrar/domains/${encodeURIComponent(domain)}/availability${query}`);

    return { name: domain, available: data.available };
  } catch (error) {
    console.error("[Vercel] Failed to check domain availability:", error);
    throw error;
  }
}

/**
 * Add a domain to a project
 */
export async function addDomainToProject(
  projectId: string,
  domain: string,
  teamId?: string,
): Promise<{
  name: string;
  apexName: string;
  verified: boolean;
}> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

    return await vercelFetch<{
      name: string;
      apexName: string;
      verified: boolean;
    }>(`/v9/projects/${projectId}/domains${query}`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });
  } catch (error) {
    console.error("[Vercel] Failed to add domain to project:", error);
    throw error;
  }
}

// ============ Team Info ============

export interface VercelTeamInfo {
  id: string;
  slug: string;
  name: string;
  billing?: {
    plan?: string; // "hobby" | "pro" | "enterprise"
  };
  /** Direct plan field returned on newer API */
  plan?: string;
}

/**
 * Get team details including billing plan
 */
export async function getTeam(teamId: string): Promise<VercelTeamInfo> {
  try {
    return await vercelFetch<VercelTeamInfo>(`/v2/teams/${encodeURIComponent(teamId)}`);
  } catch (error) {
    console.error("[Vercel] Failed to get team:", error);
    throw error;
  }
}

/**
 * List all teams the authenticated user belongs to
 */
export async function listTeams(): Promise<VercelTeamInfo[]> {
  try {
    const { teams } = await vercelFetch<{ teams: VercelTeamInfo[] }>("/v2/teams");
    return teams;
  } catch (error) {
    console.error("[Vercel] Failed to list teams:", error);
    throw error;
  }
}
