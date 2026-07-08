import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  boolean,
  uniqueIndex,
  index,
  integer,
  serial,
} from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    v0ProjectId: text("v0_project_id").notNull(),
    name: varchar("name", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint to prevent duplicate projects per user+v0ProjectId
    userProjectIdx: uniqueIndex("projects_user_v0project_idx").on(table.userId, table.v0ProjectId),
  }),
);

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    v0ChatId: text("v0_chat_id").notNull().unique(),
    v0ProjectId: text("v0_project_id").notNull(),
    webUrl: text("web_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("idx_chats_project").on(table.projectId),
  }),
);

export const versions = pgTable(
  "versions",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .references(() => chats.id, { onDelete: "cascade" })
      .notNull(),
    v0VersionId: text("v0_version_id").notNull(),
    v0MessageId: text("v0_message_id"),
    demoUrl: text("demo_url"),
    metadata: jsonb("metadata"),
    pinned: boolean("pinned").default(false).notNull(),
    pinnedAt: timestamp("pinned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // OBS: Indexnamnet matchar den runtime-skapade versionen i db-init.mjs
    // (`idx_versions_chat_v0_version_unique`) — annars uppstår drift som
    // schema-drift-testet fångar (skulle ge två fysiska index på samma kolumner).
    chatVersionIdx: uniqueIndex("idx_versions_chat_v0_version_unique").on(
      table.chatId,
      table.v0VersionId,
    ),
    chatIdx: index("idx_versions_chat_id").on(table.chatId),
  }),
);

export const versionErrorLogs = pgTable(
  "version_error_logs",
  {
    id: text("id").primaryKey(),
    chat_id: text("chat_id")
      .references(() => chats.id, { onDelete: "cascade" })
      .notNull(),
    version_id: text("version_id")
      .references(() => versions.id, { onDelete: "cascade" })
      .notNull(),
    v0_version_id: text("v0_version_id"),
    level: text("level").notNull(),
    category: text("category"),
    message: text("message").notNull(),
    meta: jsonb("meta"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatIdx: index("idx_version_error_logs_chat_id").on(table.chat_id),
    versionIdx: index("idx_version_error_logs_version_id").on(table.version_id),
  }),
);

export const deployments = pgTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    // chat_id/version_id intentionally have NO foreign keys: they hold ids
    // from EITHER the legacy tables (v0-era `chats`/`versions`) OR the engine
    // tables (`engine_chats`/`engine_versions`, own-engine publish). The old
    // FKs to the legacy tables made every own-engine publish fail with a
    // foreign-key violation on insert (see drop-deployments-legacy-fks.sql).
    chatId: text("chat_id").notNull(),
    versionId: text("version_id").notNull(),
    v0DeploymentId: text("v0_deployment_id"),
    vercelDeploymentId: text("vercel_deployment_id"),
    vercelProjectId: text("vercel_project_id"),
    inspectorUrl: text("inspector_url"),
    url: text("url"),
    domain: text("domain"),
    status: varchar("status", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    chatIdx: index("idx_deployments_chat_id").on(table.chatId),
    projectIdx: index("idx_deployments_project").on(table.projectId),
    versionIdx: index("idx_deployments_version").on(table.versionId),
    vercelDeploymentIdx: index("idx_deployments_vercel_deployment_id").on(
      table.vercelDeploymentId,
    ),
  }),
);

// ============================================================================
// APP DATABASE TABLES (formerly SQLite)
// ============================================================================

export const appProjects = pgTable(
  "app_projects",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id"),
    session_id: text("session_id"),
    name: text("name").notNull(),
    category: text("category"),
    description: text("description"),
    thumbnail_path: text("thumbnail_path"),
    /**
     * Vercel project this Sajtmaskin project publishes to. Persisted on the
     * first successful publish so re-publishing reuses the same Vercel project
     * (name-targeted) and custom domains attach to the customer's generated
     * project — not the workspace's own project. Nullable until first publish.
     */
    vercel_project_id: text("vercel_project_id"),
    vercel_project_name: text("vercel_project_name"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("idx_app_projects_user_id").on(table.user_id),
    sessionIdx: index("idx_app_projects_session_id").on(table.session_id),
  }),
);

