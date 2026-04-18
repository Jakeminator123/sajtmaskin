# When to use

Use this dossier when a Next.js app needs self-hosted realtime transport through AnyCable: chat, presence, notifications, activity feeds, or collaborative state updates.

Choose it only if you already operate or are comfortable operating the AnyCable stack (`anycable-go`, broadcast endpoint, RPC endpoint). For simpler hosted realtime in Next.js, other providers may be lower-friction.

# How to integrate

## 1. Install and configure environment variables

Required env vars:

```env
CABLE_URL=ws://localhost:8080/cable
ANYCABLE_RPC_HOST=http://localhost:3000/api/anycable
ANYCABLE_HTTP_BROADCAST_URL=http://localhost:8090/_broadcast
ANYCABLE_HTTP_BROADCAST_SECRET=replace-with-a-long-random-secret
ANYCABLE_JWT_ID_KEY=jt1
```

Notes:
- `CABLE_URL` is the browser WebSocket endpoint exposed by AnyCable.
- `ANYCABLE_RPC_HOST` must point to the Next.js route that AnyCable calls (`/api/anycable`).
- `ANYCABLE_HTTP_BROADCAST_SECRET` is also used here to sign and verify JWT identifiers; treat it as a server secret.
- `ANYCABLE_JWT_ID_KEY` becomes the JWT `kid` header. Keep it stable unless rotating credentials intentionally.

## 2. Keep the shared AnyCable/JWT config on the server

`components/app/api/cable.ts` is the core server-only module:

```ts
import { jwtVerify, SignJWT } from "jose";
import { createCable } from "@anycable/core";

const encoder = new TextEncoder();
const secret = encoder.encode(process.env.ANYCABLE_HTTP_BROADCAST_SECRET!);

export const CABLE_URL = process.env.CABLE_URL!;
export const ANYCABLE_RPC_HOST = process.env.ANYCABLE_RPC_HOST!;

export const cable = createCable({ url: CABLE_URL });

export const identifier = {
  async issue(claims: { sub: string; name?: string }) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: process.env.ANYCABLE_JWT_ID_KEY || "default" })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);
  },
  async verify(token: string) {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.sub !== "string") {
      throw new Error("Invalid token subject");
    }
    return payload;
  },
};
```

Important pattern: keep JWT signing and verification logic in one place so the session route and cable auth route cannot drift.

## 3. Expose the AnyCable RPC route

AnyCable calls this route during connect/subscribe/command handling:

```ts
import { NextResponse } from "next/server";
import { handler, Status } from "@anycable/serverless-js";
import app from "../cable";

export async function POST(request: Request) {
  try {
    const response = await handler(request, app);
    return NextResponse.json(response, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({
      status: Status.ERROR,
      error_msg: "Server error",
    });
  }
}
```

Route path:

```txt
/app/api/anycable/route.ts
```

If you move it, update `ANYCABLE_RPC_HOST` accordingly.

## 4. Issue a session token before opening realtime connections

This route stores the JWT in an HTTP-only cookie:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { identifier } from "../../cable";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const name = body?.name;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const token = await identifier.issue({ sub: userId, name });

  cookies().set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}
```

Call it after your app has authenticated the user with your real auth system:

```ts
await fetch("/api/auth/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId: user.id,
    name: user.name,
  }),
});
```

Do not trust arbitrary client-provided `userId` in a production app. Derive it from your actual server-side auth session.

## 5. Expose a cable auth endpoint for the browser

The browser should not build its own JWT. Instead, it asks the server for a signed cable URL:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { identifier, CABLE_URL } from "../../cable";

export async function POST() {
  const token = cookies().get("token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await identifier.verify(token);
    return NextResponse.json({ url: `${CABLE_URL}?jid=${token}` }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

This keeps the JWT in an HTTP-only cookie while still letting the frontend obtain a usable WebSocket URL.

## 6. Connect from the client through the auth endpoint

Create a small client helper:

```ts
import { createCable } from "@anycable/web";

let cable: ReturnType<typeof createCable> | null = null;

export async function getAuthorizedCable() {
  if (cable) return cable;

  const response = await fetch("/api/auth/cable", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) throw new Error("Failed to authorize realtime connection");

  const { url } = await response.json();
  cable = createCable({ url });
  return cable;
}
```

Use it inside client components that need subscriptions.

## 7. Map it to your app auth model

Recommended production flow:
1. User signs in with your real auth provider.
2. Server verifies that auth session.
3. Server calls `identifier.issue({ sub: user.id, ... })`.
4. Server sets the `token` cookie.
5. Client requests `/api/auth/cable` and connects.

If the app logs out, also clear the `token` cookie so stale realtime sessions cannot reconnect.

# UX rules

- Realtime must enhance the app, not gate core reading flows. Render initial page state from normal server/client data fetching first.
- Show explicit connection states for interactive surfaces: `connecting`, `connected`, `reconnecting`, `offline`, `failed`.
- For chat or collaborative UI, optimistically render only when you also have retry/reconcile logic.
- If `/api/auth/cable` returns 401, treat it as an auth problem and prompt re-authentication rather than silently retrying forever.
- Reconnect automatically on transient network failures, but back off to avoid loops.
- Presence indicators should degrade gracefully; never make them the sole source of truth for access or workflow state.

# Avoid

- Do not expose `ANYCABLE_HTTP_BROADCAST_SECRET` or JWT signing logic to client bundles.
- Do not trust `userId` from the browser in a real app; derive identity from your server-side auth provider/session.
- Do not open raw `CABLE_URL` directly from the browser without first validating auth and appending the signed `jid` token.
- Do not import `components/app/api/cable.ts` into client components; it is server-only config.
- Do not rely on the provided fallback development secrets in production. Require real env vars.
- Do not treat this as a complete chat implementation; channel definitions, authorization rules, and message persistence still need to be built in your AnyCable backend/application layer.

# Verification

## Basic server verification

- `POST /api/auth/session` with a valid authenticated user context returns `200 { ok: true }` and sets a `token` cookie.
- `POST /api/auth/cable` with that cookie returns `200 { url: "ws://.../cable?jid=..." }`.
- `POST /api/auth/cable` without the cookie returns `401`.
- AnyCable can reach `ANYCABLE_RPC_HOST` and receives JSON responses from `/api/anycable`.

## Manual smoke test

1. Start Next.js and AnyCable locally.
2. Create a session:

```bash
curl -i -X POST http://localhost:3000/api/auth/session \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_123","name":"Ada"}'
```

3. Copy the returned `set-cookie` header value and call:

```bash
curl -i -X POST http://localhost:3000/api/auth/cable \
  -H 'Cookie: token=PASTE_TOKEN_HERE'
```

4. Confirm the response includes a cable URL with `?jid=`.
5. From the browser, load a page using `getAuthorizedCable()` and verify the WebSocket connects successfully.
6. Remove or expire the cookie and confirm the client receives 401 and stops connecting.

## Production checklist

- All AnyCable env vars are set with production values.
- Cookie is `httpOnly`, `secure` in production, and cleared on logout.
- Realtime identity is derived from your real auth provider, not raw request JSON.
- Secrets are rotated and stored in a proper secrets manager.
- Connection failures are surfaced in UI and logged server-side.
