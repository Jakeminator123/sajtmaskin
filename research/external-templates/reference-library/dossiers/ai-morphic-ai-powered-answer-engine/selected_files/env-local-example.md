# .env.local.example

Reason: Useful structural reference

```text
###############################################################################
# Morphic Configuration
###############################################################################

# =============================================================================
# REQUIRED CONFIGURATION
# These settings are essential for the application to function
# =============================================================================

# -----------------------------------------------------------------------------
# Database Configuration (Required)
# -----------------------------------------------------------------------------
# PostgreSQL connection string (supports Neon, Supabase, or standard PostgreSQL)
# Format: postgresql://[user]:[password]@[host]/[database]?sslmode=require
#
# For local development: Use your local PostgreSQL instance
# DATABASE_URL=postgresql://user:password@localhost:5432/morphic
#
# For Docker: Use the postgres service name from docker-compose.yaml
# DATABASE_URL=postgresql://morphic:morphic@postgres:5432/morphic
#
# For cloud providers (Neon, Supabase, etc.): Add ?sslmode=require
# DATABASE_URL=postgresql://user:password@host/database?sslmode=require
DATABASE_URL=[YOUR_DATABASE_URL]

# -----------------------------------------------------------------------------
# AI Provider Configuration (At least one required)
# -----------------------------------------------------------------------------
# IMPORTANT: When using non-OpenAI providers, you must update the model
# configuration in config/models/*.json to use compatible model IDs for your
# chosen provider. See docs/CONFIGURATION.md for provider-specific model IDs.

# Option 1: OpenAI
# Get your API key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=[YOUR_OPENAI_API_KEY]

# Option 2: Anthropic Claude
# Requires updating config/models/*.json with Anthropic model IDs
# ANTHROPIC_API_KEY=[YOUR_ANTHROPIC_API_KEY]

# Option 3: Google Gemini
# Requires updating config/models/*.json with Google model IDs
# GOOGLE_GENERATIVE_AI_API_KEY=[YOUR_GOOGLE_GENERATIVE_AI_API_KEY]

# Option 4: Vercel AI Gateway
# Unified API gateway for multiple providers
# AI_GATEWAY_API_KEY=[YOUR_AI_GATEWAY_API_KEY]

# Option 5: Ollama
# Run local AI models with Ollama
# Requires Ollama to be installed and running: https://ollama.com/
# Models must support 'to

// ... truncated
```
