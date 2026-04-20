# When to use

Use this dossier when the app needs a chat interface in Next.js but the model orchestration, tools, or inference logic should live in a separate FastAPI service.

Good fit:
- AI assistants embedded in dashboards or app shells
- Teams already using Python for LLM orchestration, RAG, or tool calling
- Apps that want AI SDK React client ergonomics with a non-Node backend

Not a fit:
- Simple marketing pages with no interactive AI surface
- Apps that can keep all AI logic inside Next.js route handlers
- Projects that do not need streaming responses

# How to integrate

## 1. Install the frontend dependencies

This dossier assumes the app uses the AI SDK React hooks on the client.

```bash
npm install ai @ai-sdk/react sonner framer-motion streamdown usehooks-ts clsx tailwind-merge
```

If you do not want markdown rendering, animations, or toast notifications, simplify the kept components accordingly.

## 2. Add a same-origin Next.js API proxy

`useChat` should usually call a local Next.js route such as `/api/chat`, not the FastAPI origin directly. This avoids CORS problems and keeps backend URLs server-side.

Create `app/api/chat/route.ts`:

```ts
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

const FASTAPI_CHAT_URL = process.env.FASTAPI_CHAT_URL;

export async function POST(req: Request) {
  if (!FASTAPI_CHAT_URL) {
    return new Response("Missing FASTAPI_CHAT_URL", { status: 500 });
  }

  const body = await req.json();

  const upstream = await fetch(FASTAPI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return new Response(text || "Upstream chat request failed", {
      status: upstream.status || 500,
    });
  }

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.merge(upstream.body!);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

Add env:

```env
FASTAPI_CHAT_URL=http://localhost:8000/api/chat
```

## 3. Wire `useChat` in a client component

Use the kept `Chat` component as the reference pattern. The important part is that the client submits messages to `/api/chat` and renders `messages[].parts` rather than assuming a plain string response.

Minimal example:

```tsx
"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { useState } from "react";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, stop } = useChat({
    api: "/api/chat",
    onError: (error) => {
      console.error(error);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div>
      <div>
        {messages.map((message: UIMessage) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts?.map((part, i) => {
              if (part.type === "text") return <p key={i}>{part.text}</p>;
              return null;
            })}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <textarea value={input} onChange={(e) => setInput(e.target.value)} />
        {isLoading ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </div>
  );
}
```

## 4. Render message parts, not a single text field

The most important integration detail in this dossier is the message renderer. AI SDK UI messages may contain:
- `text` parts
- `tool-*` parts for tool calls and outputs
- `file` parts for attachments

Pattern:

```tsx
{message.parts?.map((part, index) => {
  if (part.type === "text") {
    return <div key={index}>{part.text}</div>;
  }

  if (part.type?.startsWith("tool-")) {
    const toolName = part.type.replace("tool-", "");

    if (part.state === "output-available") {
      return <pre key={part.toolCallId}>{JSON.stringify(part.output, null, 2)}</pre>;
    }

    return <div key={part.toolCallId}>Running {toolName}…</div>;
  }

  if (part.type === "file") {
    return (
      <a key={index} href={part.url} target="_blank" rel="noreferrer">
        {part.filename ?? "Attachment"}
      </a>
    );
  }

  return null;
})}
```

Do not assume `message.content` or a single assistant string if your backend can emit tools or files.

## 5. Sanitize partial tool states when a stream is stopped

If the user presses Stop while a tool call is in progress, the message list can contain incomplete tool parts. Keep and use the provided `sanitizeUIMessages` helper before persisting or reusing messages.

```ts
import { UIMessage } from "@ai-sdk/react";

export function sanitizeUIMessages(messages: Array<UIMessage>): Array<UIMessage> {
  const messagesBySanitizedParts = messages.map((message) => {
    if (message.role !== "assistant") return message;
    if (!message.parts) return message;

    const sanitizedParts = message.parts.filter((part: any) => {
      if (part.type === "text") return true;
      if (part.type?.startsWith("tool-")) {
        return part.state === "output-available";
      }
      return true;
    });

    return {
      ...message,
      parts: sanitizedParts,
    };
  });

  return messagesBySanitizedParts.filter((message) => {
    if (!message.parts || message.parts.length === 0) return false;

    return message.parts.some((part: any) => {
      if (part.type === "text" && part.text?.length > 0) return true;
      if (part.type?.startsWith("tool-") && part.state === "output-available") return true;
      return false;
    });
  });
}
```

Use it when stopping generation:

```tsx
stop();
setMessages((messages) => sanitizeUIMessages(messages));
```

## 6. FastAPI backend contract

The FastAPI endpoint must accept the request shape sent by the client and return a streamed response in the AI SDK UI message stream format expected by `createUIMessageStreamResponse` / `writer.merge(...)`.

At minimum, the backend should:
- accept POST JSON
- stream chunks instead of buffering the entire completion
- emit tool/file events only if the frontend knows how to render them
- return proper non-200 statuses for rate limiting and validation errors

If the backend returns plain JSON instead of a compatible stream, `useChat` will not behave correctly.

# UX rules

- Keep chat state local to the feature unless there is a real need for persistence.
- Show a visible loading/thinking state while streaming.
- Support Stop during generation.
- Disable empty submits.
- Allow multiline input with `Shift+Enter`; submit on `Enter`.
- Persist unsent draft text locally if the chat is a primary workflow.
- Render assistant markdown safely and consistently if markdown is enabled.
- If tool outputs are shown, present them as structured UI for known tools and fallback JSON for unknown tools.
- Surface rate-limit errors clearly; the source template specifically handles `Too many requests`.

# Avoid

- Do not expose the FastAPI origin directly in client components unless you intentionally want browser-to-backend traffic and have CORS configured.
- Do not keep template-specific demo UI such as branded navbars, overview screens, weather cards, or sample prompts unless the product actually needs them.
- Do not hardcode a static chat id like `001` if multiple chats or persistence are required.
- Do not assume all assistant output is text.
- Do not persist incomplete tool call parts after interruption.
- Do not put backend secrets in Next.js client env vars.

# Verification

1. Start FastAPI locally and confirm the chat endpoint streams.
2. Start Next.js with `FASTAPI_CHAT_URL` set.
3. Submit a prompt and verify tokens appear progressively, not all at once.
4. Press Stop mid-response and verify the UI does not retain broken partial tool states.
5. If the backend emits tool results, verify known tools render correctly and unknown ones fall back gracefully.
6. Temporarily force a 429 from the backend and verify the UI shows a useful error.
7. Confirm no client code contains the raw backend secret or private service URL unless intentionally public.
