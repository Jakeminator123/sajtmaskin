# Fas 3: Security Headers + Infrastructure Config

## Scope
- R2-23: CSP + HSTS headers
- R1-9: DB TLS (rejectUnauthorized default to true)
- R1-8: Node LTS + engines field

## Files to modify
- `src/proxy.ts` — add CSP-Report-Only and HSTS to addSecurityHeaders
- `scripts/db-init.mjs` — environment-conditional SSL config
- `package.json` — Volta pin to LTS, add engines field
- `.node-version` — update to LTS

## Acceptance criteria
- All HTML responses have CSP-Report-Only + HSTS header
- db-init.mjs requires TLS verification by default
- Node version in CI matches LTS
- Build passes on Node 22

## Test plan
- Manual: curl -I against local dev -> verify headers
- CI: build must pass with new Node version
