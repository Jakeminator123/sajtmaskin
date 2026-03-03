import { and, desc, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  appProjects,
  companyProfiles,
  domainOrders,
  images,
  projectData,
  projectFiles,
  promptHandoffs,
} from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { Project, ProjectData, PromptHandoff } from "./shared";

type ProjectOwnerScope = {
  userId?: string | null;
  sessionId?: string | null;
};

function buildProjectOwnerCondition(scope: ProjectOwnerScope) {
  const userId = scope.userId?.trim();
  const sessionId = scope.sessionId?.trim();

  if (userId && sessionId) {
    // Logged-in user: match their own projects OR unclaimed session projects
    return or(
      eq(appProjects.user_id, userId),
      and(isNull(appProjects.user_id), eq(appProjects.session_id, sessionId)),
    );
  }
  if (userId) {
    return eq(appProjects.user_id, userId);
  }
  if (sessionId) {
    return and(isNull(appProjects.user_id), eq(appProjects.session_id, sessionId));
  }
  return null;
}

export async function createPromptHandoff(params: {
  prompt: string;
  source?: string | null;
  projectId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
}): Promise<PromptHandoff> {
  assertDbConfigured();
  const id = nanoid();
  const now = new Date();
  const rows = await db
    .insert(promptHandoffs)
    .values({
      id,
      prompt: params.prompt,
      source: params.source || null,
      project_id: params.projectId || null,
      user_id: params.userId || null,
      session_id: params.sessionId || null,
      created_at: now,
    })
    .returning();
  return rows[0];
}

