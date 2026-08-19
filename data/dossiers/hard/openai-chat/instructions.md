# When to use

Use this dossier when the brief declares the `ai-chat` capability — the site needs a conversational assistant powered by an LLM.

Best fit:

- A "Talk to our AI" widget on a SaaS landing page.
- A product help-bot that answers FAQ-style questions.
- A guided onboarding flow where the user describes their need and the bot suggests next steps.

Do not use it for:

- Image generation (no capability id — parked 2026-08-06; treat as ordinary content).
- Pure information lookup with no conversation (a search box is better).

## RAG / tool-calling asks land here — deliver them HONESTLY

Since 2026-08-06 (etapp 4) there is no separate RAG or tool-calling dossier:
an ask like "chatbot that answers from our documents" or "AI assistant with
tools" selects THIS dossier as its chat surface. That fold is deliberate — but
the surface must never overpromise:

- The shipped route is plain `streamText`: **no retrieval, no vector store, no
  tool execution.** Do not wire fake "sources"/tool UI, and do not write a
  system prompt that claims the bot reads the site's documents or performs
  actions (see the honesty rule below).
- You MAY paste site content (FAQ, product facts) into the system prompt as
  static context — that is honest and often covers the practical need.
- If the user's ask genuinely requires real retrieval or tool execution,
  build the standard chat surface and describe the gap in prose — never a
  half-working imitation.

# How to integrate

1. Place `<ChatPanel />` somewhere in the page tree — a sidebar, a modal, a dedicated `/chat` route, etc. The component is fully self-contained and uses AI SDK **6** (`ai@^6`, `@ai-sdk/react@3`) `useChat` with `DefaultChatTransport({ api: "/api/chat" })` from `ai`.
2. The transport posts to `/api/chat` and streams UI-message parts back. Do **not** use the v4 `useChat({ api })` / `handleInputChange` / `append` shape — it 500s against this route. Manage input with local `useState` and call `sendMessage({ text })`. On the server, always `await convertToModelMessages(messages)` before passing the resulting `ModelMessage[]` to `streamText`; the conversion is async in AI SDK 6.
3. **Re-style the panel freely.** Avatars, layout, colors, message rendering, autoscroll behavior — all rewritable. Keep the `/api/chat` transport target. Only the `route.ts` file must stay verbatim (the streaming protocol depends on the exact response format).
4. Configure the **system prompt** in `route.ts` to match the site's persona — this is the single most important integration step. Generic `You are a helpful assistant` is a sign of incomplete adaptation.

# Ownership and response contract

This dossier owns the chat surface for the `ai-chat` capability. When it is
added to a project that already has a chat widget you built yourself in an
earlier round, exactly one implementation may be live afterwards: either point
your existing UI at `/api/chat` (the dossier's route) or replace it with
`<ChatPanel />`. Never keep both, and never add a second chat endpoint next to
`app/api/chat/route.ts`.

The response contract is the AI SDK **UI-message stream**, consumed by AI SDK 6
`useChat` + `DefaultChatTransport` — not a JSON envelope. Do not hand-roll an
endpoint that answers `{ reply: "..." }` and do not read `data.reply` on the
client: render text from `message.parts` (`type === "text"`).

If your own code does read a value that TypeScript types as
`string | undefined`, narrow it before use (`if (!value) return;` or
`value ?? ""`). Passing it straight into a `string` parameter is the exact
`TS2345` that fails the F3 build — a hand-rolled `data.reply` was how it
happened in production (chat `747636c8`, 2026-07-13).

# Mock/demo mode

`mock: canned`. The `route.ts` handler detects when there is no real
`OPENAI_API_KEY` (missing OR a preview stub value containing `placeholder` /
`not_real`) and, instead of calling OpenAI, streams a short canned Swedish demo
reply over the **same** AI SDK UI-message-stream protocol the client already
consumes. So in an F2/preview without real keys the chat still looks and
streams like a working assistant. As soon as a real key is set the handler runs
the genuine `streamText` path — no client change. Keep this detection intact
when you adapt the route; do not remove the canned fallback.

# UX rules

- Show a clear empty state with 2-3 example prompts the user can click.
- Stream tokens visibly — never wait for the full response before rendering.
- Visa en "Stoppa generering"-knapp medan svaret streamas.
- Respect prefers-reduced-motion: skip the typing-indicator animation.
- Cap visible message history to ~50 turns; older messages can be collapsed.

# Avoid

- Do not paraphrase `components/api/chat/route.ts` — the `streamText` + `toUIMessageStreamResponse` real path and the `createUIMessageStream` canned demo path both depend on the exact UI-message-stream protocol the client reads.
- Do not log raw user messages server-side without user consent.
- Do not put `OPENAI_API_KEY` in a `NEXT_PUBLIC_*` variable.
- Do not invent system-prompt instructions that promise capabilities the model lacks (e.g. "I can place orders" when there is no tool).

# Verification

- Type "Hello" in the chat panel — tokens stream visibly.
- Open the network tab: `POST /api/chat` returns `200` with `Transfer-Encoding: chunked`.
- Server logs show no `OPENAI_API_KEY` redacted leak.
- With `OPENAI_API_KEY` removed (or a preview stub), the panel still streams a canned demo reply (no client crash) — `mock: canned` in action.
