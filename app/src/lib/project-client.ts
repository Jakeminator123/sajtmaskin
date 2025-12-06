// Client-side API for project operations

export interface Project {
  id: string;
  name: string;
  category?: string;
  description?: string;
  thumbnail_path?: string;
  created_at: string;
  updated_at: string;
}

// Taken-over project from Redis (for AI Studio editing)
export interface TakenOverProject {
  id: string;
  name: string;
  takenOverAt: string;
  storageType: "redis" | "github" | "sqlite";
  filesCount: number;
  githubRepo?: string;
  githubOwner?: string;
  editUrl: string;
}

export interface ProjectData {
  project_id: string;
  chat_id?: string;
  demo_url?: string;
  current_code?: string;
  files: any[];
  messages: any[];
}

export interface ProjectWithData {
  project: Project;
  data: ProjectData | null;
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

// Create new project
export async function createProject(
  name: string,
  category?: string,
  description?: string
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
export async function updateProject(
  id: string,
  updates: Partial<Project>
): Promise<Project> {
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
    demoUrl?: string;
    currentCode?: string;
    files?: any[];
    messages?: any[];
  }
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

// Upload image
export async function uploadImage(
  projectId: string,
  file: File
): Promise<{ url: string; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/projects/${projectId}/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Failed to upload image");
  }

  return { url: data.image.url, filename: data.image.filename };
}

// Get taken-over projects from Redis (for AI Studio)
export async function getTakenOverProjects(): Promise<TakenOverProject[]> {
  const response = await fetch("/api/projects/taken-over");
  const data = await response.json();

  if (!data.success) {
    // Return empty array instead of throwing - user might not be logged in
    return [];
  }

  return data.projects;
}
