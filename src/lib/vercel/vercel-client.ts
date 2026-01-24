/**
 * Lightweight Vercel REST client (fetch-based, no SDK dependency)
 * ===============================================================
 *
 * Why fetch instead of SDK?
 * - SDK install was flaky in this environment
 * - Fetch keeps the integration dependency-free and predictable
 * - Endpoints used here are stable (deployments + projects)
 */

const VERCEL_API_BASE = "https://api.vercel.com";

function requireToken(): string {
  // VERCEL_TOKEN is preferred, VERCEL_API_TOKEN is legacy fallback
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN;
  if (!token) {
    throw new Error("VERCEL_TOKEN is required. Get it from: https://vercel.com/account/tokens");
  }
  return token;
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
  return Boolean(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN);
}

/**
 * Deployment options
 */
export interface DeploymentOptions {
  name: string;
  files?: Record<string, string | Buffer>;
  projectSettings?: {
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
    installCommand?: string;
    devCommand?: string;
  };
  target?: "production" | "staging";
  regions?: string[];
  env?: Record<string, string>;
}

/**
 * Create a new deployment
 */
export async function createDeployment(options: DeploymentOptions): Promise<{
  deploymentId: string;
  url: string;
  readyState: string;
}> {
  try {
    // Convert files to Vercel API format (base64-encoded content)
    const filesArray = Object.entries(options.files || {}).map(([filePath, content]) => ({
      file: filePath,
      data:
        typeof content === "string"
          ? Buffer.from(content).toString("base64")
          : Buffer.from(content).toString("base64"),
      encoding: "base64",
    }));

    const body = {
      name: options.name,
      // Vercel only accepts "production" or "staging" (or custom env IDs).
      // Guard against accidental invalid values (e.g. legacy "preview").
      target: options.target === "staging" ? "staging" : "production",
      files: filesArray,
      projectSettings: options.projectSettings,
      regions: options.regions,
      env: options.env,
    };

    // Create deployment
    const deployment = await vercelFetch<{
      id: string;
      url?: string;
      readyState?: string;
      state?: string;
      createdAt?: number;
    }>("/v13/deployments", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      deploymentId: deployment.id,
      url: deployment.url || "",
      readyState: deployment.readyState || deployment.state || "QUEUED",
    };
  } catch (error) {
    console.error("[Vercel] Deployment creation failed:", error);
    throw error;
  }
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(deploymentId: string): Promise<{
  id: string;
  url: string;
  readyState: string;
  state: string;
  createdAt: number;
}> {
  try {
    const deployment = await vercelFetch<{
      id: string;
      url?: string;
      readyState?: string;
      state?: string;
      createdAt?: number;
    }>(`/v13/deployments/${deploymentId}`);

    return {
      id: deployment.id,
      url: deployment.url || "",
      readyState: deployment.readyState || deployment.state || "QUEUED",
      state: deployment.state || deployment.readyState || "UNKNOWN",
      createdAt: deployment.createdAt || 0,
    };
  } catch (error) {
    console.error("[Vercel] Failed to get deployment status:", error);
    throw error;
  }
}

/**
 * List all deployments for a project
 */
export async function listDeployments(
  projectId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    url: string;
    readyState: string;
    createdAt: number;
  }>
> {
  try {
    const query = new URLSearchParams({
      projectId,
      limit: String(limit),
    });

    const { deployments } = await vercelFetch<{
      deployments: Array<{
        id: string;
        url?: string;
        readyState?: string;
        createdAt?: number;
      }>;
    }>(`/v6/deployments?${query.toString()}`);

    return deployments.map((d) => ({
      id: d.id,
      url: d.url || "",
      readyState: d.readyState || "QUEUED",
      createdAt: d.createdAt || 0,
    }));
  } catch (error) {
    console.error("[Vercel] Failed to list deployments:", error);
    throw error;
  }
}

/**
 * Create or update a project
 */
export async function createOrUpdateProject(
  name: string,
  options?: {
    framework?: string;
    rootDirectory?: string;
    publicSource?: boolean;
    teamId?: string;
  },
): Promise<{
  id: string;
  name: string;
  accountId: string;
  updatedAt: number;
}> {
  try {
    // Try to get existing project first
    let project;
    try {
      project = await vercelFetch<{
        id: string;
        name: string;
        accountId: string;
        updatedAt?: number;
      }>(`/v9/projects/${encodeURIComponent(name)}`);
    } catch {
      // Project doesn't exist, create it
      project = await vercelFetch<{
        id: string;
        name: string;
        accountId: string;
        updatedAt?: number;
      }>("/v9/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          framework: options?.framework,
          rootDirectory: options?.rootDirectory,
          publicSource: options?.publicSource,
          teamId: options?.teamId,
        }),
      });
    }

    return {
      id: project.id,
      name: project.name,
      accountId: project.accountId,
      updatedAt: project.updatedAt || Date.now(),
    };
  } catch (error) {
    console.error("[Vercel] Failed to create/update project:", error);
    throw error;
  }
}

