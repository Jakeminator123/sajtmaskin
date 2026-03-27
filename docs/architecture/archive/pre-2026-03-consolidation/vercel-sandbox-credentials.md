# Vercel Sandbox credentials (Sajtmaskin)

The app uses [`@vercel/sandbox`](https://www.npmjs.com/package/@vercel/sandbox) to run real `npm install` + `npm run dev` for generated Next.js projects.

Official overview: [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) and [Authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication).

Code entry points: `src/lib/mcp/runtime-url.ts` (`resolveSandboxAccessCredentials`, `createSandboxRuntimeFromFiles`), `src/lib/gen/sandbox-preview.ts`, `src/app/api/v0/chats/[chatId]/quality-gate/route.ts`, `src/app/api/sandbox/route.ts`.

## Important: access tokens must be passed into `Sandbox.create()`

Per the SDK’s credential helper (`getCredentials` in `@vercel/sandbox`), authentication works as follows:

1. If `Sandbox.create({ token, teamId, projectId, ... })` receives all three, those values are used.
2. Otherwise the SDK uses **`VERCEL_OIDC_TOKEN`** (JWT from `vercel env pull` or automatic on Vercel).
3. Setting only `VERCEL_TOKEN` in `.env` **does not** authenticate the SDK by itself — Sajtmaskin therefore **injects** `token`, `teamId`, and `projectId` into every `Sandbox.create()` call when you use the access-token path.

## Option A — Access token (good for local `.env.local`, CI, non-Vercel hosts)

1. Create a token: [vercel.com/account/tokens](https://vercel.com/account/tokens) (Account Settings → Tokens). The value often starts with `vcp_` or similar.
2. Link the repo and read ids (or copy from the dashboard):

   ```bash
   npx vercel link
   ```

   Then open `.vercel/project.json`:

   - `projectId` → **`VERCEL_PROJECT_ID`**
   - `orgId` → **`VERCEL_TEAM_ID`** (yes: “team” id even on Hobby)

3. Add to **`.env.local`** (never commit):

   ```bash
   VERCEL_TOKEN=paste_token_here
   VERCEL_TEAM_ID=team_xxxxxxxx
   VERCEL_PROJECT_ID=prj_xxxxxxxx
   ```

   Optional aliases supported by Sajtmaskin only (same semantics):

   - `VERCEL_TOKEN_FULL` instead of `VERCEL_TOKEN` if you prefer that name locally. If **both** are set, the app prefers whichever value looks like a current access token (e.g. `vcp_…`) so an outdated short `VERCEL_TOKEN` does not win by accident. Best practice: keep **one** variable after rotation.
   - `VERCEL_ORG_ID` instead of `VERCEL_TEAM_ID` (matches some CLI / CI examples).

## Option B — OIDC (recommended in Vercel docs for local dev)

```bash
vercel link
vercel env pull
```

This adds **`VERCEL_OIDC_TOKEN`** to `.env.local` (expires about every 12 hours; run `vercel env pull` again when auth fails). No need to pass `VERCEL_TOKEN` / team / project for the SDK in that mode.

On **Vercel production**, OIDC is handled by the platform when configured; see [Vercel OIDC](https://vercel.com/docs/oidc).

## Security

- Treat access tokens like passwords. If a token was pasted into chat, a ticket, or git: **revoke it** in the dashboard and create a new one.
- Do not commit `.env.local` or real tokens to GitHub.

## Verify

1. `VERCEL_OIDC_TOKEN` set, **or** all of `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID`.
2. `npm run dev`, generate with the own-engine path — after `done`, expect `sandbox-ready` with a `sandboxUrl`, or `build-error` with logs if install fails.
