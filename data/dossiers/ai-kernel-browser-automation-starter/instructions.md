# When to use

Use this integration when your app needs to:

- launch a remote browser session from a Next.js server route
- let users trigger browser tasks with natural language
- execute Playwright actions inside a managed browser session
- inspect multi-step agent execution results for debugging or UX playback

Good fits:

- internal ops tools
- research assistants
- QA/testing dashboards
- automation workbenches

Do **not** use this dossier for simple chat, static scraping without browser interaction, or client-side-only AI features.

# How to integrate

## 1) Install and configure

Required env vars:

```env
KERNEL_API_KEY=your_kernel_api_key
OPENAI_API_KEY=your_openai_api_key
```

Expected packages:

```ts
@onkernel/sdk
@onkernel/ai-sdk
@ai-sdk/openai
ai
zod
playwright-core
```

## 2) Add server routes

Create a route to provision a browser session:

```ts
// app/api/create-browser/route.ts
import { NextResponse } from "next/server";
import { Kernel } from "@onkernel/sdk";

export async function POST() {
  const apiKey = process.env.KERNEL_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "KERNEL_API_KEY environment variable is not set" },
      { status: 400 }
    );
  }

  try {
    const kernel = new Kernel({ apiKey });
    const browser = await kernel.browsers.create({
      stealth: true,
      headless: false,
    });

    return NextResponse.json({
      success: true,
      sessionId: browser.session_id,
      liveViewUrl: browser.browser_live_view_url,
      cdpWsUrl: browser.cdp_ws_url,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create browser",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
```

Create a route to run agentic browser actions:

```ts
// app/api/agent/route.ts
import { openai } from "@ai-sdk/openai";
import { playwrightExecuteTool } from "@onkernel/ai-sdk";
import { Kernel } from "@onkernel/sdk";
import { Experimental_Agent as Agent, stepCountIs } from "ai";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { sessionId, task } = await req.json();

    if (!sessionId || !task) {
      return Response.json(
        { error: "Missing sessionId or task" },
        { status: 400 }
      );
    }

    const kernelApiKey = process.env.KERNEL_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!kernelApiKey || !openaiApiKey) {
      return Response.json(
        { error: "Missing KERNEL_API_KEY or OPENAI_API_KEY" },
        { status: 400 }
      );
    }

    const kernel = new Kernel({ apiKey: kernelApiKey });

    const agent = new Agent({
      model: openai("gpt-5.1"),
      tools: {
        playwright_execute: playwrightExecuteTool({
          client: kernel,
          sessionId,
        }),
      },
      stopWhen: stepCountIs(20),
      system: `You are a browser automation expert with access to a Playwright execution tool.

If no URL is provided, inspect the current page first.
If a URL is provided, navigate there before interacting.
Use robust selectors and return the requested result.
Break complex tasks into small steps.`,
    });

    const { text, steps, usage } = await agent.generate({ prompt: task });

    return Response.json({
      success: true,
      response: text,
      steps,
      stepCount: steps.length,
      usage,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute agent",
      },
      { status: 500 }
    );
  }
}
```

Create a route to close the browser session:

```ts
// app/api/delete-browser/route.ts
import { Kernel, NotFoundError } from "@onkernel/sdk";

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const apiKey = process.env.KERNEL_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "KERNEL_API_KEY not configured" },
        { status: 500 }
      );
    }

    const kernel = new Kernel({ apiKey });

    try {
      await kernel.browsers.deleteByID(sessionId);
      return Response.json({ success: true });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return Response.json({ success: true });
      }
      throw error;
    }
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close browser session",
      },
      { status: 500 }
    );
  }
}
```

## 3) Call the routes from your UI

Minimal usage flow:

1. `POST /api/create-browser`
2. store the returned `sessionId`
3. `POST /api/agent` with `{ sessionId, task }`
4. optionally show `liveViewUrl` in the UI
5. `POST /api/delete-browser` when the task ends or the user leaves

Example client calls:

```ts
const browser = await fetch("/api/create-browser", { method: "POST" }).then(r => r.json());

const result = await fetch("/api/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: browser.sessionId,
    task: "Open example.com and return the page title",
  }),
}).then(r => r.json());

await fetch("/api/delete-browser", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sessionId: browser.sessionId }),
});
```

## 4) Persist session lifecycle intentionally

If the user can run multiple tasks against the same browser, keep one `sessionId` per active workspace/thread/tab and only destroy it when the user explicitly ends the session or after inactivity.

If tasks are one-shot, create and delete a browser per task.

## 5) Surface execution details

The agent route should return structured step data so the UI can show:

- tool calls
- generated Playwright code
- tool results
- final answer
- token usage / step count

This is especially useful for debugging failed automations.

# UX rules

- Always show whether a browser session is active.
- Provide a clear “End session” or “Close browser” action.
- If `liveViewUrl` is available, expose it as a link or embedded panel for transparency.
- Treat browser creation as a potentially slow step; show loading and elapsed-time feedback.
- Show intermediate steps for long tasks rather than only the final answer.
- Warn users that automations may interact with third-party sites and sensitive data.
- If the task can modify external systems, require explicit user confirmation before running.
- Reuse a session only when continuity is useful; otherwise prefer short-lived sessions.

# Avoid

- Do not expose `KERNEL_API_KEY` or `OPENAI_API_KEY` to the client.
- Do not run Kernel SDK calls directly in client components.
- Do not leave browser sessions open indefinitely; clean them up.
- Do not rely on brittle CSS selectors when prompting the agent; prefer role/text/label-based interactions.
- Do not assume every task starts from a known URL; either navigate explicitly or inspect current page context first.
- Do not hide failures; return useful error payloads and step traces.
- Do not hardcode template-specific deployment links, branding, metadata, or analytics into the integration.

# Verification

## Manual checks

1. Set `KERNEL_API_KEY` and `OPENAI_API_KEY`.
2. Start the app.
3. `POST /api/create-browser` and confirm a `sessionId` is returned.
4. Send `POST /api/agent` with a simple task such as:

```json
{
  "sessionId": "<session-id>",
  "task": "Go to https://example.com and return the page title"
}
```

5. Confirm the response includes:
   - `success: true`
   - a natural-language `response`
   - step data
   - nonzero `stepCount`
6. Call `POST /api/delete-browser` with the same `sessionId`.
7. Confirm repeated deletion is handled gracefully.

## Failure checks

- Remove `KERNEL_API_KEY` and confirm create/agent routes fail with a clear configuration error.
- Remove `OPENAI_API_KEY` and confirm the agent route fails before execution.
- Send a request without `sessionId` and confirm a `400` response.
- Send an impossible task and confirm the route returns a readable failure instead of hanging silently.

## Production readiness

Before shipping, verify:

- route timeout is high enough for long automations
- browser sessions are cleaned up on user cancellation and inactivity
- your UI displays execution state and errors clearly
- sensitive prompts and results are logged carefully or redacted as needed
