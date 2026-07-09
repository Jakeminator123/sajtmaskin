# When to use

- Use when a chat endpoint should let the model call server-side tools during an assistant turn.
- Use for read-only lookups, documentation search, status checks, or other structured backend queries.
- Use when the client can consume streamed AI SDK UI messages and render tool results separately from text.
- Prefer a plain chat dossier if the assistant never needs tool execution.

# How to integrate

- Install the listed AI SDK, OpenAI provider, and zod dependencies.
- Add `OPENAI_API_KEY` to the server environment; never expose it to client components.
- The route emits at `/api/assistant` (NOT `/api/chat`, which belongs to the plain ai-chat dossier) — point the client transport at `/api/assistant`.
- The route is REWRITABLE: replace the sample `getWeather` and `searchDocs` tools with project-specific server functions.
- When rewriting, ALWAYS keep the route's safety contract: the `isPlaceholderValue(OPENAI_API_KEY)` demo guard that streams a canned reply when no real key is set (`mock: canned`), the JSON body try/catch returning 400, a zod `inputSchema` on every tool, and an explicit stop condition.
- Keep each tool narrow, typed with a zod input schema, and fast enough for interactive use.
- Keep `stopWhen: stepCountIs(...)` or another explicit stop condition for autonomous tool loops.

# Mock/demo mode

`mock: canned`. When there is no real `OPENAI_API_KEY` (missing OR a preview
stub containing `placeholder` / `not_real`), the route streams a short canned
Swedish demo reply over the same AI SDK UI-message-stream protocol instead of
calling OpenAI — so the assistant looks and streams like it works in an
F2/preview without real keys. The real tool-calling path runs as soon as a real
key is configured. Keep this `isPlaceholderValue` guard when you adapt the
route; do not replace it with a hard 503.

# UX rules

- Stream assistant text while tool calls are running.
- Show a visible pending state for in-progress tool calls.
- Render structured tool results in a distinct UI block, not as unlabelled prose.
- Let the assistant summarize tool results in natural language after the structured result appears.
- For destructive tools, require explicit user confirmation before execution.

# Avoid

- Do not import provider SDK clients or secrets into client components.
- Do not ship the sample weather/docs tools as if they were real production data.
- Do not allow vague unvalidated tool inputs when a precise schema is possible.
- Do not omit a step limit; unrestricted tool recursion can loop or spend unexpectedly.
- Do not flatten all message parts into markdown-only rendering.

# Verification

- Start the app with a valid `OPENAI_API_KEY`.
- Send a prompt that should call one tool and confirm the response streams back.
- Confirm the server receives a tool call and returns a structured result.
- Send a prompt that requires a follow-up after a tool result and confirm it continues in the same assistant turn.
- Temporarily make a tool throw and verify the route fails safely without exposing secrets.
- Remove the API key locally (or use a preview stub) and verify the route streams the canned demo reply from the built-in guard (`mock: canned`), never a crash.