export const promptHandoffs = pgTable(
  "prompt_handoffs",
  {
    id: text("id").primaryKey(),
    prompt: text("prompt").notNull(),
    source: text("source"),
    project_id: text("project_id"),
    user_id: text("user_id"),
    session_id: text("session_id"),
    consumed_at: timestamp("consumed_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("idx_prompt_handoffs_created_at").on(table.created_at),
    consumedIdx: index("idx_prompt_handoffs_consumed_at").on(table.consumed_at),
    userIdx: index("idx_prompt_handoffs_user").on(table.user_id),
  }),
);

export const promptLogs = pgTable(
  "prompt_logs",
  {
    id: text("id").primaryKey(),
    event: text("event").notNull(),
    user_id: text("user_id"),
    session_id: text("session_id"),
    app_project_id: text("app_project_id"),
    v0_project_id: text("v0_project_id"),
    chat_id: text("chat_id"),
    prompt_original: text("prompt_original"),
    prompt_formatted: text("prompt_formatted"),
    system_prompt: text("system_prompt"),
    prompt_assist_model: text("prompt_assist_model"),
    prompt_assist_deep: boolean("prompt_assist_deep"),
    prompt_assist_mode: text("prompt_assist_mode"),
    build_intent: text("build_intent"),
    build_method: text("build_method"),
    model_tier: text("model_tier"),
    image_generations: boolean("image_generations"),
    thinking: boolean("thinking"),
    attachments_count: integer("attachments_count"),
    meta: jsonb("meta"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("idx_prompt_logs_created_at").on(table.created_at),
    chatIdx: index("idx_prompt_logs_chat").on(table.chat_id),
    userCreatedIdx: index("idx_prompt_logs_user_created").on(table.user_id, table.created_at),
  }),
);

