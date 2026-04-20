# When to use

Use this dossier when the app needs **server-side browser automation** in a real browser, driven by natural-language instructions.

Typical cases:
- scrape structured data from third-party sites
- automate internal back-office workflows
- run browser-agent tasks from a dashboard
- perform multi-step browser actions before returning data to the UI

Use Stagehand only for tasks that genuinely require a browser. If a normal HTTP API or direct SDK call is available, prefer that instead.

# How to integrate

## 1) Install the provider packages

Install Stagehand and its runtime dependencies using the package versions appropriate for the target project.

```bash
npm install @browserbasehq/stagehand zod pino
```

If the app already contains Stagehand core files from this dossier, keep them in server/shared code only.

## 2) Add environment variables

Minimum useful setup:

```env
BROWSERBASE_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
GROQ_API_KEY=""
CEREBRAS_API_KEY=""
HEADLESS=false
ENABLE_CACHING=false
STAGEHAND_MODEL="gpt-4o"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Notes:
- `BROWSERBASE_API_KEY` is required for Browserbase-backed remote browser sessions.
- At least one model key is required for LLM-driven act/extract/observe flows.
- The draft template included eval-related env vars; those are not required for normal product integration.

## 3) Keep Stagehand execution on the server

Do **not** initialize Stagehand in a Client Component.

Create a Route Handler or Server Action. A Route Handler is the safest baseline:

```ts
// app/api/stagehand/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { instruction, url } = await req.json();

  const { Stagehand } = await import("@browserbasehq/stagehand");

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    modelName: process.env.STAGEHAND_MODEL || "gpt-4o",
    headless: process.env.HEADLESS !== "false",
    enableCaching: process.env.ENABLE_CACHING === "true",
    verbose: 1,
  });

  await stagehand.init();

  if (url) {
    await stagehand.page.goto(url);
  }

  const result = await stagehand.page.extract({ instruction });

  await stagehand.close();

  return NextResponse.json({ ok: true, result });
}
```

Always set:

```ts
export const runtime = "nodejs";
```

Do not target the Edge runtime for browser automation.

## 4) Trigger from a server action or form flow

A server action can call the route:

```ts
"use server";

export async function runStagehandTask(input: {
  instruction: string;
  url?: string;
}) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/stagehand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Stagehand task failed");
  return res.json();
}
```

If the runtime LLM prefers, it can call Stagehand directly inside the server action instead of going through an internal fetch.

## 5) Use the included core utilities when you need lower-level control

This dossier includes core prompt and inference helpers:
- `packages/core/lib/inference.ts`
- `packages/core/lib/prompt.ts`
- `packages/core/lib/logger.ts`
- `packages/core/lib/utils.ts`

Use them when building custom `act`, `observe`, or `extract` pipelines instead of only using a high-level `page.extract()` helper.

Example shape for a lower-level extraction flow:

```ts
import { extract } from "@/packages/core/lib/inference";
import { z } from "zod";

const schema = z.object({
  title: z.string(),
  price: z.string().optional(),
});

const result = await extract({
  instruction: "Extract the product title and price",
  domElements: accessibilityTreeString,
  schema,
  llmClient,
  logger: () => {},
});
```

## 6) Prefer explicit schemas for extraction

Use Zod schemas for structured output.

```ts
import { z } from "zod";

const ContactSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  company: z.string().optional(),
});
```

This gives more reliable outputs than asking for free-form text.

## 7) Close browser sessions reliably

Wrap runs in `try/finally` when directly managing Stagehand instances.

```ts
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY,
});

try {
  await stagehand.init();
  await stagehand.page.goto("https://example.com");
  const result = await stagehand.page.extract({ instruction: "Extract the page title" });
  return result;
} finally {
  await stagehand.close().catch(() => {});
}
```

# UX rules

- Run Stagehand tasks from explicit user intent: button click, form submit, admin workflow, scheduled job.
- Show loading state for long-running browser tasks.
- Return intermediate progress when possible for tasks that may take more than a few seconds.
- For user-facing apps, explain that the app is visiting a website or running a browser task.
- Keep secrets server-only. Never expose provider API keys in client bundles.
- For extraction UIs, present structured results first and raw logs second.
- For action UIs, require confirmation before doing irreversible tasks like submitting forms, deleting data, or making purchases.

# Avoid

- Do not run Stagehand in the browser.
- Do not use Edge runtime.
- Do not treat all env vars from the template as required; eval/Brainttrust settings are optional and usually unnecessary.
- Do not use browser automation when a direct API exists.
- Do not leave sessions open after errors.
- Do not send sensitive credentials back to the client.
- Do not build flows that depend on brittle visual selectors when accessible structure or semantic targeting is available.
- Do not assume one model provider only; Stagehand utilities in this dossier support multiple provider env conventions.

# Verification

## Smoke test the route

Start the app and POST a simple extraction task:

```bash
curl -X POST http://localhost:3000/api/stagehand \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","instruction":"Extract the page title"}'
```

Expected outcome:
- HTTP 200 response
- JSON payload with `ok: true`
- structured extraction result

## Verify server-only execution

- no provider secret appears in client code
- route or action is marked `runtime = "nodejs"` when applicable
- no `use client` file imports Stagehand server code

## Verify cleanup

Force an error during navigation or extraction and confirm:
- the request returns a controlled error
- browser/session cleanup still runs
- logs capture the failure context

## Verify schema reliability

If using `extract()` with Zod:
- test success with expected page content
- test missing-field behavior
- confirm returned data matches schema shape exactly
