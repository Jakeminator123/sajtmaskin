# package.json

Reason: Dependency and script verification

```text
{
  "name": "@stackframe/monorepo",
  "version": "0.0.0",
  "private": true,
  "repository": "https://github.com/stack-auth/stack-auth",
  "scripts": {
    "pre-no-codegen": "pnpx only-allow pnpm",
    "pre-preinstall": "pnpx only-allow pnpm && node -e \"if(process.env.STACK_SKIP_TEMPLATE_GENERATION !== 'true') require('child_process').execSync('pnpx --package=tsx tsx ./scripts/generate-sdks.ts', {stdio: 'inherit'})\"",
    "pre": "pnpm pre-preinstall",
    "preinstall": "pnpm pre-preinstall",
    "typecheck": "pnpm pre && turbo typecheck --",
    "build:dev": "pnpm pre && NODE_ENV=development pnpm run build",
    "build": "pnpm pre && turbo build",
    "build:backend": "pnpm pre && turbo run build --filter=@stackframe/backend...",
    "build:dashboard": "pnpm pre && turbo run build --filter=@stackframe/dashboard...",
    "build:demo": "pnpm pre && turbo run build --filter=demo-app...",
    "build:docs": "pnpm run build:packages && pnpm run codegen && pnpm run build:backend && pnpm run --filter=@stackframe/stack-docs generate-openapi-docs && turbo run build --filter=@stackframe/stack-docs",
    "build:packages": "pnpm pre && turbo run build --filter=./packages/*",
    "restart-dev-in-background": "pnpm pre && pnpm run kill-dev:named && (pnpm run dev:named > dev-server.log.untracked.txt 2>&1 &) && echo 'Starting dev server in background... (Logs are in dev-server.log.untracked.txt)' && pnpx wait-on http://localhost:${NEXT_PUBLIC_STACK_PORT_PREFIX:-81}02 -t 120000 && echo 'Dev server running.'",
    "restart-dev-environment": "pnpm pre && pnpm run build:packages && pnpm run codegen && pnpm run restart-deps && pnpm run restart-dev-in-background",
    "stop-dev-environment": "pnpm pre && pnpm run kill-dev:named && pnpm run stop-deps",
    "clean": "pnpm pre-no-codegen && turbo run clean && rimraf --glob **/.next && rimraf --glob **/.turbo && rimraf .turbo && rimraf --glob **/node_modules && rimraf node_modules",
    "codegen": "pnpm pre && turbo run codegen && pnpm run generate-sdks",
    "codegen:backend": "pnpm pre && turbo run codegen --filter=@stackframe/backend...",
    "deps-compose": "docker compose -p stack-dependencies-${NEXT_PUBLIC_STACK_PORT_PREFIX:-81} -f docker/dependencies/docker.compose.yaml",
    "stop-deps": "POSTGRES_DELAY_MS=0 pnpm run deps-compose kill && POSTGRES_DELAY_MS=0 pnpm run deps-compose down -v",
    "wait-

// ... truncated
```