export const projectData = pgTable("project_data", {
  project_id: text("project_id")
    .primaryKey()
    .references(() => appProjects.id, { onDelete: "cascade" }),
  chat_id: text("chat_id"),
  demo_url: text("demo_url"),
  current_code: text("current_code"),
  files: jsonb("files"),
  messages: jsonb("messages"),
  meta: jsonb("meta"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const projectFiles = pgTable(
  "project_files",
  {
    id: serial("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => appProjects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    size_bytes: integer("size_bytes"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("idx_project_files_project").on(table.project_id),
  }),
);

export const images = pgTable(
  "images",
  {
    id: serial("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => appProjects.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    file_path: text("file_path").notNull(),
    original_name: text("original_name"),
    mime_type: text("mime_type"),
    size_bytes: integer("size_bytes"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("idx_images_project").on(table.project_id),
  }),
);

export const mediaLibrary = pgTable(
  "media_library",
  {
    id: serial("id").primaryKey(),
    user_id: text("user_id").notNull(),
    filename: text("filename").notNull(),
    original_name: text("original_name").notNull(),
    file_path: text("file_path").notNull(),
    blob_url: text("blob_url"),
    mime_type: text("mime_type").notNull(),
    file_type: text("file_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    description: text("description"),
    tags: jsonb("tags"),
    project_id: text("project_id"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("idx_media_library_user_id").on(table.user_id),
    projectIdx: index("idx_media_library_project_id").on(table.project_id),
    userCreatedIdx: index("idx_media_library_user_created").on(table.user_id, table.created_at),
  }),
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    password_hash: text("password_hash"),
    name: text("name"),
    image: text("image"),
    provider: text("provider"),
    google_id: text("google_id"),
    github_id: text("github_id"),
    github_username: text("github_username"),
    github_token: text("github_token"),
    diamonds: integer("diamonds").default(50).notNull(),
    tier: text("tier"),
    email_verified: boolean("email_verified").default(false).notNull(),
    verification_token: text("verification_token"),
    verification_token_expires: timestamp("verification_token_expires"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    last_login_at: timestamp("last_login_at"),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

export const userIntegrations = pgTable(
  "user_integrations",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    project_id: text("project_id"),
    v0_project_id: text("v0_project_id"),
    integration_type: text("integration_type").notNull(),
    marketplace_slug: text("marketplace_slug"),
    ownership_model: text("ownership_model").default("user_managed_vercel").notNull(),
    billing_owner: text("billing_owner").default("user").notNull(),
    status: text("status").default("pending").notNull(),
    env_vars: jsonb("env_vars"),
    install_url: text("install_url"),
    installed_at: timestamp("installed_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userProjectTypeIdx: uniqueIndex("user_integrations_owner_project_type_idx").on(
      table.user_id,
      table.project_id,
      table.integration_type,
    ),
    userIdx: index("idx_user_integrations_user_id").on(table.user_id),
    projectIdx: index("idx_user_integrations_project_id").on(table.project_id),
  }),
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amount: integer("amount").notNull(),
    balance_after: integer("balance_after").notNull(),
    description: text("description"),
    stripe_payment_intent: text("stripe_payment_intent"),
    stripe_session_id: text("stripe_session_id"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Idempotency guard for Stripe webhooks: a given session id may only
    // ever produce one transaction row, so a duplicate webhook delivery
    // surfaces as a unique-violation we can swallow.
    stripeSessionIdx: uniqueIndex("transactions_stripe_session_idx").on(
      table.stripe_session_id,
    ),
    userIdx: index("idx_transactions_user_id").on(table.user_id),
    userCreatedIdx: index("idx_transactions_user_created").on(
      table.user_id,
      table.created_at,
    ),
  }),
);

export const guestUsage = pgTable(
  "guest_usage",
  {
    id: serial("id").primaryKey(),
    session_id: text("session_id").notNull(),
    generations_used: integer("generations_used").default(0).notNull(),
    refines_used: integer("refines_used").default(0).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: uniqueIndex("guest_usage_session_idx").on(table.session_id),
  }),
);

export const companyProfiles = pgTable(
  "company_profiles",
  {
    id: serial("id").primaryKey(),
    project_id: text("project_id"),
    company_name: text("company_name").notNull(),
    industry: text("industry"),
    location: text("location"),
    existing_website: text("existing_website"),
    website_analysis: text("website_analysis"),
    site_likes: text("site_likes"),
    site_dislikes: text("site_dislikes"),
    site_feedback: text("site_feedback"),
    target_audience: text("target_audience"),
    purposes: text("purposes"),
    special_wishes: text("special_wishes"),
    color_palette_name: text("color_palette_name"),
    color_primary: text("color_primary"),
    color_secondary: text("color_secondary"),
    color_accent: text("color_accent"),
    competitor_insights: text("competitor_insights"),
    industry_trends: text("industry_trends"),
    research_sources: text("research_sources"),
    inspiration_sites: text("inspiration_sites"),
    voice_transcript: text("voice_transcript"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("idx_company_profiles_project").on(table.project_id),
  }),
);

export const templateCache = pgTable(
  "template_cache",
  {
    id: serial("id").primaryKey(),
    template_id: text("template_id").notNull(),
    user_id: text("user_id"),
    chat_id: text("chat_id").notNull(),
    demo_url: text("demo_url"),
    version_id: text("version_id"),
    code: text("code"),
    files_json: text("files_json"),
    model: text("model"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    expires_at: timestamp("expires_at").notNull(),
  },
  (table) => ({
    templateUserIdx: uniqueIndex("template_cache_template_user_idx").on(
      table.template_id,
      table.user_id,
    ),
  }),
);

export const registryCache = pgTable(
  "registry_cache",
  {
    base_url: text("base_url").notNull(),
    style: text("style").notNull(),
    source: text("source").notNull(),
    index_json: jsonb("index_json").notNull(),
    item_status: jsonb("item_status"),
    fetched_at: timestamp("fetched_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    unique_cache: uniqueIndex("registry_cache_source_style_idx").on(
      table.base_url,
      table.style,
      table.source,
    ),
  }),
);

export const pageViews = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    session_id: text("session_id"),
    user_id: text("user_id"),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    referrer: text("referrer"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    createdIdx: index("idx_page_views_created_at").on(table.created_at),
    pathIdx: index("idx_page_views_path").on(table.path),
  }),
);

export const userAudits = pgTable(
  "user_audits",
  {
    id: serial("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    company_name: text("company_name"),
    score_overall: integer("score_overall"),
    score_seo: integer("score_seo"),
    score_ux: integer("score_ux"),
    score_performance: integer("score_performance"),
    score_security: integer("score_security"),
    audit_result: text("audit_result").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("idx_user_audits_user_id").on(table.user_id),
    userCreatedIdx: index("idx_user_audits_user_created").on(
      table.user_id,
      table.created_at,
    ),
  }),
);

// ============================================================================
// KOSTNADSFRI PAGES (mail-link flow)
// ============================================================================

export const kostnadsfriPages = pgTable("kostnadsfri_pages", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  company_name: text("company_name").notNull(),
  industry: text("industry"),
  website: text("website"),
  contact_email: text("contact_email"),
  contact_name: text("contact_name"),
  extra_data: jsonb("extra_data"),
  status: text("status").default("active"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at"),
  consumed_at: timestamp("consumed_at"),
});

// ---------------------------------------------------------------------------
// ENGINE TABLES — own code-generation engine (migrated from SQLite)
// ---------------------------------------------------------------------------

export const engineChats = pgTable("engine_chats", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => appProjects.id, { onDelete: "cascade" }),
  title: text("title"),
  model: text("model").notNull().default("gpt-5.4"),
  systemPrompt: text("system_prompt"),
  scaffoldId: text("scaffold_id"),
  /** Last successful generation: sanitized SSE meta + version id for follow-up continuity (K-019). */
  orchestrationSnapshot: jsonb("orchestration_snapshot").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const engineMessages = pgTable(
  "engine_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull().references(() => engineChats.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    uiParts: jsonb("ui_parts").$type<Record<string, unknown>[] | null>(),
    tokenCount: integer("token_count"),
    /**
     * Concatenated reasoning / chain-of-thought captured during streaming
     * for assistant messages whose model emits `reasoning-delta` parts.
     * Persisted so the builder UI can re-show the thinking section after a
     * page refresh (F5) instead of only displaying it during the live
     * stream. Nullable for messages with no reasoning (user messages,
     * fast-tier responses, etc.).
     */
    thinking: text("thinking"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    /**
     * Hot path: getChat() läser meddelandelistan per chat ordnad på
     * created_at. Utan det här indexet blir det sequential scan.
     * Långbänk 2026-04-24.
     */
    chatCreatedIdx: index("idx_engine_messages_chat_created").on(
      table.chatId,
      table.createdAt,
    ),
  }),
);

