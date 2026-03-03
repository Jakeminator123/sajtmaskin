# Fas 5: CI/DX + Generated Code Filesystem Fix

## Scope
- R2-20: Add test step to CI
- R2-19: Dependabot configuration
- R1-4: Generated backoffice code filesystem writes

## Files to modify
- `.github/workflows/ci.yml` — add npm run test:ci step
- `.github/dependabot.yml` — create with npm ecosystem config
- `src/lib/backoffice/template-generator.ts` — generated content/colors routes use env-switchable storage

## Acceptance criteria
- CI runs tests and fails on test failure
- Dependabot creates PRs for vulnerable dependencies
- Generated code documents Vercel storage requirements

## Test plan
- CI: push and verify test:ci runs
- Manual: review generated backoffice code
