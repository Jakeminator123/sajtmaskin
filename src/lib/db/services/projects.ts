import { and, desc, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import {
  appProjects,
  companyProfiles,
  domainOrders,
  projectData,
  projectFiles,
  promptHandoffs,
} from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { Project, ProjectData, PromptHandoff } from "./shared";
import {
  buildBrandedLiveDomain,
  normalizeDomainHostname,
  slugCandidate,
} from "@/lib/live-site-url";

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

function buildPromptHandoffOwnerCondition(scope: ProjectOwnerScope) {
  const userId = scope.userId?.trim();
  const sessionId = scope.sessionId?.trim();

  if (userId && sessionId) {
    return or(
      eq(promptHandoffs.user_id, userId),
      and(isNull(promptHandoffs.user_id), eq(promptHandoffs.session_id, sessionId)),
    );
  }
  if (userId) {
    return eq(promptHandoffs.user_id, userId);
  }
  if (sessionId) {
    return and(isNull(promptHandoffs.user_id), eq(promptHandoffs.session_id, sessionId));
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

export async function getPromptHandoffByIdForOwner(
  id: string,
  scope: ProjectOwnerScope,
): Promise<PromptHandoff | null> {
  assertDbConfigured();
  const ownerCondition = buildPromptHandoffOwnerCondition(scope);
  if (!ownerCondition) return null;
  const rows = await db
    .select()
    .from(promptHandoffs)
    .where(and(eq(promptHandoffs.id, id), ownerCondition))
    .limit(1);
  return rows[0] ?? null;
}

export async function consumePromptHandoffForOwner(
  id: string,
  scope: ProjectOwnerScope,
): Promise<PromptHandoff | null> {
  assertDbConfigured();
  const ownerCondition = buildPromptHandoffOwnerCondition(scope);
  if (!ownerCondition) return null;
  const now = new Date();
  const rows = await db
    .update(promptHandoffs)
    .set({ consumed_at: now })
    .where(and(eq(promptHandoffs.id, id), isNull(promptHandoffs.consumed_at), ownerCondition))
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
  const sessionId = scope.sessionId?.trim() || project?.session_id || null;
  if (project && userId && !project.user_id) {
    const claimWhere = sessionId
      ? and(eq(appProjects.id, id), isNull(appProjects.user_id), eq(appProjects.session_id, sessionId))
      : and(eq(appProjects.id, id), isNull(appProjects.user_id));
    const claimedRows = await db
      .update(appProjects)
      .set({ user_id: userId, updated_at: new Date() })
      .where(claimWhere)
      .returning();
    const claimedProject = claimedRows[0] ?? null;
    if (claimedProject) {
      console.info("[DB] Claimed session project", id, "for user", userId);
      return claimedProject;
    }

    const refreshedRows = await db
      .select()
      .from(appProjects)
      .where(and(eq(appProjects.id, id), eq(appProjects.user_id, userId)))
      .limit(1);
    return refreshedRows[0] ?? project;
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

/**
 * Persist the project thumbnail and return the PREVIOUS path so the caller
 * can delete the superseded blob (each capture uploads under a unique name —
 * Vercel Blob rejects overwrites by default).
 *
 * Note on `updated_at`: the capture always targets the project the user has
 * open in the builder right after a preview became ready, so a recency bump
 * is semantically fine — and unavoidable anyway: the `set_updated_at_app_projects`
 * DB trigger bumps `updated_at` unconditionally on every UPDATE.
 */
export async function setProjectThumbnail(
  id: string,
  thumbnailPath: string,
  scope: ProjectOwnerScope,
): Promise<{ previousThumbnailPath: string | null } | null> {
  assertDbConfigured();
  const ownerCondition = buildProjectOwnerCondition(scope);
  if (!ownerCondition) return null;
  const existing = await db
    .select({ thumbnail_path: appProjects.thumbnail_path })
    .from(appProjects)
    .where(and(eq(appProjects.id, id), ownerCondition))
    .limit(1);
  if (existing.length === 0) return null;

  // RETURNING as rowcount check: the row can vanish (delete/claim) between the
  // SELECT above and this UPDATE — a 0-row UPDATE must not report success
  // (audit A#19 false-green).
  const updated = await db
    .update(appProjects)
    .set({ thumbnail_path: thumbnailPath, updated_at: new Date() })
    .where(and(eq(appProjects.id, id), ownerCondition))
    .returning({ id: appProjects.id });
  if (updated.length === 0) return null;
  return { previousThumbnailPath: existing[0].thumbnail_path ?? null };
}

/**
 * Persist the Vercel project a Sajtmaskin project publishes to. Only non-null,
 * non-empty values overwrite — so a deploy that only knows the used project
 * name (Vercel didn't return a projectId) doesn't wipe an existing id, and vice
 * versa. Best-effort caller contract: the publish flow must not fail if this
 * write throws.
 */
export async function setProjectVercelLink(
  id: string,
  link: { vercelProjectId?: string | null; vercelProjectName?: string | null },
): Promise<Project | null> {
  assertDbConfigured();
  const updates: Partial<typeof appProjects.$inferInsert> = {};
  const vercelProjectId =
    typeof link.vercelProjectId === "string" ? link.vercelProjectId.trim() : "";
  const vercelProjectName =
    typeof link.vercelProjectName === "string" ? link.vercelProjectName.trim() : "";
  if (vercelProjectId) updates.vercel_project_id = vercelProjectId;
  if (vercelProjectName) updates.vercel_project_name = vercelProjectName;

  if (Object.keys(updates).length === 0) {
    return getProjectById(id);
  }

  const rows = await db
    .update(appProjects)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(appProjects.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Allocate the stable public identity once, immediately before the first
 * branded publish. The unique DB index is the final collision guard; retries
 * turn a simultaneous same-name publish into predictable `-2`, `-3`, … slugs.
 */
export async function ensureProjectPublishedIdentity(
  id: string,
  preferredName: string,
): Promise<{
  publishedSlug: string | null;
  brandedDomain: string | null;
  brandedDomainVerifiedAt: Date | null;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
} | null> {
  assertDbConfigured();
  const project = await getProjectById(id);
  if (!project) return null;

  const existingSlug = project.published_slug?.trim() || null;
  if (existingSlug) {
    // The rollout flag is the rollback switch. Keep stored history intact when
    // off, but do not return/provision the alias until the current environment
    // explicitly enables a parent domain.
    const brandedDomain = buildBrandedLiveDomain(existingSlug);
    if (brandedDomain && brandedDomain !== project.branded_domain) {
      await db
        .update(appProjects)
        .set({
          branded_domain: brandedDomain,
          branded_domain_verified_at: null,
          branded_domain_checked_at: null,
          updated_at: new Date(),
        })
        .where(eq(appProjects.id, id));
    }
    return {
      publishedSlug: existingSlug,
      brandedDomain,
      brandedDomainVerifiedAt:
        brandedDomain && brandedDomain === project.branded_domain
          ? (project.branded_domain_verified_at ?? null)
          : null,
      customDomain: project.custom_domain?.trim() || null,
      customDomainVerifiedAt: project.custom_domain_verified_at ?? null,
    };
  }

  const base = slugCandidate(preferredName);
  for (let number = 1; number <= 100; number += 1) {
    const candidate = number === 1 ? base : `${base}-${number}`;
    const brandedDomain = buildBrandedLiveDomain(candidate);
    try {
      const rows = await db
        .update(appProjects)
        .set({
          published_slug: candidate,
          ...(brandedDomain ? { branded_domain: brandedDomain } : {}),
          updated_at: new Date(),
        })
        .where(and(eq(appProjects.id, id), isNull(appProjects.published_slug)))
        .returning();
      const saved = rows[0];
      if (!saved) {
        // Another request allocated this same project's identity first.
        return ensureProjectPublishedIdentity(id, preferredName);
      }
      const savedSlug = saved.published_slug?.trim() || null;
      return {
        publishedSlug: savedSlug,
        brandedDomain: saved.branded_domain?.trim() || buildBrandedLiveDomain(savedSlug ?? ""),
        brandedDomainVerifiedAt: saved.branded_domain_verified_at ?? null,
        customDomain: saved.custom_domain?.trim() || null,
        customDomainVerifiedAt: saved.custom_domain_verified_at ?? null,
      };
    } catch (error) {
      // PostgreSQL unique violation: another project owns this candidate.
      if (!(error && typeof error === "object" && "code" in error && error.code === "23505")) {
        throw error;
      }
    }
  }
  const stableSuffix = createHash("sha256").update(id).digest("hex").slice(0, 10);
  const stableCandidate = `${base.slice(0, 39).replace(/-+$/, "")}-${stableSuffix}`;
  const brandedDomain = buildBrandedLiveDomain(stableCandidate);
  try {
    const rows = await db
      .update(appProjects)
      .set({
        published_slug: stableCandidate,
        ...(brandedDomain ? { branded_domain: brandedDomain } : {}),
        updated_at: new Date(),
      })
      .where(and(eq(appProjects.id, id), isNull(appProjects.published_slug)))
      .returning();
    if (rows[0]) {
      return {
        publishedSlug: rows[0].published_slug?.trim() || stableCandidate,
        brandedDomain: rows[0].branded_domain?.trim() || brandedDomain,
        brandedDomainVerifiedAt: rows[0].branded_domain_verified_at ?? null,
        customDomain: rows[0].custom_domain?.trim() || null,
        customDomainVerifiedAt: rows[0].custom_domain_verified_at ?? null,
      };
    }
    return ensureProjectPublishedIdentity(id, preferredName);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new Error("Could not allocate a collision-safe public site slug");
    }
    throw error;
  }
}

export async function markProjectBrandedDomainVerified(
  id: string,
  domain: string,
): Promise<Project | null> {
  assertDbConfigured();
  const normalized = normalizeDomainHostname(domain);
  if (!normalized) throw new Error("Invalid branded domain");
  const verifiedAt = new Date();
  const rows = await db
    .update(appProjects)
    .set({
      branded_domain: normalized,
      branded_domain_verified_at: verifiedAt,
      branded_domain_checked_at: verifiedAt,
      updated_at: new Date(),
    })
    .where(and(eq(appProjects.id, id), eq(appProjects.branded_domain, normalized)))
    .returning();
  return rows[0] ?? null;
}

export async function clearProjectBrandedDomainVerification(
  id: string,
  domain: string,
): Promise<void> {
  assertDbConfigured();
  const normalized = normalizeDomainHostname(domain);
  if (!normalized) return;
  const checkedAt = new Date();
  await db
    .update(appProjects)
    .set({
      branded_domain_verified_at: null,
      branded_domain_checked_at: checkedAt,
      updated_at: checkedAt,
    })
    .where(and(eq(appProjects.id, id), eq(appProjects.branded_domain, normalized)));
}

/** Only call after the provider's domain verification endpoint returned true. */
export async function setProjectVerifiedCustomDomain(
  id: string,
  domain: string,
): Promise<Project | null> {
  assertDbConfigured();
  const normalized = normalizeDomainHostname(domain);
  if (!normalized) {
    throw new Error("Invalid custom domain");
  }
  const rows = await db
    .update(appProjects)
    .set({
      custom_domain: normalized,
      custom_domain_verified_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(appProjects.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function clearProjectCustomDomainVerification(
  id: string,
  domain: string,
): Promise<void> {
  assertDbConfigured();
  const normalized = normalizeDomainHostname(domain);
  if (!normalized) return;
  await db
    .update(appProjects)
    .set({ custom_domain_verified_at: null, updated_at: new Date() })
    .where(and(eq(appProjects.id, id), eq(appProjects.custom_domain, normalized)));
}

export async function deleteProject(id: string, scope?: ProjectOwnerScope): Promise<boolean> {
  assertDbConfigured();
  const existing = scope ? await getProjectByIdForOwner(id, scope) : await getProjectById(id);
  if (!existing) return false;

  // Tack vare FK CASCADE räcker det med en DELETE på app_projects:
  //   project_data, project_files, images                         (FK CASCADE)
  //   engine_chats → engine_messages, engine_versions,            (FK CASCADE,
  //     engine_generation_logs, engine_version_error_logs,         add-cascade-
  //     generation_telemetry, version_comments, version_approvals  *.sql)
  //
  // Tabeller utan FK raderas explicit (annars orphanas raderna):
  //   company_profiles – `project_id TEXT` utan references() i schema.ts, så
  //                      ingen CASCADE finns. Raderades tidigare aldrig och
  //                      blev orphan vid projekt-radering (#190).
  //   domain_orders    – text-kolumn utan FK; finansiella records som annars
  //                      blir dangling efter projekt-radering.
  //   media_library    – text-kolumn utan FK *by design*: media ägs av
  //                      användaren och kan delas mellan projekt, så vi rör
  //                      den INTE här.
  //
  // Wrap:as i en transaktion så vi inte hamnar i partial-failure där en
  // explicit delete körts men app_projects-rensningen faller (deadlock,
  // timeout etc). Motsvarande pattern finns i scripts/db/cleanup-test-
  // projects.mjs (`deleteProjectsCascade`).
  await db.transaction(async (tx) => {
    await tx.delete(companyProfiles).where(eq(companyProfiles.project_id, id));
    await tx.delete(domainOrders).where(eq(domainOrders.project_id, id));
    await tx.delete(appProjects).where(eq(appProjects.id, id));
  });

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
