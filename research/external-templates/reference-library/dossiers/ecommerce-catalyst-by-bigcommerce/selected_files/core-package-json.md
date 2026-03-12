# core/package.json

Reason: Dependency and script verification

```text
{
  "name": "@bigcommerce/catalyst-core",
  "description": "BigCommerce Catalyst is a Next.js starter kit for building headless BigCommerce storefronts.",
  "version": "1.4.2",
  "private": true,
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "dev": "npm run generate && next dev",
    "generate": "dotenv -e .env.local -- node ./scripts/generate.cjs",
    "build": "npm run generate && next build",
    "build:analyze": "ANALYZE=true npm run build",
    "start": "next start",
    "prelint": "next typegen",
    "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@bigcommerce/catalyst-client": "workspace:^",
    "@c15t/nextjs": "^1.8.2",
    "@conform-to/react": "^1.6.1",
    "@conform-to/zod": "^1.6.1",
    "@icons-pack/react-simple-icons": "^11.2.0",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/api-logs": "^0.208.0",
    "@opentelemetry/instrumentation": "^0.208.0",
    "@opentelemetry/sdk-logs": "^0.208.0",
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-navigation-menu": "^1.2.13",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-portal": "^1.1.9",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-toggle": "^1.1.9",
    "@radix-ui/react-toggle-group": "^1.1.10",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@t3-oss/env-core": "^0.13.6",
    "@upstash/redis": "^1.35.0",
    "@vercel/analytics": "^1.5.0",
    "@vercel/functions": "^2.2.12",
    "@vercel/otel": "^2.1.0",
    "@vercel/speed-insights": "^1.2.0",
    "clsx": "^2.1.1",
    "content-security-policy-builder": "^2.3.0",
    "deepmerge": "^4.3.1",
    "embla-carousel": "9.0.0-rc01",
    "embla-carousel-autoplay": "9.0.0-rc01",
    "embla-carousel-fade": "9.0.0-rc01",
    "embla-carousel-react": "9.0.0-rc01",
    "gql.tada": "^1.8.10",
    "graphql": "^16.11.0",
    "dompurify": "^3.3.1",
    "jose": "^5.10.0",
    "lodash.debounce": "^4.0.8",
    "lru-cache": "^11.1.0",
    "lucide-react": "^0.474.0",
    "next": "^16.1.6",
    "next-auth": "5.0.0-beta.30",
    "next-int

// ... truncated
```
