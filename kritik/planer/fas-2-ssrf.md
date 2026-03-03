# Fas 2: SSRF Protection + Attachment Validation

## Scope
- R1-6: Apply ssrf-guard to upload-from-url and attachment schemas

## Files to modify
- `src/app/api/media/upload-from-url/route.ts` — replace raw fetch with validateSsrfTarget + safeFetch
- `src/lib/validations/chatSchemas.ts` — tighten attachment schema from z.any() to proper URL objects

## Acceptance criteria
- upload-from-url rejects internal IPs (169.254.x.x, 10.x.x.x, localhost, etc.)
- Attachment URLs validated with Zod URL schema
- SSRF validation runs before forwarding to v0 API
- Existing tests pass

## Test plan
- Unit test: validateSsrfTarget with internal/external URLs
- Manual: POST to upload-from-url with http://169.254.169.254/ -> 400