/**
 * Get project details
 */
export async function getProject(
  projectIdOrName: string,
  teamId?: string,
): Promise<{
  id: string;
  name: string;
  accountId: string;
  updatedAt: number;
  createdAt: number;
}> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const project = await vercelFetch<{
      id: string;
      name: string;
      accountId: string;
      updatedAt?: number;
      createdAt?: number;
    }>(`/v9/projects/${encodeURIComponent(projectIdOrName)}${query}`);

    return {
      id: project.id,
      name: project.name,
      accountId: project.accountId,
      updatedAt: project.updatedAt || 0,
      createdAt: project.createdAt || 0,
    };
  } catch (error) {
    console.error("[Vercel] Failed to get project:", error);
    throw error;
  }
}

/**
 * List all projects
 */
export async function listProjects(teamId?: string): Promise<
  Array<{
    id: string;
    name: string;
    accountId: string;
    updatedAt: number;
  }>
> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const { projects } = await vercelFetch<{
      projects: Array<{
        id: string;
        name: string;
        accountId: string;
        updatedAt?: number;
      }>;
    }>(`/v9/projects${query}`);

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      accountId: p.accountId,
      updatedAt: p.updatedAt || 0,
    }));
  } catch (error) {
    console.error("[Vercel] Failed to list projects:", error);
    throw error;
  }
}

/**
 * Set environment variables for a project
 */
export async function setEnvironmentVariable(
  projectId: string,
  key: string,
  value: string,
  options?: {
    target?: ("production" | "preview" | "development")[];
    teamId?: string;
  },
): Promise<{
  key: string;
  value: string;
  target: string[];
}> {
  try {
    const env = await vercelFetch<{
      key: string;
      value: string;
      target?: string[];
    }>(`/v9/projects/${projectId}/env`, {
      method: "POST",
      body: JSON.stringify({
        key,
        value,
        target: options?.target || ["production", "preview", "development"],
        teamId: options?.teamId,
      }),
    });

    return {
      key: env.key,
      value: env.value,
      target: env.target || [],
    };
  } catch (error) {
    console.error("[Vercel] Failed to set environment variable:", error);
    throw error;
  }
}

/**
 * List environment variables for a project
 */
export async function listEnvironmentVariables(
  projectId: string,
  teamId?: string,
): Promise<
  Array<{
    key: string;
    value: string;
    target: string[];
  }>
> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const { envs } = await vercelFetch<{
      envs: Array<{
        key: string;
        value: string;
        target?: string[];
      }>;
    }>(`/v9/projects/${projectId}/env${query}`);

    return envs.map((e) => ({
      key: e.key,
      value: e.value,
      target: e.target || [],
    }));
  } catch (error) {
    console.error("[Vercel] Failed to list environment variables:", error);
    throw error;
  }
}

/**
 * Delete a deployment
 */
