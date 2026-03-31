# .env.local.example

Reason: Useful structural reference

```text
###############################################################################
# Morphic Configuration
###############################################################################

# =============================================================================
# REQUIRED CONFIGURATION
# =============================================================================

# -----------------------------------------------------------------------------
# AI Provider Configuration (At least one required)
# -----------------------------------------------------------------------------
# Set at least one provider API key. Available models are automatically
# detected and shown in the model selector UI.
#
# For Docker: This is the only section you need to configure.
# Database and search are handled automatically by Docker Compose.

# Option 1: OpenAI
# Get your API key at: https://platform.openai.com/api-keys
OPENAI_API_KEY=[YOUR_OPENAI_API_KEY]

# Option 2: Anthropic Claude
# ANTHROPIC_API_KEY=[YOUR_ANTHROPIC_API_KEY]

# Option 3: Google Gemini
# GOOGLE_GENERATIVE_AI_API_KEY=[YOUR_GOOGLE_GENERATIVE_AI_API_KEY]

# Option 4: Vercel AI Gateway
# Unified API gateway for multiple providers
# AI_GATEWAY_API_KEY=[YOUR_AI_GATEWAY_API_KEY]

# Option 5: Ollama
# Run local AI models with Ollama
# Requires Ollama to be installed and running: https://ollama.com/
# OLLAMA_BASE_URL=http://localhost:11434

# -----------------------------------------------------------------------------
# Database Configuration (Required for local development)
# -----------------------------------------------------------------------------
# Docker: Automatically configured — no need to set this.
# Local development: Set your PostgreSQL connection string.
# Cloud providers (Neon, Supabase, etc.): Add ?sslmode=require
#
# DATABASE_URL=postgresql://user:password@localhost:5432/morphic
DATABASE_URL=[YOUR_DATABASE_URL]

# -----------------------------------------------------------------------------
# Search Provider Configuration (Required for local development)
# -----------------------------------------------------------------------------
# Docker: SearXNG is included — no search API key needed.
# Local development: Set at least one search provider key.

# Option 1: Tavily Search (Default)
# Get your API key at: https://app.tavily.com/home
TAVILY_API_

// ... truncated
```
