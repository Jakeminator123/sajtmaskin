-- Sajtmaskin PostgreSQL schema (Supabase)
-- Source of truth: src/lib/db/schema.ts + scripts/db-init.mjs
-- Last synced: 2026-02-07

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  v0_project_id TEXT NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_user_v0project_idx ON projects(user_id, v0_project_id);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  v0_chat_id TEXT NOT NULL UNIQUE,
  v0_project_id TEXT NOT NULL,
  web_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  v0_version_id TEXT NOT NULL,
  v0_message_id TEXT,
  demo_url TEXT,
  metadata JSONB,
  pinned BOOLEAN DEFAULT FALSE,
  pinned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  v0_deployment_id TEXT,
  vercel_deployment_id TEXT,
  vercel_project_id TEXT,
  inspector_url TEXT,
  url TEXT,
  status VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS app_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_handoffs (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  source TEXT,
  project_id TEXT,
  user_id TEXT,
  session_id TEXT,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_logs (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  app_project_id TEXT,
  v0_project_id TEXT,
  chat_id TEXT,
  prompt_original TEXT,
  prompt_formatted TEXT,
  system_prompt TEXT,
  prompt_assist_model TEXT,
  prompt_assist_deep BOOLEAN,
  prompt_assist_mode TEXT,
  build_intent TEXT,
  build_method TEXT,
  model_tier TEXT,
  image_generations BOOLEAN,
  thinking BOOLEAN,
  attachments_count INTEGER,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS project_data (
  project_id TEXT PRIMARY KEY REFERENCES app_projects(id) ON DELETE CASCADE,
  chat_id TEXT,
  demo_url TEXT,
  current_code TEXT,
  files JSONB,
  messages JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS project_files (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT REFERENCES app_projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT REFERENCES app_projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS media_library (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  blob_url TEXT,
  mime_type TEXT NOT NULL,
  file_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  description TEXT,
  tags JSONB,
  project_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  image TEXT,
  provider TEXT,
  google_id TEXT,
  github_id TEXT,
  github_username TEXT,
  github_token TEXT,
  diamonds INTEGER DEFAULT 50 NOT NULL,
  tier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  stripe_payment_intent TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS guest_usage (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  generations_used INTEGER DEFAULT 0 NOT NULL,
  refines_used INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS company_profiles (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT,
  company_name TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  existing_website TEXT,
  website_analysis TEXT,
  site_likes TEXT,
  site_dislikes TEXT,
  site_feedback TEXT,
  target_audience TEXT,
  purposes TEXT,
  special_wishes TEXT,
  color_palette_name TEXT,
  color_primary TEXT,
  color_secondary TEXT,
  color_accent TEXT,
  competitor_insights TEXT,
  industry_trends TEXT,
  research_sources TEXT,
  inspiration_sites TEXT,
  voice_transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS template_cache (
  id BIGSERIAL PRIMARY KEY,
  template_id TEXT NOT NULL,
  user_id TEXT,
  chat_id TEXT NOT NULL,
  demo_url TEXT,
  version_id TEXT,
  code TEXT,
  files_json TEXT,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS template_cache_template_user_idx ON template_cache(template_id, user_id);

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_audits (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  company_name TEXT,
  score_overall INTEGER,
  score_seo INTEGER,
  score_ux INTEGER,
  score_performance INTEGER,
  score_security INTEGER,
  audit_result TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kostnadsfri_pages (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  company_name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  contact_email TEXT,
  contact_name TEXT,
  extra_data JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS domain_orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  order_id TEXT,
  customer_price INTEGER,
  vercel_cost INTEGER,
  currency TEXT,
  status TEXT,
  years INTEGER,
  domain_added_to_project BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
