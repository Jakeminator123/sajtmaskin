# Sajtmaskin Environment Configuration

Copy the variables below to your `.env.local` file.

## Required API Keys

```env
# OpenAI API Key (for semantic router, enhancer, image generation)
OPENAI_API_KEY=sk-...

# Vercel v0 API Token (for code generation)
V0_API_TOKEN=...
```

## Development Tools (Local Only)

Add these to `.env.local` for development features:

```env
# =============================================================================
# DEVELOPMENT TOOLS - Set to 'true' to enable
# =============================================================================

# Enable automatic ESLint auto-fix on save
# When true, runs eslint --fix on changed files
DEV_AUTO_LINT=false

# Enable verbose logging for AI pipeline
# Shows detailed logs for Semantic Router, Code Crawler, etc.
DEV_VERBOSE_AI_LOGS=false

# Enable debug mode for v0 API
# Logs full request/response bodies (WARNING: may expose sensitive data)
DEV_DEBUG_V0_API=false

# Skip credit checks in development
DEV_SKIP_CREDIT_CHECK=false

# Force specific v0 model (bypass quality selector)
# Options: v0-1.5-md, v0-1.5-lg
DEV_FORCE_V0_MODEL=

# Enable test mode (skip database saves, force regeneration)
DEV_TEST_MODE=false

# Enable MCP server debug logging
DEV_MCP_DEBUG=false
```

## Feature Flags

```env
# Enable/disable experimental features
FEATURE_AGENT_MODE=true
FEATURE_WEB_SEARCH=true
FEATURE_IMAGE_GENERATION=true
```

## Optional Services

```env
# Vercel API Token (for deployment features)
VERCEL_API_TOKEN=

# Unsplash API (for stock images)
UNSPLASH_ACCESS_KEY=

# Stripe (for payments)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Blob Storage (for media uploads)
BLOB_READ_WRITE_TOKEN=

# Redis URL (optional caching)
REDIS_URL=
```

## How to Use DEV_AUTO_LINT

When `DEV_AUTO_LINT=true`, the development server will:
1. Watch for file changes
2. Run `eslint --fix` automatically
3. Report any remaining errors to the MCP server

To enable:
1. Add `DEV_AUTO_LINT=true` to your `.env.local`
2. Restart the dev server (`npm run dev`)
3. MCP server will log lint operations if `DEV_MCP_DEBUG=true`