export const engineVersions = pgTable(
  "engine_versions",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull().references(() => engineChats.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    versionNumber: integer("version_number").notNull(),
    filesJson: text("files_json").notNull(),
    repairedFilesJson: text("repaired_files_json"),
    previewUrl: text("preview_url"),
    releaseState: text("release_state").notNull().default("draft"),
    verificationState: text("verification_state").notNull().default("pending"),
    verificationSummary: text("verification_summary"),
    repairAvailableAt: timestamp("repair_available_at"),
    promotedAt: timestamp("promoted_at"),
    /**
     * Parent version this row was forked from. Set by the F3 ("Bygg
     * integrationer") trigger so the integrations build is implicitly
     * branched off a specific F2 design version. Null for plain F2
     * versions and for versions migrated before the F2/F3 split.
     */
    parentVersionId: text("parent_version_id"),
    /**
     * Edit provenance:
     *   - `null` (default) — a normal full generation/follow-up version.
     *   - `"quick_edit"` — Fast Edit Lane: a deterministic, exact edit
     *     (file-tree / code-view / inspector) applied without LLM codegen.
     *     Rendered as a minor version (v3.1, v3.2) under its `parentVersionId`.
     */
    editKind: text("edit_kind"),
    /**
     * Lifecycle stage:
     *   - `"design"` (default) — F2 design preview row.
     *   - `"integrations"` — F3 row produced by `/finalize-design`.
     *
     * Derived at row insertion time from `BuildSpec.previewPolicy`. Stored
     * directly so deploy-readiness queries don't need to re-read the
     * orchestration snapshot.
     */
    lifecycleStage: text("lifecycle_stage").notNull().default("design"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatVersionUnique: uniqueIndex("engine_versions_chat_version_unique").on(
      table.chatId,
      table.versionNumber,
    ),
    chatCreatedIdx: index("idx_engine_versions_chat_created").on(
      table.chatId,
      table.createdAt,
    ),
  }),
);

