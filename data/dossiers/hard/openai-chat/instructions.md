# When to use

Use this dossier when the brief declares the `ai-chat` capability — the site needs a conversational assistant powered by an LLM.

Best fit:

- A "Talk to our AI" widget on a SaaS landing page.
- A product help-bot that answers FAQ-style questions.
- A guided onboarding flow where the user describes their need and the bot suggests next steps.

Do not use it for:

- Image generation (use `image-gen` capability).
- Pure information lookup with no conversation (a search box is better).
- Tasks that need long-term memory or vector search (RAG is a separate dossier).

# How to integrate

1. Place `<ChatPanel />` somewhere in the page tree — a sidebar, a modal, a dedicated `/chat` route, etc. The component is fully self-contained and uses the `useChat` hook from `@ai-sdk/react`.
2. The hook posts to `/api/chat` and streams tokens back. The route handler is intentionally tiny — system prompt, model, and temperature are inlined so the codegen LLM can adapt them per project.
3. **Re-style the panel freely.** Avatars, layout, colors, message rendering, autoscroll behavior — all rewritable. Only the `route.ts` file must stay verbatim (the streaming protocol depends on the exact response format).
4. Configure the **system prompt** in `route.ts` to match the site's persona — this is the single most important integration step. Generic `You are a helpful assistant` is a sign of incomplete adaptation.

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
- Display a "Stop generating" button while a response is streaming.
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
