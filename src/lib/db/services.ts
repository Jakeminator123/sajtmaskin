import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, dbConfigured } from "@/lib/db/client";
import {
  appProjects,
  companyProfiles,
  domainOrders,
  guestUsage,
  images,
  kostnadsfriPages,
  mediaLibrary,
  pageViews,
  promptLogs,
  promptHandoffs,
  projectData,
  projectFiles,
  templateCache,
  transactions,
  userAudits,
  users,
} from "@/lib/db/schema";
import { PATHS, SECRETS } from "@/lib/config";
import { deleteBlob, isVercelBlobUrl } from "@/lib/vercel/blob-service";

function assertDbConfigured() {
  if (!dbConfigured) {
    throw new Error(
      "Database not configured. Set POSTGRES_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING / DATABASE_URL).",
    );
  }
}

export const TEST_USER_EMAIL = SECRETS.testUserEmail || SECRETS.superadminEmail || "";

export type User = typeof users.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Project = typeof appProjects.$inferSelect;
export type ProjectData = typeof projectData.$inferSelect & {
  files: unknown[] | null;
  messages: unknown[] | null;
  meta: unknown | null;
};
export type PromptHandoff = typeof promptHandoffs.$inferSelect;
export type PromptLog = typeof promptLogs.$inferSelect;
export type MediaLibraryItem = typeof mediaLibrary.$inferSelect;
export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type DomainOrder = typeof domainOrders.$inferSelect;
export type KostnadsfriPage = typeof kostnadsfriPages.$inferSelect;
export type UserAudit = typeof userAudits.$inferSelect;

export function getUploadsDir(): string {
  return PATHS.uploads;
}

// ============================================================================
// USERS
// ============================================================================

