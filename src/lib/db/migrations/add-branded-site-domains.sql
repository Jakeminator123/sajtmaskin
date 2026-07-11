-- Public URL state is project-owned because Vercel domains belong to a project,
-- not one immutable deployment. Keep the provider URL per deployment for
-- diagnostics/rollback and only promote a customer domain after verification.
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS published_slug TEXT;
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS branded_domain TEXT;
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS branded_domain_verified_at TIMESTAMPTZ;
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS branded_domain_checked_at TIMESTAMPTZ;
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE app_projects ADD COLUMN IF NOT EXISTS custom_domain_verified_at TIMESTAMPTZ;

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS provider_url TEXT;
UPDATE deployments SET provider_url = url WHERE provider_url IS NULL AND url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS app_projects_published_slug_unique
  ON app_projects(published_slug)
  WHERE published_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_projects_custom_domain_unique
  ON app_projects(custom_domain)
  WHERE custom_domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_projects_branded_domain_unique
  ON app_projects(branded_domain)
  WHERE branded_domain IS NOT NULL;