/**
 * Distributed lease for server-verify / build-error-repair / manual-repair
 * background jobs (Plan C, P1 — see
 * docs/plans/avklarat/2026-06-27-server-verify-distributed-lock.md).
 *
 * A single active (`status='running'`) row per `version_id` is the
 * cross-instance lock: any verify/repair run that mutates an `engine_versions`
 * row must hold the active lease for that version. `kind` is metadata (which
 * caller took the lease) and does NOT participate in uniqueness, so verify and
 * repair can never both own the same version concurrently. The process-local
 * `inflight` Set in server-verify.ts stays as a cheap pre-DB short-circuit;
 * this table is the distributed source of truth.
 */
export const engineVersionJobs = pgTable(
  "engine_version_jobs",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id")
      .notNull()
      .references(() => engineVersions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    runId: text("run_id").notNull(),
    status: text("status").notNull().default("running"),
    leaseExpiresAt: timestamp("lease_expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Only ONE active (running) lease per version, regardless of kind. This
    // partial unique index IS the lock; expiry-takeover is handled by the
    // acquire ON CONFLICT path (see acquireVersionLease).
    activeLeaseUnique: uniqueIndex("engine_version_jobs_active_uq")
      .on(table.versionId)
      .where(sql`${table.status} = 'running'`),
    versionIdx: index("idx_engine_version_jobs_version").on(table.versionId),
  }),
);

export const engineGenerationLogs = pgTable(
  "engine_generation_logs",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull().references(() => engineChats.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    durationMs: integer("duration_ms"),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatCreatedIdx: index("idx_engine_generation_logs_chat_created").on(
      table.chatId,
      table.createdAt,
    ),
  }),
);

export const engineVersionErrorLogs = pgTable(
  "engine_version_error_logs",
  {
    id: text("id").primaryKey(),
    chat_id: text("chat_id")
      .references(() => engineChats.id, { onDelete: "cascade" })
      .notNull(),
    version_id: text("version_id")
      .references(() => engineVersions.id, { onDelete: "cascade" })
      .notNull(),
    v0_version_id: text("v0_version_id"),
    level: text("level").notNull(),
    category: text("category"),
    message: text("message").notNull(),
    meta: jsonb("meta"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatIdx: index("idx_engine_version_error_logs_chat_id").on(table.chat_id),
    versionIdx: index("idx_engine_version_error_logs_version_id").on(table.version_id),
  }),
);

/**
 * OpenClaw debug-mode bug-hunt findings (OC_DEBUG). Structured, queryable
 * results from an armed (Mode A) or autopilot (Mode B) bug-hunt run. Distinct
 * from `engine_version_error_logs` (which the pipeline writes per version):
 * this table is the debug harness's own observation log, grouped by `run_id`,
 * with the build outcome it forced and the scenario it was probing. `chat_id` /
 * `version_id` are plain text (no FK) so findings survive cleanup of the
 * underlying debug chat/version and can reference synthetic ids.
 */