export async function getUserById(id: string): Promise<User | null> {
  assertDbConfigured();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  assertDbConfigured();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(
  email: string,
  passwordHash: string,
  name?: string,
): Promise<User> {
  assertDbConfigured();
  const id = nanoid();
  const now = new Date();
  const rows = await db
    .insert(users)
    .values({
      id,
      email,
      password_hash: passwordHash,
      name: name || null,
      provider: "email",
      diamonds: 50,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function createGoogleUser(
  googleId: string,
  email: string,
  name: string,
  picture?: string,
): Promise<User> {
  assertDbConfigured();
  const now = new Date();
  const existing = await db
    .select()
    .from(users)
    .where(or(eq(users.google_id, googleId), eq(users.email, email)))
    .limit(1);

  if (existing[0]) {
    const rows = await db
      .update(users)
      .set({
        google_id: googleId,
        email,
        name,
        image: picture || null,
        provider: "google",
        updated_at: now,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return rows[0];
  }

  const id = nanoid();
  const rows = await db
    .insert(users)
    .values({
      id,
      email,
      name,
      image: picture || null,
      provider: "google",
      google_id: googleId,
      diamonds: 50,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(users)
    .set({ last_login_at: new Date(), updated_at: new Date() })
    .where(eq(users.id, userId));
}

export async function updateUserGitHub(
  userId: string,
  accessToken: string,
  username: string,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(users)
    .set({ github_token: accessToken, github_username: username, updated_at: new Date() })
    .where(eq(users.id, userId));
}

export async function clearUserGitHub(userId: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(users)
    .set({ github_token: null, github_username: null, updated_at: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Parse admin emails from ADMIN_EMAILS env var (comma-separated).
 */
function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isTestUser(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  const email = user.email.toLowerCase();
  if (getAdminEmails().includes(email)) return true;
  return email === SECRETS.testUserEmail || email === SECRETS.superadminEmail;
}

export function isAdminEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return (
    getAdminEmails().includes(lower) ||
    lower === SECRETS.testUserEmail ||
    lower === SECRETS.superadminEmail
  );
}

// ============================================================================
// TRANSACTIONS / CREDITS
// ============================================================================

export async function createTransaction(
  userId: string,
  type: string,
  amount: number,
  description?: string,
  stripePaymentIntent?: string,
  stripeSessionId?: string,
): Promise<Transaction> {
  assertDbConfigured();
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const newBalance = (user.diamonds || 0) + amount;
  const now = new Date();

  await db.update(users).set({ diamonds: newBalance, updated_at: now }).where(eq(users.id, userId));

  const id = nanoid();
  const rows = await db
    .insert(transactions)
    .values({
      id,
      user_id: userId,
      type,
      amount,
      balance_after: newBalance,
      description: description || null,
      stripe_payment_intent: stripePaymentIntent || null,
      stripe_session_id: stripeSessionId || null,
      created_at: now,
    })
    .returning();

  return rows[0];
}

export async function getUserTransactions(userId: string, limit = 10): Promise<Transaction[]> {
  assertDbConfigured();
  return await db
    .select()
    .from(transactions)
    .where(eq(transactions.user_id, userId))
    .orderBy(desc(transactions.created_at))
    .limit(limit);
}

export async function getTransactionByStripeSession(
  stripeSessionId: string,
): Promise<Transaction | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.stripe_session_id, stripeSessionId))
    .limit(1);
  return rows[0] ?? null;
}

// ============================================================================
// GUEST USAGE
// ============================================================================

export async function getOrCreateGuestUsage(sessionId: string) {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(guestUsage)
    .where(eq(guestUsage.session_id, sessionId))
    .limit(1);

  if (rows[0]) return rows[0];

  const now = new Date();
  const created = await db
    .insert(guestUsage)
    .values({
      session_id: sessionId,
      generations_used: 0,
      refines_used: 0,
      created_at: now,
      updated_at: now,
    })
    .returning();

  return created[0];
}

export async function incrementGuestUsage(sessionId: string, type: "generate" | "refine") {
  assertDbConfigured();
  const now = new Date();
  const updateFields =
    type === "generate"
      ? { generations_used: sql`${guestUsage.generations_used} + 1` }
      : { refines_used: sql`${guestUsage.refines_used} + 1` };

  const rows = await db
    .insert(guestUsage)
    .values({
      session_id: sessionId,
      generations_used: type === "generate" ? 1 : 0,
      refines_used: type === "refine" ? 1 : 0,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: guestUsage.session_id,
      set: {
        ...updateFields,
        updated_at: now,
      },
    })
    .returning();

  return rows[0];
}

// ============================================================================
// PROJECTS + PROJECT DATA
// ============================================================================

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

// ============================================================================
// PROMPT LOGS
// ============================================================================

export async function createPromptLog(payload: {
  event: string;
  userId?: string | null;
  sessionId?: string | null;
  appProjectId?: string | null;
  v0ProjectId?: string | null;
  chatId?: string | null;
  promptOriginal?: string | null;
  promptFormatted?: string | null;
  systemPrompt?: string | null;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean | null;
  promptAssistMode?: string | null;
  buildIntent?: string | null;
  buildMethod?: string | null;
  modelTier?: string | null;
  imageGenerations?: boolean | null;
  thinking?: boolean | null;
  attachmentsCount?: number | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  assertDbConfigured();
  const retentionLimit = 20;
  const now = new Date();
  await db.insert(promptLogs).values({
    id: nanoid(),
    event: payload.event,
    user_id: payload.userId || null,
    session_id: payload.sessionId || null,
    app_project_id: payload.appProjectId || null,
    v0_project_id: payload.v0ProjectId || null,
    chat_id: payload.chatId || null,
    prompt_original: payload.promptOriginal || null,
    prompt_formatted: payload.promptFormatted || null,
    system_prompt: payload.systemPrompt || null,
    prompt_assist_model: payload.promptAssistModel || null,
    prompt_assist_deep:
      typeof payload.promptAssistDeep === "boolean" ? payload.promptAssistDeep : null,
    prompt_assist_mode: payload.promptAssistMode || null,
    build_intent: payload.buildIntent || null,
    build_method: payload.buildMethod || null,
    model_tier: payload.modelTier || null,
    image_generations:
      typeof payload.imageGenerations === "boolean" ? payload.imageGenerations : null,
    thinking: typeof payload.thinking === "boolean" ? payload.thinking : null,
    attachments_count:
      typeof payload.attachmentsCount === "number" ? payload.attachmentsCount : null,
    meta: payload.meta || null,
    created_at: now,
  });
  await db.execute(
    sql`DELETE FROM prompt_logs WHERE id IN (
      SELECT id FROM prompt_logs ORDER BY created_at DESC OFFSET ${retentionLimit}
    )`,
  );
}

export async function getRecentPromptLogs(limit = 20): Promise<PromptLog[]> {
  assertDbConfigured();
  const resolved = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  return db.select().from(promptLogs).orderBy(desc(promptLogs.created_at)).limit(resolved);
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

export async function getProjectById(id: string): Promise<Project | null> {
  assertDbConfigured();
  const rows = await db.select().from(appProjects).where(eq(appProjects.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateProject(
  id: string,
  updates: Partial<Project>,
): Promise<Project | null> {
  assertDbConfigured();
  const allowed: Partial<Project> = {};
  if (typeof updates.name === "string") allowed.name = updates.name;
  if (typeof updates.category === "string") allowed.category = updates.category;
  if (typeof updates.description === "string") allowed.description = updates.description;
  if (typeof updates.thumbnail_path === "string") allowed.thumbnail_path = updates.thumbnail_path;

  if (Object.keys(allowed).length === 0) {
    return getProjectById(id);
  }

  const rows = await db
    .update(appProjects)
    .set({ ...allowed, updated_at: new Date() })
    .where(eq(appProjects.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteProject(id: string): Promise<boolean> {
  assertDbConfigured();
  const existing = await getProjectById(id);
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

// ============================================================================
// MEDIA LIBRARY
// ============================================================================

function resolveMediaFileType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json") return "text";
  return "other";
}

export async function canUserUploadFile(
  userId: string,
  mimeType: string,
  maxImages: number,
  maxVideos: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const counts = await getMediaLibraryCounts(userId);

  if (mimeType.startsWith("image/")) {
    if (counts.images >= maxImages) {
      return {
        allowed: false,
        reason: `Max ${maxImages} bilder/logos. Ta bort någon först.`,
      };
    }
  }

  if (mimeType.startsWith("video/")) {
    if (counts.videos >= maxVideos) {
      return {
        allowed: false,
        reason: `Max ${maxVideos} videos. Ta bort någon först.`,
      };
    }
  }

  return { allowed: true };
}

export async function saveMediaLibraryItem(
  userId: string,
  filename: string,
  originalName: string,
  filePath: string,
  mimeType: string,
  sizeBytes: number,
  blobUrl: string,
  projectId?: string,
  description?: string,
  tags?: string[],
): Promise<MediaLibraryItem> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(mediaLibrary)
    .values({
      user_id: userId,
      filename,
      original_name: originalName,
      file_path: filePath,
      blob_url: blobUrl,
      mime_type: mimeType,
      file_type: resolveMediaFileType(mimeType),
      size_bytes: sizeBytes,
      description: description || null,
      tags: tags || null,
      project_id: projectId || null,
      created_at: now,
    })
    .returning();
  return rows[0];
}

export async function getMediaLibraryByUser(
  userId: string,
  fileType?: "image" | "video" | "pdf" | "text" | "logo" | "other",
): Promise<MediaLibraryItem[]> {
  assertDbConfigured();
  if (fileType) {
    return await db
      .select()
      .from(mediaLibrary)
      .where(and(eq(mediaLibrary.user_id, userId), eq(mediaLibrary.file_type, fileType)))
      .orderBy(desc(mediaLibrary.created_at));
  }
  return await db
    .select()
    .from(mediaLibrary)
    .where(eq(mediaLibrary.user_id, userId))
    .orderBy(desc(mediaLibrary.created_at));
}

export async function getMediaLibraryCounts(userId: string): Promise<{
  images: number;
  videos: number;
  other: number;
}> {
  assertDbConfigured();
  const rows = await db
    .select({
      file_type: mediaLibrary.file_type,
      count: sql<number>`count(*)`,
    })
    .from(mediaLibrary)
    .where(eq(mediaLibrary.user_id, userId))
    .groupBy(mediaLibrary.file_type);

  let images = 0;
  let videos = 0;
  let other = 0;

  rows.forEach((row) => {
    if (row.file_type === "image" || row.file_type === "logo") images += row.count;
    else if (row.file_type === "video") videos += row.count;
    else other += row.count;
  });

  return { images, videos, other };
}

export async function getMediaLibraryItemById(id: number): Promise<MediaLibraryItem | null> {
  assertDbConfigured();
  const rows = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteMediaLibraryItem(id: number, userId: string): Promise<boolean> {
  assertDbConfigured();
  const item = await getMediaLibraryItemById(id);
  if (!item || item.user_id !== userId) return false;

  if (item.blob_url && isVercelBlobUrl(item.blob_url)) {
    await deleteBlob(item.blob_url);
  }

  await db
    .delete(mediaLibrary)
    .where(and(eq(mediaLibrary.id, id), eq(mediaLibrary.user_id, userId)));
  return true;
}

// ============================================================================
// IMAGES (PROJECT-SCOPED)
// ============================================================================

export async function saveImage(
  projectId: string,
  filename: string,
  filePath: string,
  originalName: string,
  mimeType: string,
  sizeBytes: number,
) {
  assertDbConfigured();
  const rows = await db
    .insert(images)
    .values({
      project_id: projectId,
      filename,
      file_path: filePath,
      original_name: originalName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      created_at: new Date(),
    })
    .returning();
  return rows[0];
}

// ============================================================================
// TEMPLATE CACHE
// ============================================================================

export async function getCachedTemplate(templateId: string, userId?: string | null) {
  assertDbConfigured();
  const now = new Date();
  const rows = userId
    ? await db
        .select()
        .from(templateCache)
        .where(
          and(
            eq(templateCache.template_id, templateId),
            eq(templateCache.user_id, userId),
            gt(templateCache.expires_at, now),
          ),
        )
        .orderBy(desc(templateCache.created_at))
        .limit(1)
    : await db
        .select()
        .from(templateCache)
        .where(
          and(
            eq(templateCache.template_id, templateId),
            isNull(templateCache.user_id),
            gt(templateCache.expires_at, now),
          ),
        )
        .orderBy(desc(templateCache.created_at))
        .limit(1);
  return rows[0] ?? null;
}

export async function cacheTemplateResult(
  templateId: string,
  payload: {
    chatId: string;
    demoUrl?: string | null;
    versionId?: string | null;
    files?: unknown[] | null;
    code?: string | null;
    model?: string | null;
  },
  userId?: string | null,
): Promise<void> {
  assertDbConfigured();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const filesJson = payload.files ? JSON.stringify(payload.files) : null;

  await db
    .insert(templateCache)
    .values({
      template_id: templateId,
      user_id: userId || null,
      chat_id: payload.chatId,
      demo_url: payload.demoUrl || null,
      version_id: payload.versionId || null,
      code: payload.code || null,
      files_json: filesJson,
      model: payload.model || null,
      created_at: now,
      expires_at: expiresAt,
    })
    .onConflictDoUpdate({
      target: [templateCache.template_id, templateCache.user_id],
      set: {
        chat_id: payload.chatId,
        demo_url: payload.demoUrl || null,
        version_id: payload.versionId || null,
        code: payload.code || null,
        files_json: filesJson,
        model: payload.model || null,
        created_at: now,
        expires_at: expiresAt,
      },
    });
}

// ============================================================================
// COMPANY PROFILES
// ============================================================================

export async function saveCompanyProfile(
  profile: Omit<CompanyProfile, "id" | "created_at" | "updated_at">,
): Promise<CompanyProfile> {
  assertDbConfigured();
  const now = new Date();

  const existing = profile.project_id
    ? await db
        .select()
        .from(companyProfiles)
        .where(eq(companyProfiles.project_id, profile.project_id))
        .limit(1)
    : [];

  if (existing[0]) {
    const rows = await db
      .update(companyProfiles)
      .set({ ...profile, updated_at: now })
      .where(eq(companyProfiles.id, existing[0].id))
      .returning();
    return rows[0];
  }

  const rows = await db
    .insert(companyProfiles)
    .values({
      ...profile,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function getCompanyProfileByProjectId(
  projectId: string,
): Promise<CompanyProfile | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.project_id, projectId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCompanyProfileByName(name: string): Promise<CompanyProfile | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.company_name, name))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAllCompanyProfiles(): Promise<CompanyProfile[]> {
  assertDbConfigured();
  return db.select().from(companyProfiles).orderBy(desc(companyProfiles.updated_at));
}

export async function searchCompanyProfiles(search: string): Promise<CompanyProfile[]> {
  assertDbConfigured();
  const term = `%${search}%`;
  return db
    .select()
    .from(companyProfiles)
    .where(sql`${companyProfiles.company_name} ILIKE ${term}`)
    .orderBy(desc(companyProfiles.updated_at));
}

export async function linkCompanyProfileToProject(
  profileId: number | string,
  projectId: string,
): Promise<void> {
  assertDbConfigured();
  const id = typeof profileId === "string" ? parseInt(profileId, 10) : profileId;
  await db
    .update(companyProfiles)
    .set({ project_id: projectId, updated_at: new Date() })
    .where(eq(companyProfiles.id, id));
}

// ============================================================================
// USER AUDITS
// ============================================================================

function extractAuditScores(result: Record<string, unknown> | null): {
  score_overall: number | null;
  score_seo: number | null;
  score_ux: number | null;
  score_performance: number | null;
  score_security: number | null;
} {
  const scores =
    result && typeof result === "object" && "audit_scores" in result
      ? (result.audit_scores as Record<string, number | undefined>)
      : null;

  if (!scores) {
    return {
      score_overall: null,
      score_seo: null,
      score_ux: null,
      score_performance: null,
      score_security: null,
    };
  }

  const values = Object.values(scores).filter((v) => typeof v === "number") as number[];
  const overall =
    values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null;

  return {
    score_overall: overall,
    score_seo: scores.seo ?? null,
    score_ux: scores.ux ?? null,
    score_performance: scores.performance ?? null,
    score_security: scores.security ?? null,
  };
}

export async function saveUserAudit(
  userId: string,
  url: string,
  domain: string,
  auditResult: Record<string, unknown>,
): Promise<UserAudit> {
  assertDbConfigured();
  const scores = extractAuditScores(auditResult);
  const companyName =
    typeof auditResult.company === "string" ? (auditResult.company as string) : null;
  const rows = await db
    .insert(userAudits)
    .values({
      user_id: userId,
      url,
      domain,
      company_name: companyName,
      score_overall: scores.score_overall,
      score_seo: scores.score_seo,
      score_ux: scores.score_ux,
      score_performance: scores.score_performance,
      score_security: scores.score_security,
      audit_result: JSON.stringify(auditResult),
      created_at: new Date(),
    })
    .returning();
  return rows[0];
}

export async function getUserAudits(userId: string): Promise<UserAudit[]> {
  assertDbConfigured();
  return db
    .select()
    .from(userAudits)
    .where(eq(userAudits.user_id, userId))
    .orderBy(desc(userAudits.created_at));
}

export async function getUserAuditCount(userId: string): Promise<number> {
  assertDbConfigured();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(userAudits)
    .where(eq(userAudits.user_id, userId));
  return rows[0]?.count ?? 0;
}

export async function getUserAuditById(auditId: number, userId: string): Promise<UserAudit | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(userAudits)
    .where(and(eq(userAudits.id, auditId), eq(userAudits.user_id, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteUserAudit(auditId: number, userId: string): Promise<boolean> {
  assertDbConfigured();
  const result = await db
    .delete(userAudits)
    .where(and(eq(userAudits.id, auditId), eq(userAudits.user_id, userId)))
    .returning({ id: userAudits.id });
  return result.length > 0;
}

// ============================================================================
// DOMAIN ORDERS
// ============================================================================

export async function saveDomainOrder(order: {
  id: string;
  project_id: string;
  domain: string;
  order_id: string | null;
  customer_price: number;
  vercel_cost: number;
  currency: string;
  status: string;
  years: number;
  domain_added_to_project: boolean;
}): Promise<void> {
  assertDbConfigured();
  const now = new Date();
  await db.insert(domainOrders).values({
    ...order,
    created_at: now,
    updated_at: now,
  });
}

export async function updateDomainOrderStatus(
  orderId: string,
  status: string,
  vercelOrderId?: string,
  domainAdded?: boolean,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({
      status,
      order_id: vercelOrderId ?? null,
      domain_added_to_project: domainAdded ?? false,
      updated_at: new Date(),
    })
    .where(eq(domainOrders.id, orderId));
}

// ============================================================================
// ANALYTICS
// ============================================================================

export async function recordPageView(
  path: string,
  sessionId?: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string,
  referrer?: string,
): Promise<void> {
  assertDbConfigured();
  await db.insert(pageViews).values({
    path,
    session_id: sessionId || null,
    user_id: userId || null,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    referrer: referrer || null,
    created_at: new Date(),
  });
}

export async function getAnalyticsStats(days = 30): Promise<{
  totalPageViews: number;
  uniqueVisitors: number;
  totalUsers: number;
  totalProjects: number;
  totalGenerations: number;
  totalRefines: number;
  recentPageViews: { path: string; count: number }[];
  dailyViews: { date: string; views: number; unique: number }[];
  topReferrers: { referrer: string; count: number }[];
}> {
  assertDbConfigured();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [pageViewsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate));

  const [uniqueVisitors] = await db
    .select({
      count: sql<number>`count(distinct coalesce(${pageViews.session_id}, ${pageViews.ip_address}))`,
    })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate));

  const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [totalProjects] = await db.select({ count: sql<number>`count(*)` }).from(appProjects);

  const [guestTotals] = await db
    .select({
      generations: sql<number>`coalesce(sum(${guestUsage.generations_used}), 0)`,
      refines: sql<number>`coalesce(sum(${guestUsage.refines_used}), 0)`,
    })
    .from(guestUsage);

  const recentPageViews = await db
    .select({ path: pageViews.path, count: sql<number>`count(*)` })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate))
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const dailyViews = await db
    .select({
      date: sql<string>`to_char(${pageViews.created_at}::date, 'YYYY-MM-DD')`,
      views: sql<number>`count(*)`,
      unique: sql<number>`count(distinct coalesce(${pageViews.session_id}, ${pageViews.ip_address}))`,
    })
    .from(pageViews)
    .where(gt(pageViews.created_at, startDate))
    .groupBy(sql`${pageViews.created_at}::date`)
    .orderBy(sql`${pageViews.created_at}::date`);

  const topReferrersRaw = await db
    .select({ referrer: pageViews.referrer, count: sql<number>`count(*)` })
    .from(pageViews)
    .where(and(gt(pageViews.created_at, startDate), sql`${pageViews.referrer} IS NOT NULL`))
    .groupBy(pageViews.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topReferrers = topReferrersRaw.filter(
    (referrer): referrer is { referrer: string; count: number } => referrer.referrer !== null,
  );

  return {
    totalPageViews: pageViewsCount?.count ?? 0,
    uniqueVisitors: uniqueVisitors?.count ?? 0,
    totalUsers: totalUsers?.count ?? 0,
    totalProjects: totalProjects?.count ?? 0,
    totalGenerations: guestTotals?.generations ?? 0,
    totalRefines: guestTotals?.refines ?? 0,
    recentPageViews,
    dailyViews,
    topReferrers,
  };
}

// ============================================================================
// KOSTNADSFRI PAGES (mail-link flow)
// ============================================================================

export async function createKostnadsfriPage(data: {
  slug: string;
  passwordHash: string;
  companyName: string;
  industry?: string;
  website?: string;
  contactEmail?: string;
  contactName?: string;
  extraData?: Record<string, unknown>;
  expiresAt?: Date;
}): Promise<KostnadsfriPage> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(kostnadsfriPages)
    .values({
      slug: data.slug,
      password_hash: data.passwordHash,
      company_name: data.companyName,
      industry: data.industry || null,
      website: data.website || null,
      contact_email: data.contactEmail || null,
      contact_name: data.contactName || null,
      extra_data: data.extraData || null,
      status: "active",
      created_at: now,
      updated_at: now,
      expires_at: data.expiresAt || null,
    })
    .returning();
  return rows[0];
}

export async function getKostnadsfriPageBySlug(
  slug: string,
): Promise<KostnadsfriPage | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(kostnadsfriPages)
    .where(eq(kostnadsfriPages.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function markKostnadsfriConsumed(slug: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(kostnadsfriPages)
    .set({ consumed_at: new Date(), status: "consumed" })
    .where(eq(kostnadsfriPages.slug, slug));
}

export async function getAllKostnadsfriPages(): Promise<KostnadsfriPage[]> {
  assertDbConfigured();
  return db
    .select()
    .from(kostnadsfriPages)
    .orderBy(desc(kostnadsfriPages.created_at));
}
