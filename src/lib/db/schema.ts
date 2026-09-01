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

// Re-export timestamptz helper so call-sites use the correct Drizzle type.
// All timestamp columns in this repo must be TIMESTAMPTZ (with timezone) so that
// NOW() and explicit JS Date writes are stored as UTC regardless of the DB session
// timezone. Using bare timestamp() (TIMESTAMP WITHOUT TIME ZONE) causes 2 h drift
// when the Postgres session timezone differs from UTC (confirmed prod bug — see
// fix-timestamp-tz.sql migration).
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    v0ProjectId: text("v0_project_id").notNull(),
    name: varchar("name", { length: 255 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
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
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
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
    pinnedAt: timestamptz("pinned_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
    /** Hosting-provider URL returned by Vercel; internal fallback/diagnostics. */
    providerUrl: text("provider_url"),
    // Resolved public live URL — glossary term `liveUrl` (published prod URL),
    // distinct from a version's `previewUrl` (VM link) and `customDomain`.
    // Column name kept as `url` for the existing DB/runtime contract.
    url: text("url"),
    /** Legacy per-deployment domain record; app_projects owns canonical state. */
    domain: text("domain"),
    status: varchar("status", { length: 50 }),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    chatIdx: index("idx_deployments_chat_id").on(table.chatId),
    projectIdx: index("idx_deployments_project").on(table.projectId),
    versionIdx: index("idx_deployments_version").on(table.versionId),
    vercelDeploymentIdx: index("idx_deployments_vercel_deployment_id").on(table.vercelDeploymentId),
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
    /** Stable branded-host label, allocated once and never changed implicitly. */
    published_slug: text("published_slug"),
    /** Exact Sajtmaskin-owned hostname assigned to the generated Vercel project. */
    branded_domain: text("branded_domain"),
    branded_domain_verified_at: timestamptz("branded_domain_verified_at"),
    branded_domain_checked_at: timestamptz("branded_domain_checked_at"),
    /** Customer domain only after Vercel ownership verification succeeds. */
    custom_domain: text("custom_domain"),
    custom_domain_verified_at: timestamptz("custom_domain_verified_at"),
    created_at: timestamptz("created_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("idx_app_projects_user_id").on(table.user_id),
    sessionIdx: index("idx_app_projects_session_id").on(table.session_id),
    publishedSlugIdx: uniqueIndex("app_projects_published_slug_unique")
      .on(table.published_slug)
      .where(sql`${table.published_slug} is not null`),
    customDomainIdx: uniqueIndex("app_projects_custom_domain_unique")
      .on(table.custom_domain)
      .where(sql`${table.custom_domain} is not null`),
    brandedDomainIdx: uniqueIndex("app_projects_branded_domain_unique")
      .on(table.branded_domain)
      .where(sql`${table.branded_domain} is not null`),
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
    consumed_at: timestamptz("consumed_at"),
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
  created_at: timestamptz("created_at").defaultNow().notNull(),
  updated_at: timestamptz("updated_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
    diamonds: integer("diamonds").default(0).notNull(),
    /**
     * One account-bound, completed own-engine generation may settle without
     * debiting coins. The claim is made under the user-row lock in
     * `settleGenerationBilling`; preflight never consumes it.
     */
    free_generation_available: boolean("free_generation_available").default(true).notNull(),
    free_generation_claimed_version_id: text("free_generation_claimed_version_id"),
    free_generation_claimed_at: timestamptz("free_generation_claimed_at"),
    tier: text("tier"),
    email_verified: boolean("email_verified").default(false).notNull(),
    verification_token: text("verification_token"),
    verification_token_expires: timestamptz("verification_token_expires"),
    created_at: timestamptz("created_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
    last_login_at: timestamptz("last_login_at"),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

/**
 * No app code reads or writes this table since the Vercel Marketplace routes
 * were removed (2026-08-04, zero callers and zero rows in production). The
 * definition stays because `db-init.mjs` still creates the table and
 * `db-health-check.mjs` asserts it — dropping either side alone causes schema
 * drift. Retiring the table is a separate owner decision.
 */
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
    installed_at: timestamptz("installed_at"),
    created_at: timestamptz("created_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Idempotency guard for Stripe webhooks: a given session id may only
    // ever produce one transaction row, so a duplicate webhook delivery
    // surfaces as a unique-violation we can swallow.
    stripeSessionIdx: uniqueIndex("transactions_stripe_session_idx").on(table.stripe_session_id),
    userIdx: index("idx_transactions_user_id").on(table.user_id),
    userCreatedIdx: index("idx_transactions_user_created").on(table.user_id, table.created_at),
  }),
);

export const guestUsage = pgTable(
  "guest_usage",
  {
    id: serial("id").primaryKey(),
    session_id: text("session_id").notNull(),
    generations_used: integer("generations_used").default(0).notNull(),
    refines_used: integer("refines_used").default(0).notNull(),
    created_at: timestamptz("created_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
    expires_at: timestamptz("expires_at").notNull(),
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
    fetched_at: timestamptz("fetched_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("idx_user_audits_user_id").on(table.user_id),
    userCreatedIdx: index("idx_user_audits_user_created").on(table.user_id, table.created_at),
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
  created_at: timestamptz("created_at").defaultNow().notNull(),
  updated_at: timestamptz("updated_at").defaultNow().notNull(),
  expires_at: timestamptz("expires_at"),
  consumed_at: timestamptz("consumed_at"),
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
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
});

export const engineMessages = pgTable(
  "engine_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
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
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => ({
    /**
     * Hot path: getChat() läser meddelandelistan per chat ordnad på
     * created_at. Utan det här indexet blir det sequential scan.
     * Långbänk 2026-04-24.
     */
    chatCreatedIdx: index("idx_engine_messages_chat_created").on(table.chatId, table.createdAt),
  }),
);

export const engineVersions = pgTable(
  "engine_versions",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    versionNumber: integer("version_number").notNull(),
    filesJson: text("files_json").notNull(),
    repairedFilesJson: text("repaired_files_json"),
    previewUrl: text("preview_url"),
    releaseState: text("release_state").notNull().default("draft"),
    verificationState: text("verification_state").notNull().default("pending"),
    verificationSummary: text("verification_summary"),
    repairAvailableAt: timestamptz("repair_available_at"),
    promotedAt: timestamptz("promoted_at"),
    /**
     * Parent version this row was forked from. Set by every F3 ("Bygg
     * integrationer") transition, including deterministic no-LLM forks whose
     * files_json is byte-for-byte identical to the selected F2 design version.
     * Null for plain F2 versions and versions migrated before the F2/F3 split.
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
     * Derived at row insertion time from `BuildSpec.previewPolicy`, or set
     * explicitly by the deterministic exact-file F3 fork. Stored directly so
     * deploy-readiness queries don't need to re-read orchestration state.
     */
    lifecycleStage: text("lifecycle_stage").notNull().default("design"),
    /**
     * Innehållsidentitet: md5 av `files_json`, **genererad av Postgres**.
     *
     * `versionId` säger vilken rad ett verdikt gäller, inte vilket innehåll —
     * samma rad skrivs om av user-edit, server-repair och autofix. Den här
     * kolumnen gör frågan "gäller verdiktet innehållet som ligger här nu?"
     * besvarbar.
     *
     * Genererad och därför skrivskyddad: ingen av de fem vägar som skriver
     * `files_json` kan glömma att uppdatera den. Dela inte ihop den med
     * `hashFilesJson` (sha256), som äger repair-revisionsbindningen — två
     * mekanismer för två jobb, och värdena är olika.
     */
    filesRevision: text("files_revision").generatedAlwaysAs(sql`md5(files_json)`),
    /**
     * Env keys declared by the dossiers selected for the generation that
     * produced this version (deduped; null when none). Preview/F2-only
     * mock-seed contract: `startPreviewSession` threads these into
     * `resolvePreviewEnvLayers`, which stub-seeds each still-unset key in the
     * preview `.env.local` so the dossier UI renders its demo/mock mode —
     * `lifecycleStage === "design"` only. Persisted so force-restart
     * (`POST /preview-session`) and the quick-edit preview fallback rebuild
     * the same env surface as the first post-finalize boot. Never shipped to
     * F3/deploy env vars — the seed layer is stripped in F3.
     */
    selectedDossierEnvKeys: jsonb("selected_dossier_env_keys").$type<string[] | null>(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatVersionUnique: uniqueIndex("engine_versions_chat_version_unique").on(
      table.chatId,
      table.versionNumber,
    ),
    chatCreatedIdx: index("idx_engine_versions_chat_created").on(table.chatId, table.createdAt),
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
    leaseExpiresAt: timestamptz("lease_expires_at").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
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
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    durationMs: integer("duration_ms"),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runIdx: index("idx_oc_debug_findings_run_id").on(table.run_id),
    versionIdx: index("idx_oc_debug_findings_version_id").on(table.version_id),
    createdIdx: index("idx_oc_debug_findings_created_at").on(table.created_at),
  }),
);

/**
 * Per-chat OpenClaw power grant used by Live Review. Product Postcheck reads
 * only this row — a request body cannot invent a grant.
 */
export const liveReviewGrants = pgTable("live_review_grants", {
  chatId: text("chat_id")
    .primaryKey()
    .references(() => engineChats.id, { onDelete: "cascade" }),
  granted: jsonb("granted").$type<string[]>().notNull().default([]),
  powersOn: boolean("powers_on").notNull().default(false),
  updatedAt: timestamptz("updated_at").defaultNow().notNull(),
});

/**
 * One paid Live Review per (version, files_revision). Concurrent postchecks
 * share the row; JPEG URLs + TTL live here so Blob cleanup has an owner.
 */
export const liveReviewRuns = pgTable(
  "live_review_runs",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    filesRevision: text("files_revision").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    skipReason: text("skip_reason"),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    desktopUrl: text("desktop_url"),
    mobileUrl: text("mobile_url"),
    desktopBlobPath: text("desktop_blob_path"),
    mobileBlobPath: text("mobile_blob_path"),
    modelAttempts: integer("model_attempts").notNull().default(0),
    claimedAt: timestamptz("claimed_at").defaultNow().notNull(),
    completedAt: timestamptz("completed_at"),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => ({
    versionRevisionUnique: uniqueIndex("live_review_runs_version_revision_unique").on(
      table.versionId,
      table.filesRevision,
    ),
    chatIdx: index("idx_live_review_runs_chat_id").on(table.chatId),
    expiresIdx: index("idx_live_review_runs_expires_at").on(table.expiresAt),
  }),
);

/**
 * One Product Postcheck browser run per preview target
 * (version_id, files_revision, preview_session_id, lifecycle_token).
 * Concurrent POSTs share the row so two tabs / resume+normal / infra-retry
 * cannot launch a second Chromium against the same preview.
 *
 * `lifecycle_token` is stored as '' when the bind tuple has `null` so the
 * unique index treats two null-token claims as the same key (Postgres
 * UNIQUE would otherwise treat NULLs as distinct).
 */
export const productPostcheckRuns = pgTable(
  "product_postcheck_runs",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    filesRevision: text("files_revision").notNull(),
    previewSessionId: text("preview_session_id").notNull(),
    lifecycleToken: text("lifecycle_token").notNull().default(""),
    verificationRunId: text("verification_run_id"),
    status: text("status").notNull(),
    skipReason: text("skip_reason"),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    claimedAt: timestamptz("claimed_at").defaultNow().notNull(),
    leaseExpiresAt: timestamptz("lease_expires_at").notNull(),
    completedAt: timestamptz("completed_at"),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (table) => ({
    claimUnique: uniqueIndex("product_postcheck_runs_claim_unique").on(
      table.versionId,
      table.filesRevision,
      table.previewSessionId,
      table.lifecycleToken,
    ),
    chatIdx: index("idx_product_postcheck_runs_chat_id").on(table.chatId),
    expiresIdx: index("idx_product_postcheck_runs_expires_at").on(table.expiresAt),
  }),
);

export const generationTelemetry = pgTable(
  "generation_telemetry",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => engineVersions.id, { onDelete: "cascade" }),
    scaffoldId: text("scaffold_id"),
    scaffoldAlternatives: jsonb("scaffold_alternatives").$type<string[] | null>(),
    scaffoldSelectionMethod: text("scaffold_selection_method"),
    scaffoldSelectionConfidence: text("scaffold_selection_confidence"),
    briefInfluencedSelection: boolean("brief_influenced_selection").default(false).notNull(),
    /**
     * Scaffold-variant (stilriktning) som orkestreringen låste för den här
     * generationen, t.ex. `corporate-grid`. `null` = rad skriven före
     * kolumnen fanns, eller körning utan variant (legacy-snapshot, eval).
     */
    variantId: text("variant_id"),
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
    /**
     * Innehållsrevisionen verdiktet på den här raden faktiskt bedömde
     * (`engine_versions.files_revision` vid skrivtillfället).
     *
     * `null` = okänd revision (rader skrivna före kolumnen fanns). Okänd är
     * uttryckligen INTE samma sak som mismatch: en läsare ska behandla den som
     * dagens fail-open, aldrig som en spärr. Se planens beslut 1b.
     */
    filesRevision: text("files_revision"),
    deployResult: text("deploy_result"),
    durationMs: integer("duration_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    fileCount: integer("file_count"),
    scaffoldRetryUsed: boolean("scaffold_retry_used").default(false).notNull(),
    scaffoldRetrySuggested: text("scaffold_retry_suggested"),
    userFeedback: text("user_feedback"),
    meta: jsonb("meta"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
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
    versionId: text("version_id")
      .notNull()
      .references(() => engineVersions.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    authorName: text("author_name"),
    content: text("content").notNull(),
    resolved: boolean("resolved").default(false).notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at").defaultNow().notNull(),
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
    versionId: text("version_id")
      .notNull()
      .references(() => engineVersions.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => engineChats.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    approverName: text("approver_name"),
    status: text("status").notNull().default("pending"),
    comment: text("comment"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => ({
    versionIdx: index("idx_version_approvals_version").on(table.versionId),
    chatIdx: index("idx_version_approvals_chat").on(table.chatId),
  }),
);

/**
 * En rad per LLM-anrop: tokenförbrukningen för ETT anrop, med fas och ägare.
 *
 * Kompletterar — ersätter inte — `engine_generation_logs` och
 * `generation_telemetry`, som bär codegen-strömmens siffror per chat respektive
 * per version. `generation-cost.mjs` / Backoffice Generation Cost läser den
 * här tabellen som default (alla faser); de äldre tabellerna finns kvar som
 * `--source=logs|telemetry`. `control-stats.mjs` läser fortfarande
 * codegen-tabellerna. Deep Brief, verifier, RepairGate, embeddings och
 * klassificerarna syns här — deras usage kastades tidigare.
 *
 * `chat_id`/`version_id` är text utan FK: förbrukningen är en ekonomisk
 * händelse som ska överleva att chatten städas bort, och LLM-anrop sker även
 * innan en version finns (brief, scaffold-val). `user_id` är av samma skäl
 * ostyrt av FK — raden är en faktureringsspår, inte en relation.
 */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: text("id").primaryKey(),
    /** Grupperar alla anrop i samma körning (finalize/verify/repair-runId). */
    run_id: text("run_id"),
    chat_id: text("chat_id"),
    version_id: text("version_id"),
    /** Inloggad `users.id`, eller `guest:<sessionId>` (samma form som tenant-lagret). */
    user_id: text("user_id"),
    session_id: text("session_id"),
    /** Pipeline-fas: codegen, brief, verifier, fixer, embeddings, … */
    phase: text("phase").notNull(),
    /** Finkornigare än fas när samma fas har flera anropstyper. */
    workload: text("workload"),
    provider: text("provider"),
    model: text("model").notNull(),
    model_tier: text("model_tier"),
    input_tokens: integer("input_tokens"),
    cached_input_tokens: integer("cached_input_tokens"),
    cache_write_tokens: integer("cache_write_tokens"),
    output_tokens: integer("output_tokens"),
    reasoning_tokens: integer("reasoning_tokens"),
    /** Frozen cost snapshot captured when this provider response is observed. */
    cost_microusd: integer("cost_microusd"),
    pricing_version: text("pricing_version"),
    cost_breakdown: jsonb("cost_breakdown"),
    duration_ms: integer("duration_ms"),
    ok: boolean("ok").default(true).notNull(),
    error_code: text("error_code"),
    meta: jsonb("meta"),
    created_at: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chatIdx: index("idx_llm_usage_chat").on(table.chat_id),
    versionIdx: index("idx_llm_usage_version").on(table.version_id),
    userCreatedIdx: index("idx_llm_usage_user_created").on(table.user_id, table.created_at),
    createdIdx: index("idx_llm_usage_created").on(table.created_at),
  }),
);

/**
 * Operatörsstyrda parametrar för usage-baserad generationsdebitering.
 * Heltalsenheter gör att beräkningen kan reproduceras utan flyttalsdrift:
 * basis points (X2 = 20 000) och öre (10,50 SEK = 1 050).
 */
export const generationBillingSettings = pgTable("generation_billing_settings", {
  id: text("id").primaryKey(),
  markup_basis_points: integer("markup_basis_points").default(20_000).notNull(),
  usd_to_sek_ore: integer("usd_to_sek_ore").default(1_050).notNull(),
  sek_per_credit_ore: integer("sek_per_credit_ore").default(300).notNull(),
  updated_by: text("updated_by"),
  updated_at: timestamptz("updated_at").defaultNow().notNull(),
});

/**
 * Revisionsspår per genererad version. Inga FK: kostnad och debitering ska
 * överleva normal städning av chattar/projekt, precis som `llm_usage`.
 */
export const generationBillings = pgTable(
  "generation_billings",
  {
    id: text("id").primaryKey(),
    version_id: text("version_id").notNull(),
    chat_id: text("chat_id").notNull(),
    user_id: text("user_id"),
    status: text("status").default("pending").notNull(),
    provider_cost_microusd: integer("provider_cost_microusd").default(0).notNull(),
    provider_cost_ore: integer("provider_cost_ore").default(0).notNull(),
    markup_basis_points: integer("markup_basis_points").notNull(),
    billable_ore: integer("billable_ore").default(0).notNull(),
    usd_to_sek_ore: integer("usd_to_sek_ore").notNull(),
    sek_per_credit_ore: integer("sek_per_credit_ore").notNull(),
    credits_charged: integer("credits_charged").default(0).notNull(),
    /**
     * Only successful own-engine generation markers may consume the account's
     * one free generation. Markers created for historical/imported
     * post-processing deliberately set this to false.
     */
    free_generation_eligible: boolean("free_generation_eligible").default(true).notNull(),
    free_generation_applied: boolean("free_generation_applied").default(false).notNull(),
    claim_keys: jsonb("claim_keys")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    /**
     * Inclusive lower bound for usage billed by this marker. Normal finalized
     * generations keep null so their earlier brief/codegen calls are included.
     * A marker created immediately before post-processing an older/imported
     * version stores database NOW() here, excluding historical version usage.
     */
    usage_started_at: timestamptz("usage_started_at"),
    llm_calls: integer("llm_calls").default(0).notNull(),
    input_tokens: integer("input_tokens").default(0).notNull(),
    cached_input_tokens: integer("cached_input_tokens").default(0).notNull(),
    cache_write_tokens: integer("cache_write_tokens").default(0).notNull(),
    output_tokens: integer("output_tokens").default(0).notNull(),
    reasoning_tokens: integer("reasoning_tokens").default(0).notNull(),
    pricing_version: text("pricing_version").notNull(),
    price_breakdown: jsonb("price_breakdown"),
    transaction_ids: jsonb("transaction_ids").$type<string[] | null>(),
    first_usage_at: timestamptz("first_usage_at"),
    last_usage_at: timestamptz("last_usage_at"),
    created_at: timestamptz("created_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    versionUnique: uniqueIndex("generation_billings_version_unique").on(table.version_id),
    chatIdx: index("idx_generation_billings_chat").on(table.chat_id),
    userCreatedIdx: index("idx_generation_billings_user_created").on(
      table.user_id,
      table.created_at,
    ),
    createdIdx: index("idx_generation_billings_created").on(table.created_at),
  }),
);

// ---------------------------------------------------------------------------

/**
 * Domain purchase orders.
 *
 * `customer_price` / `vercel_cost` / `years` / `order_id` are LEGACY columns
 * from the table's dormant era (created by db-init.mjs, never written to).
 * The live purchase flow uses `price_ore` / `wholesale_ore` instead: Stripe
 * charges integer minor units, and keeping the ledger in the same unit removes
 * the rounding step where "shown" and "charged" could drift apart.
 *
 * Idempotency lives in two partial unique indexes declared in
 * `add-domain-purchase-orders.sql` (Drizzle cannot express partial uniques, so
 * they are SQL-only and asserted by the Postgres-backed test):
 *   - unique `stripe_session_id` — a redelivered webhook cannot double-charge.
 *   - unique `lower(domain)` over live statuses — one live order per name.
 */
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
    created_at: timestamptz("created_at").defaultNow().notNull(),
    updated_at: timestamptz("updated_at").defaultNow().notNull(),
    user_id: text("user_id"),
    chat_id: text("chat_id"),
    vercel_project_id: text("vercel_project_id"),
    registrar: text("registrar"),
    stripe_session_id: text("stripe_session_id"),
    stripe_payment_intent: text("stripe_payment_intent"),
    stripe_refund_id: text("stripe_refund_id"),
    /** Customer-facing amount in öre, frozen at checkout. */
    price_ore: integer("price_ore"),
    /** Registrar wholesale in öre at quote time, for margin reporting. */
    wholesale_ore: integer("wholesale_ore"),
    paid_at: timestamptz("paid_at"),
    registered_at: timestamptz("registered_at"),
    refunded_at: timestamptz("refunded_at"),
    expires_at: timestamptz("expires_at"),
    failure_reason: text("failure_reason"),
  },
  (table) => ({
    projectIdx: index("idx_domain_orders_project").on(table.project_id),
    orderIdx: index("idx_domain_orders_order").on(table.order_id),
    userIdx: index("idx_domain_orders_user").on(table.user_id, table.created_at),
    statusIdx: index("idx_domain_orders_status").on(table.status),
  }),
);