export async function deleteDeployment(deploymentId: string, teamId?: string): Promise<void> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    await vercelFetch(`/v13/deployments/${deploymentId}${query}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.error("[Vercel] Failed to delete deployment:", error);
    throw error;
  }
}

// ============ Domain Management ============

/**
 * Check domain price
 * Returns pricing info for a domain
 */
export async function getDomainPrice(
  domain: string,
  teamId?: string,
): Promise<{
  name: string;
  price: number;
  period: number; // years
}> {
  try {
    const query = new URLSearchParams({ name: domain });
    if (teamId) query.append("teamId", teamId);

    return await vercelFetch<{
      name: string;
      price: number;
      period: number;
    }>(`/v4/domains/price?${query.toString()}`);
  } catch (error) {
    console.error("[Vercel] Failed to get domain price:", error);
    throw error;
  }
}

/**
 * Check if a domain is available for purchase
 */
export async function checkDomainAvailability(
  domain: string,
  teamId?: string,
): Promise<{
  name: string;
  available: boolean;
}> {
  try {
    const query = new URLSearchParams({ name: domain });
    if (teamId) query.append("teamId", teamId);

    return await vercelFetch<{
      name: string;
      available: boolean;
    }>(`/v4/domains/status?${query.toString()}`);
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

/**
 * List domains for a project
 */
export async function listProjectDomains(
  projectId: string,
  teamId?: string,
): Promise<
  Array<{
    name: string;
    apexName: string;
    verified: boolean;
    redirect?: string;
  }>
> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

    const { domains } = await vercelFetch<{
      domains: Array<{
        name: string;
        apexName: string;
        verified: boolean;
        redirect?: string;
      }>;
    }>(`/v9/projects/${projectId}/domains${query}`);

    return domains;
  } catch (error) {
    console.error("[Vercel] Failed to list project domains:", error);
    throw error;
  }
}

// ============ Domains Registrar API ============

/**
 * Contact information for domain purchase
 */
export interface DomainContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state?: string; // Optional for some countries
  zip: string;
  country: string; // ISO country code (e.g., "SE", "US")
}

/**
 * Search domains using Domains Registrar API
 */
export async function searchDomains(
  query: string,
  teamId?: string,
): Promise<{
  domains: Array<{
    name: string;
    available: boolean;
    price?: number;
  }>;
}> {
  try {
    const searchParams = new URLSearchParams({ name: query });
    if (teamId) searchParams.append("teamId", teamId);

    return await vercelFetch<{
      domains: Array<{
        name: string;
        available: boolean;
        price?: number;
      }>;
    }>(`/v1/registrar/domains/search?${searchParams.toString()}`);
  } catch (error) {
    console.error("[Vercel] Failed to search domains:", error);
    throw error;
  }
}

/**
 * Purchase a domain using Domains Registrar API
 */
export async function purchaseDomain(
  domain: string,
  options: {
    years: number;
    autoRenew?: boolean;
    expectedPrice: number;
    contactInformation: DomainContactInfo;
    teamId?: string;
  },
): Promise<{
  orderId: string;
  domain: string;
  status: string;
}> {
  try {
    const query = options.teamId ? `?teamId=${encodeURIComponent(options.teamId)}` : "";

    const result = await vercelFetch<{
      orderId: string;
      domain: string;
      status: string;
    }>(`/v1/registrar/domains/${encodeURIComponent(domain)}/buy${query}`, {
      method: "POST",
      body: JSON.stringify({
        years: options.years,
        autoRenew: options.autoRenew ?? true,
        expectedPrice: options.expectedPrice,
        contactInformation: options.contactInformation,
      }),
    });

    return result;
  } catch (error) {
    console.error("[Vercel] Failed to purchase domain:", error);
    throw error;
  }
}

/**
 * Get domain order status
 */
export async function getDomainOrderStatus(
  orderId: string,
  teamId?: string,
): Promise<{
  orderId: string;
  status: string;
  domain?: string;
  completedAt?: number;
  error?: string;
}> {
  try {
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

    return await vercelFetch<{
      orderId: string;
      status: string;
      domain?: string;
      completedAt?: number;
      error?: string;
    }>(`/v1/registrar/orders/${encodeURIComponent(orderId)}${query}`);
  } catch (error) {
    console.error("[Vercel] Failed to get domain order status:", error);
    throw error;
  }
}
