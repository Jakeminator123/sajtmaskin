# When to use

Use this dossier when the site should work as a **ChatGPT app** embedded in the ChatGPT client, while still being a normal Next.js app in the browser.

Choose it when you need:
- an MCP endpoint that exposes tools to ChatGPT
- iframe-safe client behavior inside the ChatGPT host
- cross-origin support for requests from the ChatGPT container
- safe handling of outbound links via the OpenAI client bridge

Do **not** use it for a plain chat UI that only calls an LLM API directly from your app. This dossier is specifically for the **embedded ChatGPT app + MCP** pattern.

# How to integrate

## 1) Keep the global ChatGPT bootstrap in the root layout

Your root layout should inject a small bootstrap into `<head>` so the app behaves correctly when embedded. It should:
- set `<base href>` to the app base URL
- detect whether `window.openai` exists
- normalize `pushState` / `replaceState`
- proxy same-origin fetches to the deployed app origin when iframe-hosted
- route external links through `window.openai.openExternal()` when available

Use this pattern in `app/layout.tsx`:

```tsx
import type { Metadata } from "next";

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "My ChatGPT App",
  description: "Embedded ChatGPT app built with Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <NextChatSDKBootstrap baseUrl={baseURL} />
      </head>
      <body>{children}</body>
    </html>
  );
}

function NextChatSDKBootstrap({ baseUrl }: { baseUrl: string }) {
  return (
    <>
      <base href={baseUrl} />
      <script>{`window.innerBaseUrl = ${JSON.stringify(baseUrl)}`}</script>
      <script>{`window.__isChatGptApp = typeof window.openai !== "undefined";`}</script>
    </>
  );
}
```

If you already have a root layout, merge this behavior into it rather than creating a second layout.

## 2) Add permissive CORS middleware

The embedded app may be loaded from a different origin than the deployed app. Keep middleware that answers preflight requests and sets CORS headers:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "*");
    return response;
  }

  return NextResponse.next({
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export const config = {
  matcher: "/:path*",
};
```

If your app has authenticated endpoints, tighten this instead of using `*` globally.

## 3) Create an MCP route

Add a route handler that exposes tools using `mcp-handler`.

```ts
import { z } from "zod";
import { createMcpHandler } from "mcp-handler";

const handler = createMcpHandler(
  async (server) => {
    server.tool(
      "echo",
      "Echo back a short message",
      { message: z.string().min(1).max(500) },
      async ({ message }) => ({
        content: [{ type: "text", text: `Echo: ${message}` }],
      })
    );
  },
  {},
  { basePath: "/api/mcp" }
);

export { handler as GET, handler as POST, handler as DELETE };
```

Replace the example tool with domain-specific tools. Keep tool names stable because ChatGPT integrations depend on them.

## 4) Use absolute deployment URL for the base URL

Set a canonical public URL and use it consistently.

Example:

```env
NEXT_PUBLIC_APP_URL=https://your-app.example.com
```

Then derive:

```ts
const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
```

Do not hardcode localhost in production builds.

## 5) Design MCP tools for structured inputs and small outputs

Use Zod schemas for every tool input. Example:

```ts
server.tool(
  "lookup_order",
  "Look up an order by ID",
  {
    orderId: z.string().min(1),
  },
  async ({ orderId }) => {
    const order = await getOrder(orderId);

    if (!order) {
      return {
        content: [{ type: "text", text: "Order not found." }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Order ${order.id}: ${order.status}, total ${order.total}`,
        },
      ],
    };
  }
);
```

Prefer concise, deterministic tool results over large free-form payloads.

# UX rules

- Build pages that still work outside ChatGPT in a normal browser.
- Keep navigation simple and resilient inside an iframe.
- Prefer internal links and relative app routes.
- For outbound links, let the bootstrap delegate to `window.openai.openExternal()` when available.
- Expect the app to be embedded in constrained space; avoid layout assumptions that require full viewport control.
- Keep tool effects explicit in the UI if users can trigger them manually.
- Treat `window.openai` as optional; the app must not crash when it is absent.

# Avoid

- Do not remove the bootstrap script from the root layout.
- Do not assume same-origin fetch behavior when embedded.
- Do not rely on raw browser navigation behavior for every link click.
- Do not expose broad unauthenticated tools that perform destructive actions.
- Do not return huge tool payloads when a short structured answer is enough.
- Do not rename or relocate the MCP route without updating the integration configuration that points to it.
- Do not leave generic metadata like `Create Next App` in production.

# Verification

1. Start the app locally and confirm normal browser rendering works.
2. Send an `OPTIONS` request to any route and verify CORS headers are returned.

```bash
curl -i -X OPTIONS http://localhost:3000/api/mcp
```

3. Verify the MCP route responds for GET/POST at the configured path.
4. Confirm the root HTML includes:
   - a `<base href="...">`
   - `window.__isChatGptApp`
   - the bootstrap script
5. In a normal browser, ensure the app works when `window.openai` is undefined.
6. In the ChatGPT host, confirm:
   - internal navigation does not break
   - API requests resolve against the deployed app origin
   - external links open through the host client
7. Exercise each MCP tool with valid and invalid inputs and verify schema validation behaves as expected.