export async function getPromptHandoffById(id: string): Promise<PromptHandoff | null> {
  assertDbConfigured();
  const rows = await db.select().from(promptHandoffs).where(eq(promptHandoffs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function consumePromptHandoff(id: string): Promise<PromptHandoff | null> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .update(promptHandoffs)
    .set({ consumed_at: now })
    .where(and(eq(promptHandoffs.id, id), isNull(promptHandoffs.consumed_at)))
    .returning();
  return rows[0] ?? null;
}

export async function createProject(
  name: string,
  category?: string,
  description?: string,
  sessionId?: string,
  userId?: string,
): Promise<Project> {
  assertDbConfigured();
  const id = nanoid();
  const now = new Date();
  const rows = await db
    .insert(appProjects)
    .values({
      id,
      name,
      category: category || null,
      description: description || null,
      session_id: sessionId || null,
      user_id: userId || null,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function getAllProjects(): Promise<Project[]> {
  assertDbConfigured();
  return await db.select().from(appProjects).orderBy(desc(appProjects.updated_at));
}

export async function getAllProjectsForOwner(scope: ProjectOwnerScope): Promise<Project[]> {
  assertDbConfigured();
  const ownerCondition = buildProjectOwnerCondition(scope);
  if (!ownerCondition) return [];
  return await db
    .select()
    .from(appProjects)
    .where(ownerCondition)
    .orderBy(desc(appProjects.updated_at));
}

export async function getProjectById(id: string): Promise<Project | null> {
  assertDbConfigured();
  const rows = await db.select().from(appProjects).where(eq(appProjects.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getProjectByIdForOwner(
  id: string,
  scope: ProjectOwnerScope,
): Promise<Project | null> {
  assertDbConfigured();
  const ownerCondition = buildProjectOwnerCondition(scope);
  if (!ownerCondition) return null;
  const rows = await db
    .select()
    .from(appProjects)
    .where(and(eq(appProjects.id, id), ownerCondition))
    .limit(1);
  const project = rows[0] ?? null;

  // Claim unclaimed session projects for the logged-in user
  const userId = scope.userId?.trim();
  if (project && userId && !project.user_id) {
    db.update(appProjects)
      .set({ user_id: userId, updated_at: new Date() })
      .where(and(eq(appProjects.id, id), isNull(appProjects.user_id)))
      .then(() => {
        console.info("[DB] Claimed session project", id, "for user", userId);
      })
      .catch((err) => {
        console.warn("[DB] Failed to claim session project:", err);
      });
  }

  return project;
}

export async function updateProject(
  id: string,
  updates: Partial<Project>,
  scope?: ProjectOwnerScope,
): Promise<Project | null> {
  assertDbConfigured();
  const allowed: Partial<Project> = {};
  if (typeof updates.name === "string") allowed.name = updates.name;
  if (typeof updates.category === "string") allowed.category = updates.category;
  if (typeof updates.description === "string") allowed.description = updates.description;
  if (typeof updates.thumbnail_path === "string") allowed.thumbnail_path = updates.thumbnail_path;

  if (Object.keys(allowed).length === 0) {
    return scope ? getProjectByIdForOwner(id, scope) : getProjectById(id);
  }

  const ownerCondition = scope ? buildProjectOwnerCondition(scope) : null;
  const whereClause = ownerCondition
    ? and(eq(appProjects.id, id), ownerCondition)
    : eq(appProjects.id, id);

  const rows = await db
    .update(appProjects)
    .set({ ...allowed, updated_at: new Date() })
    .where(whereClause)
    .returning();
  return rows[0] ?? null;
}

export async function deleteProject(id: string, scope?: ProjectOwnerScope): Promise<boolean> {
  assertDbConfigured();
  const existing = scope ? await getProjectByIdForOwner(id, scope) : await getProjectById(id);
  if (!existing) return false;

  await db.delete(projectData).where(eq(projectData.project_id, id));
  await db.delete(projectFiles).where(eq(projectFiles.project_id, id));
  await db.delete(images).where(eq(images.project_id, id));
  await db.delete(companyProfiles).where(eq(companyProfiles.project_id, id));
  await db.delete(domainOrders).where(eq(domainOrders.project_id, id));
  await db.delete(appProjects).where(eq(appProjects.id, id));

  return true;
}

export async function getProjectData(projectId: string): Promise<ProjectData | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(projectData)
    .where(eq(projectData.project_id, projectId))
    .limit(1);
  return (rows[0] as ProjectData) ?? null;
}

export async function saveProjectData(data: {
  project_id: string;
  chat_id?: string | null;
  demo_url?: string | null;
  current_code?: string | null;
  files?: unknown[] | null;
  messages?: unknown[] | null;
  meta?: unknown | null;
}): Promise<void> {
  assertDbConfigured();
  const now = new Date();

  const insertValues: typeof projectData.$inferInsert = {
    project_id: data.project_id,
    created_at: now,
    updated_at: now,
  };
  const updateValues: Partial<typeof projectData.$inferInsert> = {
    updated_at: now,
  };

  if ("chat_id" in data) {
    insertValues.chat_id = data.chat_id ?? null;
    updateValues.chat_id = data.chat_id ?? null;
  }
  if ("demo_url" in data) {
    insertValues.demo_url = data.demo_url ?? null;
    updateValues.demo_url = data.demo_url ?? null;
  }
  if ("current_code" in data) {
    insertValues.current_code = data.current_code ?? null;
    updateValues.current_code = data.current_code ?? null;
  }
  if ("files" in data) {
    insertValues.files = data.files ?? [];
    updateValues.files = data.files ?? [];
  }
  if ("messages" in data) {
    insertValues.messages = data.messages ?? [];
    updateValues.messages = data.messages ?? [];
  }
  if ("meta" in data) {
    insertValues.meta = data.meta ?? null;
    updateValues.meta = data.meta ?? null;
  }

  await db
    .insert(projectData)
    .values(insertValues)
    .onConflictDoUpdate({
      target: projectData.project_id,
      set: updateValues,
    });

  if ("files" in data && Array.isArray(data.files)) {
    await db.delete(projectFiles).where(eq(projectFiles.project_id, data.project_id));
    const rows = data.files
      .map((file) => {
        if (!file || typeof file !== "object") return null;
        const name = (file as { name?: string }).name;
        const content = (file as { content?: string }).content;
        if (!name) return null;
        return {
          project_id: data.project_id,
          path: name,
          size_bytes: typeof content === "string" ? content.length : null,
          created_at: now,
        };
      })
      .filter(Boolean) as Array<{
      project_id: string;
      path: string;
      size_bytes: number | null;
      created_at: Date;
    }>;
    if (rows.length > 0) {
      await db.insert(projectFiles).values(rows);
    }
  }
}
