import {
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  boolean,
  uniqueIndex,
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

export const chats = pgTable("chats", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id),
  v0ChatId: text("v0_chat_id").notNull().unique(),
  v0ProjectId: text("v0_project_id").notNull(),
  webUrl: text("web_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const versions = pgTable(
  "versions",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .references(() => chats.id)
      .notNull(),
    v0VersionId: text("v0_version_id").notNull(),
    v0MessageId: text("v0_message_id"),
    demoUrl: text("demo_url"),
    metadata: jsonb("metadata"),
    pinned: boolean("pinned").default(false),
    pinnedAt: timestamp("pinned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint to prevent duplicate versions per chat
    chatVersionIdx: uniqueIndex("versions_chat_version_idx").on(table.chatId, table.v0VersionId),
  }),
);

export const versionErrorLogs = pgTable("version_error_logs", {
  id: text("id").primaryKey(),
  chat_id: text("chat_id")
    .references(() => chats.id)
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
});

export const deployments = pgTable("deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id),
  chatId: text("chat_id")
    .references(() => chats.id)
    .notNull(),
  versionId: text("version_id")
    .references(() => versions.id)
    .notNull(),
  v0DeploymentId: text("v0_deployment_id"),
  vercelDeploymentId: text("vercel_deployment_id"),
  vercelProjectId: text("vercel_project_id"),
  inspectorUrl: text("inspector_url"),
  url: text("url"),
  status: varchar("status", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// APP DATABASE TABLES (formerly SQLite)
// ============================================================================

export const appProjects = pgTable("app_projects", {
  id: text("id").primaryKey(),
  user_id: text("user_id"),
  session_id: text("session_id"),
  name: text("name").notNull(),
  category: text("category"),
  description: text("description"),
  thumbnail_path: text("thumbnail_path"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const promptHandoffs = pgTable("prompt_handoffs", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  source: text("source"),
  project_id: text("project_id"),
  user_id: text("user_id"),
  session_id: text("session_id"),
  consumed_at: timestamp("consumed_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const promptLogs = pgTable("prompt_logs", {
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
});

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

export const projectFiles = pgTable("project_files", {
  id: serial("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => appProjects.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  size_bytes: integer("size_bytes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const images = pgTable("images", {
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
});

export const mediaLibrary = pgTable("media_library", {
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
});

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
  }),
);

export const transactions = pgTable("transactions", {
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
});

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

export const companyProfiles = pgTable("company_profiles", {
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
});

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

export const pageViews = pgTable("page_views", {
  id: serial("id").primaryKey(),
  path: text("path").notNull(),
  session_id: text("session_id"),
  user_id: text("user_id"),
  ip_address: text("ip_address"),
  user_agent: text("user_agent"),
  referrer: text("referrer"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const userAudits = pgTable("user_audits", {
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
});

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

export const domainOrders = pgTable("domain_orders", {
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
});
