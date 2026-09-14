// Client-side API for project operations

export interface Project {
  id: string;
  name: string;
  category?: string;
  description?: string;
  thumbnail_path?: string;
  demo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type PersistedFile = { name: string; content: string } | Record<string, unknown>;

export type PersistedMessage =
  | {
      id?: string;
      role?: string;
      content?: string;
      timestamp?: string | Date;
      attachments?: unknown;
    }
  | Record<string, unknown>;

export interface ProjectData {
  project_id: string;
  chat_id?: string;
  demo_url?: string;
  current_code?: string;
  files: PersistedFile[];
  messages: PersistedMessage[];
  meta?: Record<string, unknown> | null;
}

export interface ProjectWithData {
  project: Project;
  data: ProjectData | null;
}

/** Which kind of host serves the site — `provider` is a fallback, not an address to advertise. */
export type SiteAddressKind = "custom" | "branded" | "provider" | "none";

export type SitePublishState =
  | "never_published"
  | "pending"
  | "building"
  | "ready"
  | "error"
  | "cancelled";

/** Wire shape of `GET /api/projects/[id]/site`. Dates arrive as ISO strings. */
export interface ProjectSite {
  projectId: string;
  chatId: string | null;
  address: { liveUrl: string | null; kind: SiteAddressKind };
  state: SitePublishState;
  liveAt: string | null;
  liveVersionId: string | null;
  /** Set when the newest deployment is still pending/building — watch this id. */
  latestDeploymentId: string | null;
  publishedSlug: string | null;
  brandedDomain: string | null;
  brandedDomainVerified: boolean;
  customDomain: string | null;
  customDomainVerified: boolean;
  vercelProjectId: string | null;
}

// Get all projects
export async function getProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects");
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to get projects");
  }

  return data.projects;
}

// Get single project with data
export async function getProject(id: string): Promise<ProjectWithData> {
  const response = await fetch(`/api/projects/${id}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to get project");
  }

  return { project: data.project, data: data.data };
}

/**
 * Address and publish state for one project.
 *
 * Returns `null` on 404 so the caller can render "hittades inte" without
 * treating an unowned id as an error state — the API deliberately answers the
 * same way for "missing" and "not yours".
 */
export async function getProjectSite(id: string): Promise<ProjectSite | null> {
  const response = await fetch(`/api/projects/${id}/site`);
  if (response.status === 404) return null;

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to get site overview");
  }

  return data.site as ProjectSite;
}

// Create new project
export async function createProject(
  name: string,
  category?: string,
  description?: string,
): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category, description }),
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to create project");
  }

  return data.project;
}

// Update project
export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to update project");
  }

  return data.project;
}

// Delete project
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to delete project");
  }
}

// Save project data (chat state, files, etc.)
export async function saveProjectData(
  projectId: string,
  data: {
    chatId?: string;
    /** Canonical preview URL (preferred over deprecated `demoUrl`). */
    previewUrl?: string;
    /** @deprecated Prefer `previewUrl` in new code. */
    // TODO(after-wave-5): drop after deadline 2026-Q3 if no inbound payloads.
    demoUrl?: string;
    currentCode?: string;
    files?: PersistedFile[];
    messages?: PersistedMessage[];
    meta?: Record<string, unknown> | null;
  },
): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to save project data");
  }
}
