# When to use

Use this dossier when the app needs to expose an MCP-compatible HTTP endpoint in Next.js and you want two things handled correctly:

1. request/session/error event emission for observability
2. reconstruction of the public origin when deployed behind Vercel, Cloudflare, nginx, or another reverse proxy

This is most useful for AI app shells, dashboards, or internal tools that expose MCP tools/resources to an external client.

# How to integrate

## 1) Keep the shared server utilities

- `src/lib/log-helper.ts` defines the MCP event shapes
- `src/lib/event-emitter.ts` emits lifecycle events for requests and sessions
- `src/lib/url.ts` derives the public origin/URL from proxy headers

These files should stay server-side.

## 2) Create an MCP route handler

Add a route such as `app/api/mcp/route.ts` and wrap request handling with event emission.

```ts
import { EventEmittingResponse } from "@/src/lib/event-emitter";
import { getPublicUrl } from "@/src/lib/url";

export const runtime = "nodejs";

async function handleMcpRequest(req: Request) {
  const publicUrl = getPublicUrl(req);

  // Initialize or call your MCP server here.
  // Use publicUrl/origin when the server needs to advertise callback URLs,
  // stream URLs, or self-referential endpoints.
  return Response.json({ ok: true, endpoint: publicUrl.toString() });
}

export async function POST(req: Request) {
  const events = new EventEmittingResponse(undefined as never, (event) => {
    console.log(JSON.stringify(event));
  });

  events.startSession("HTTP", {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  try {
    const body = await req.clone().json().catch(() => undefined);
    const method = typeof body?.method === "string" ? body.method : "unknown";

    events.requestReceived(method, body?.params);
    const result = await handleMcpRequest(req);
    events.requestCompleted(method);

    return result;
  } catch (error) {
    events.error(
      error instanceof Error ? error : String(error),
      "Unhandled MCP request error",
      "request"
    );

    return Response.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    events.endSession("HTTP");
  }
}
```

## 3) Log events to your real sink

The emitter only standardizes event objects. Send them to your preferred sink: console, structured logs, Redis pub/sub, a database, or an observability vendor.

```ts
const events = new EventEmittingResponse(undefined as never, (event) => {
  console.log(JSON.stringify(event));
  // or await logStore.write(event)
});
```

Important event types:

- `SESSION_STARTED`
- `SESSION_ENDED`
- `REQUEST_RECEIVED`
- `REQUEST_COMPLETED`
- `ERROR`

## 4) Use public URL helpers anywhere absolute URLs are needed

Never trust `req.url` alone in a proxied deployment if the endpoint must be externally reachable.

```ts
import { getPublicOrigin, getPublicUrl } from "@/src/lib/url";

export async function GET(req: Request) {
  const origin = getPublicOrigin(req);
  const url = getPublicUrl(req);

  return Response.json({ origin, url: url.toString() });
}
```

This helper respects:

- `x-forwarded-host`
- `x-forwarded-proto`
- `forwarded`

and falls back to `new URL(req.url).origin`.

## 5) Prefer Node runtime for this integration

`EventEmittingResponse` extends Node's `ServerResponse`, so route handlers using it should run with:

```ts
export const runtime = "nodejs";
```

Do not place this pattern in Edge runtime code.

# UX rules

- MCP endpoints should return stable machine-readable responses.
- Do not expose stack traces or raw internal errors to clients.
- Log enough metadata to debug requests: method, params shape, duration, session ID, request ID.
- If you surface endpoint URLs to clients, always derive them from `getPublicUrl()` or `getPublicOrigin()`.
- Keep logging and transport wiring invisible to end users; this dossier is infrastructure, not UI.

# Avoid

- Do not use these server utilities in client components.
- Do not rely on localhost/internal hostnames when generating absolute URLs.
- Do not run `EventEmittingResponse` in Edge runtime.
- Do not log secrets, auth tokens, full cookies, or sensitive prompt data.
- Do not emit success events before the handler actually finishes.

# Verification

## Basic route verification

Call the route locally:

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{"method":"tools/list","params":{}}'
```

Expected:

- JSON response from the route
- structured logs for `SESSION_STARTED`, `REQUEST_RECEIVED`, `REQUEST_COMPLETED`, `SESSION_ENDED`

## Proxy header verification

Test forwarded origin handling:

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -H 'x-forwarded-host: example.com' \
  -H 'x-forwarded-proto: https' \
  -d '{"method":"ping"}'
```

Expected advertised URL/origin should use `https://example.com`, not `http://localhost:3000`.

## Error-path verification

Force a handler failure and confirm:

- client gets a safe `500` response
- an `ERROR` event is emitted
- no sensitive internals are returned to the client

## Runtime verification

Confirm the route declares:

```ts
export const runtime = "nodejs";
```

If omitted and moved to Edge, `ServerResponse`-based code is not valid.
