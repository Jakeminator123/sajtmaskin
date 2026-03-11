# .env.example

Reason: Useful structural reference

```text
# Rollbar Configuration

# Get your client access token from Projects Settings -> Project -> Project Access Tokens
NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN=

# Server token for uploading source maps (post_server_item scope)
# Only needed for production builds with source maps
# Get from Projects Settings -> Project -> Project Access Tokens
ROLLBAR_SERVER_TOKEN=

# Environment name (e.g., development, staging, production)
NEXT_PUBLIC_ROLLBAR_ENV=development

# Optional: Base URL for your deployed app (for source map URLs)
# If not set, defaults to http://localhost:3000
# BASE_URL=https://your-app.vercel.app

# Optional: Version string for source maps
# SOURCE_VERSION=1.0.0
```
