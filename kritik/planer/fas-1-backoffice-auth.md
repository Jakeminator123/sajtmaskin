# Fas 1: Backoffice Auth Hardening

## Scope
- R1-1: localStorage -> HttpOnly cookie
- R1-2: Rate limiting on backoffice auth
- R1-3: SHA256 -> HMAC + constant-time compare
- CSRF: Origin-check on state-changing routes (triggered by cookie migration)

## Files to modify
- `src/lib/backoffice/template-generator.ts` (primary target — all generated code)

## Acceptance criteria
- Generated ZIP contains zero `localStorage` calls for auth
- Auth cookie: HttpOnly, Secure, SameSite=Strict, Path=/backoffice
- Token signing uses HMAC + timingSafeEqual
- Auth route returns 429 after 5 failed attempts per 15 min
- PUT routes validate Origin header

## Test plan
- Manual: download ZIP, grep for localStorage
- Unit test: verifyToken (HMAC), rate limit logic