export const ocDebugFindings = pgTable(
  "oc_debug_findings",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    chat_id: text("chat_id"),
    version_id: text("version_id"),
    scenario: text("scenario"),
    severity: text("severity").notNull(),
    category: text("category"),
    file: text("file"),
    line: integer("line"),
    message: text("message").notNull(),
    build_result: text("build_result"),
    repair_outcome: text("repair_outcome"),
    meta: jsonb("meta"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runIdx: index("idx_oc_debug_findings_run_id").on(table.run_id),
    versionIdx: index("idx_oc_debug_findings_version_id").on(table.version_id),
    createdIdx: index("idx_oc_debug_findings_created_at").on(table.created_at),
  }),
);

export const generationTelemetry = pgTable(
  "generation_telemetry",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull().references(() => engineChats.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => engineVersions.id, { onDelete: "cascade" }),
    scaffoldId: text("scaffold_id"),
    scaffoldAlternatives: jsonb("scaffold_alternatives").$type<string[] | null>(),
    scaffoldSelectionMethod: text("scaffold_selection_method"),
    scaffoldSelectionConfidence: text("scaffold_selection_confidence"),
    briefInfluencedSelection: boolean("brief_influenced_selection").default(false).notNull(),
    model: text("model").notNull(),
    modelTier: text("model_tier"),
    buildIntent: text("build_intent"),
    buildMethod: text("build_method"),
    promptClassification: text("prompt_classification"),
    retryCount: integer("retry_count").default(0).notNull(),
    autofixApplied: boolean("autofix_applied").default(false).notNull(),
    syntaxFixerUsed: boolean("syntax_fixer_used").default(false).notNull(),
    preflightErrorCount: integer("preflight_error_count").default(0).notNull(),
    preflightWarningCount: integer("preflight_warning_count").default(0).notNull(),
    seoIssueCount: integer("seo_issue_count").default(0).notNull(),
    previewSuccess: boolean("preview_success"),
    previewBlockingReason: text("preview_blocking_reason"),
    qualityGateResult: text("quality_gate_result"),
    deployResult: text("deploy_result"),
    durationMs: integer("duration_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    fileCount: integer("file_count"),
    scaffoldRetryUsed: boolean("scaffold_retry_used").default(false).notNull(),
    scaffoldRetrySuggested: text("scaffold_retry_suggested"),
    userFeedback: text("user_feedback"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatIdx: index("idx_generation_telemetry_chat").on(table.chatId),
    versionIdx: index("idx_generation_telemetry_version").on(table.versionId),
    createdIdx: index("idx_generation_telemetry_created").on(table.createdAt),
  }),
);

export const versionComments = pgTable(
  "version_comments",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id").notNull().references(() => engineVersions.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull().references(() => engineChats.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    authorName: text("author_name"),
    content: text("content").notNull(),
    resolved: boolean("resolved").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    versionIdx: index("idx_version_comments_version").on(table.versionId),
    chatIdx: index("idx_version_comments_chat").on(table.chatId),
  }),
);

export const versionApprovals = pgTable(
  "version_approvals",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id").notNull().references(() => engineVersions.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull().references(() => engineChats.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    approverName: text("approver_name"),
    status: text("status").notNull().default("pending"),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    versionIdx: index("idx_version_approvals_version").on(table.versionId),
    chatIdx: index("idx_version_approvals_chat").on(table.chatId),
  }),
);

// ---------------------------------------------------------------------------

export const domainOrders = pgTable(
  "domain_orders",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull(),
    domain: text("domain").notNull(),
    order_id: text("order_id"),
    customer_price: integer("customer_price"),
    vercel_cost: integer("vercel_cost"),
    currency: text("currency"),
    status: text("status"),
    years: integer("years"),
    domain_added_to_project: boolean("domain_added_to_project").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("idx_domain_orders_project").on(table.project_id),
    orderIdx: index("idx_domain_orders_order").on(table.order_id),
  }),
);
