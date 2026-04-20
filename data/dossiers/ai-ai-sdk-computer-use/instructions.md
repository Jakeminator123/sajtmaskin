# When to use

Use this dossier when the product needs an AI agent that can:

- operate a remote browser or desktop session
- run shell commands in an isolated environment
- stream intermediate tool usage back to the user
- complete multi-step tasks like navigating websites, filling forms, inspecting pages, or editing files

This is not a normal text chatbot. It is for **sandboxed computer control** backed by an LLM and a remote execution environment.

# How to integrate

## 1) Required environment variables

```env
ANTHROPIC_API_KEY=...
SANDBOX_SNAPSHOT_ID=...
```

Optional auth for Vercel Sandbox may also be required depending on deployment setup:

```env
VERCEL_OIDC_TOKEN=...
# or
VERCEL_TOKEN=...
VERCEL_TEAM_ID=...
VERCEL_PROJECT_ID=...
```

## 2) Add the chat route

Create a streaming route that calls Anthropic through the AI SDK and exposes two tools: `computer` and `bash`.

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type UIMessage } from "ai";
import { bashTool, computerTool } from "@/lib/sandbox/tool";
import { killDesktop } from "@/lib/sandbox/utils";
import { prunedMessages } from "@/lib/utils";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages, sandboxId }: { messages: UIMessage[]; sandboxId: string } =
    await req.json();

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system:
        "You are a helpful assistant with access to a computer. " +
        "Use the computer tool to help the user with their requests. " +
        "Use the bash tool to execute commands on the computer. Always prefer the bash tool where viable.",
      messages: prunedMessages(messages),
      tools: {
        computer: computerTool(sandboxId),
        bash: bashTool(sandboxId),
      },
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    await killDesktop(sandboxId);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
```

## 3) Provision a sandbox before starting chat

The UI should create a sandbox session once per task or conversation, then send `sandboxId` with each chat request.

```ts
export async function POST() {
  const sandbox = await createSandbox();
  return Response.json({ sandboxId: sandbox.sandboxId });
}
```

Client flow:

1. call `/api/sandbox`
2. store returned `sandboxId`
3. include `sandboxId` in `/api/chat` requests
4. call `/api/kill-desktop?sandboxId=...` when the user ends the session

## 4) Implement sandbox utilities

Keep sandbox operations server-only.

```ts
import { Sandbox } from "@vercel/sandbox";

export async function getSandbox(sandboxId: string) {
  return Sandbox.connect(sandboxId);
}

export async function createSandbox() {
  return Sandbox.create({
    snapshotId: process.env.SANDBOX_SNAPSHOT_ID!,
  });
}

export async function killDesktop(sandboxId: string) {
  const sandbox = await getSandbox(sandboxId);
  await sandbox.stop();
}
```

## 5) Redact screenshot results before sending conversation history back to the model

Computer-use loops can explode token usage if screenshots are kept in history. Replace screenshot tool results with a short text marker.

```ts
import { type UIMessage } from "ai";

export const prunedMessages = (messages: UIMessage[]): UIMessage[] => {
  if (messages.at(-1)?.role === "assistant") return messages;

  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (
        part.type === "tool-invocation" &&
        part.toolInvocation.toolName === "computer" &&
        part.toolInvocation.args.action === "screenshot"
      ) {
        return {
          ...part,
          toolInvocation: {
            ...part.toolInvocation,
            result: {
              type: "text",
              text: "Image redacted to save input tokens",
            },
          },
        };
      }
      return part;
    }),
  }));
};
```

## 6) Add a cleanup endpoint

```ts
import { killDesktop } from "@/lib/sandbox/utils";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const sandboxId = searchParams.get("sandboxId");

  if (!sandboxId) {
    return new Response("No sandboxId provided", { status: 400 });
  }

  await killDesktop(sandboxId);
  return new Response("Desktop killed successfully", { status: 200 });
}
```

# UX rules

- Make it explicit that the agent is controlling a remote environment, not the user's local machine.
- Show session state: creating sandbox, active, busy, failed, terminated.
- Provide a visible **Stop session** or **End task** action that calls the cleanup route.
- Stream tool activity or status updates so long-running actions do not look stuck.
- Warn users that pages may need time to load and that the agent may wait between steps.
- Scope the task clearly. Computer-use agents perform better with concrete goals and constraints.
- If you render screenshots or live previews, label them as sandbox output.

# Avoid

- Do not expose Vercel Sandbox credentials or connect directly from the browser.
- Do not omit sandbox cleanup; orphaned sessions waste resources.
- Do not resend raw screenshot payloads in the full message history on every turn.
- Do not treat this as a general-purpose site feature for marketing pages; it belongs in authenticated app flows, internal tools, or operator dashboards.
- Do not hardcode template-specific metadata, fonts, analytics, or demo UI into the integration.
- Do not assume the browser is immediately ready after session creation; handle startup latency.

# Verification

- Confirm `ANTHROPIC_API_KEY` and `SANDBOX_SNAPSHOT_ID` are set.
- POST to `/api/sandbox` and verify you receive a `sandboxId`.
- Send a chat request with that `sandboxId` and a simple task like: `Open example.com and tell me the page title`.
- Verify the response streams rather than waiting for a single final payload.
- Verify tool calls succeed for both browser actions and shell commands.
- Trigger `/api/kill-desktop?sandboxId=...` and confirm the sandbox is terminated.
- Inspect server logs for failures related to sandbox auth, startup, or model tool execution.
- Confirm message history does not retain full screenshot blobs across turns.
