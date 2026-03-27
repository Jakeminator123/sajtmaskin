# Vercel webhook for sajtmaskin

## Why this exists

`/api/webhooks/vercel` keeps deployment status in sync between Vercel and the app:

- updates deployment records in the database
- publishes status changes through Redis for UI consumers

## Current state

- Endpoint: `https://sajtmaskin.vercel.app/api/webhooks/vercel`
- Scope: webhook is bound to project `prj_AK7FqC8NwKorjoxGpkXi6nKGUsoe`
- Secret: rotated to the latest webhook secret and synced across environments
- Local parity: `.env.local` and `.env.production` use the same `VERCEL_WEBHOOK_SECRET`

## Runtime protections

The endpoint enforces two checks before mutating DB state:

1. Signature verification via `x-vercel-signature` and `VERCEL_WEBHOOK_SECRET`
2. Project guard via `VERCEL_PROJECT_ID`:
   - if incoming payload `projectId` does not match configured project, event is ignored with `reason: "project mismatch"`

This keeps non-sajtmaskin events out even if extra events are delivered.

Compatibility note: `deployment.checkrun.cancel` is treated as `cancelled` in the webhook status mapper.

## Required env vars

- `VERCEL_WEBHOOK_SECRET`
- `VERCEL_PROJECT_ID` (`prj_AK7FqC8NwKorjoxGpkXi6nKGUsoe`)

`VERCEL_TEAM_ID` is not required by the webhook route itself.

If the only active webhook points at production
(`https://sajtmaskin.vercel.app/api/webhooks/vercel`), then only the production
value must match the secret configured in Vercel. Keeping the same
`VERCEL_WEBHOOK_SECRET` in `preview`, `development`, `.env.local`, and
`.env.production` is still fine as a temporary simplification until you rotate.

## Verification checklist

1. Valid signed request to `/api/webhooks/vercel` returns `200`.
2. Invalid signature returns `401`.
3. Foreign `projectId` payload returns `200` ignored with `reason: "project mismatch"`.
4. Runtime logs show no new `500` spikes for `/api/webhooks/vercel`.

## Safe update procedure (future secret rotations)

1. Create or update project-scoped webhook in Vercel.
2. Copy the new secret immediately (shown once).
3. Update `VERCEL_WEBHOOK_SECRET` in Vercel for every environment that should
   accept signed test traffic. Production is the only mandatory one for the
   live webhook endpoint.
4. Sync local `.env.local` and `.env.production`.
5. Redeploy production.
6. Re-run signed/invalid-signature checks.
