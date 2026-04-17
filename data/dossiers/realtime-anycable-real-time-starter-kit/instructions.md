# When to use

Use AnyCable when the app needs low-latency realtime features in Next.js and you want a self-hosted or open infrastructure option instead of a hosted realtime SaaS. Typical fits: chat, live comments, presence, activity feeds, notifications, collaborative dashboards, and pub/sub updates.

This dossier covers the **Next.js-side integration points**:
- an AnyCable RPC endpoint for server-side command handling
- a cookie/JWT-based cable auth flow
- the environment variables required to connect to the AnyCable server and HTTP broadcaster

# How to integrate

## 1) Install and configure environment variables

Required env vars:

```env
CABLE_URL=ws://localhost:8080/cable
ANYCABLE_RPC_HOST=http://localhost:3000/api/anycable
ANYCABLE_HTTP_BROADCAST_URL=http://localhost:8090/_broadcast
ANYCABLE_HTTP_BROADCAST_SECRET=secr3t
ANYCABLE_JWT_ID_KEY=jt1
```

Use `CABLE_URL` for the websocket endpoint clients connect to. `ANYCABLE_RPC_HOST` is the URL your AnyCable server uses to call your Next.js RPC handler. `ANYCABLE_HTTP_BROADCAST_*` is used by server-side broadcasting code. `ANYCABLE_JWT_ID_KEY` should identify the signing key version; keep it stable unless rotating keys.

## 2) Add shared AnyCable config

Create `app/api/cable.ts` to centralize token issuing/verification and cable config:

```ts
import { jwtVerify, SignJWT } from "jose";
import { createCable } from "@anycable/core";

const encoder = new TextEncoder();
const secret = encoder.encode(process.env.ANYCABLE_HTTP_BROADCAST_SECRET || "development-secret");

export const CABLE_URL = process.env.CABLE_URL || "ws://localhost:8080/cable";
export const cable = createCable({ url: CABLE_URL });

export const identifier = {
  async issue(claims: { sub: string; name?: string }) {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: process.env.ANYCABLE_JWT_ID_KEY || "default" })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);
  },
  async verify(token: string) {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.sub !== "string") throw new Error("Invalid token");
    return payload;
  },
};
```

## 3) Expose the AnyCable RPC route

Keep `app/api/anycable/route.ts` as the endpoint AnyCable calls:

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

If your app uses a different exported object than `app`, adjust the import, but preserve the `handler(request, app)` pattern.

## 4) Add a session route that sets the auth cookie

Your app needs some login/session bootstrap point that stores a signed token in a cookie. A generic version:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { identifier } from "../../cable";

export async function POST(request: Request) {
  const body = await request.json();
  const token = await identifier.issue({ sub: body.userId, name: body.name });

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

In a real app, issue this token only after your normal auth layer has already verified the user.

## 5) Keep the cable auth endpoint

Clients should not construct authenticated cable URLs themselves. Instead, request a server endpoint that verifies the cookie and returns a websocket URL with the token attached:

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

## 6) Connect the client after fetching the cable URL

Client components should fetch the authenticated cable URL from the server, then connect:

```ts
const response = await fetch("/api/auth/cable", { method: "POST" });
if (!response.ok) throw new Error("Unauthorized");

const { url } = await response.json();

// Example: pass `url` into your AnyCable client setup.
// Keep the connection logic in a client component or browser-only module.
```

Do not hardcode a JWT in client code.

## 7) Protect pages separately from realtime auth

This dossier does not require a specific global middleware strategy. If a route must be protected, use your app's existing auth system or add route-specific checks. Only add `middleware.ts` if you intentionally want request-time redirects.

# UX rules

- Hide realtime controls until the auth/cable endpoint succeeds.
- Show connection states: connecting, live, reconnecting, offline.
- Optimistically render messages or updates only if your domain can tolerate rollback.
- Preserve user context during reconnects; do not silently drop draft input.
- For chat or feeds, always render timestamps and a visible retry path if sending fails.

# Avoid

- Do not keep template-specific OG routes, branded layouts, or demo room pages in this dossier.
- Do not expose broadcast secrets or JWT signing material to the browser.
- Do not use the sample middleware unchanged; it references template paths and assumes a specific `/auth` page.
- Do not treat `ANYCABLE_HTTP_BROADCAST_SECRET` as a general-purpose app secret unless you explicitly choose that design.
- Do not let anonymous users hit authenticated channels unless that is an intentional product requirement.

# Verification

## Basic checks

1. Start the Next.js app and AnyCable server.
2. Confirm the AnyCable server can reach `POST /api/anycable`.
3. Call your session route to set the `token` cookie.
4. Call `POST /api/auth/cable` and verify it returns JSON like:

```json
{ "url": "ws://localhost:8080/cable?jid=..." }
```

5. Remove the cookie and verify the same endpoint returns `401`.

## Realtime checks

- Open two browser sessions and verify messages or broadcasts appear in both.
- Expire or delete the auth cookie and verify reconnect attempts fail cleanly.
- Rotate `CABLE_URL` or stop the websocket server and confirm the UI shows a disconnected state instead of hanging silently.

## Production checks

- Ensure websocket URLs use `wss://` behind HTTPS.
- Ensure cookies are `httpOnly` and `secure` in production.
- Ensure secrets are set in deployment, not left at fallback defaults.
- Ensure your AnyCable deployment is configured to call the same `ANYCABLE_RPC_HOST` you exposed from Next.js.
