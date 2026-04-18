# When to use

Use this dossier when you are building a Gemini-powered chat experience that should only be available to signed-in users.

Typical fits:
- internal tools or dashboards with a private AI assistant
- member-only chat features
- SaaS apps where usage should be tied to user accounts
- chat routes that need per-user access control before model calls

This dossier is about **authentication around the chatbot**, not about marketing pages or demo UI.

# How to integrate

## 1) Install the required packages

```bash
npm install next-auth ai @ai-sdk/react @ai-sdk/google
```

If you use Google sign-in with Auth.js, also configure OAuth credentials in Google Cloud.

## 2) Add environment variables

```env
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_GOOGLE_ID=your-google-oauth-client-id
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
```

Notes:
- `AUTH_SECRET` is required by Auth.js in production.
- `GOOGLE_GENERATIVE_AI_API_KEY` is used by `@ai-sdk/google` for Gemini calls.
- You can swap Google sign-in for another Auth.js provider if the product needs it.

## 3) Create the shared Auth.js config

Create `auth.ts` and export `auth`, `handlers`, `signIn`, and `signOut`:

```ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
})
```

## 4) Mount the Auth.js route handler

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

## 5) Protect chat routes with middleware

Create `middleware.ts`:

```ts
export { auth as middleware } from "@/auth"

export const config = {
  matcher: ["/chat/:path*", "/api/chat/:path*"],
}
```

This protects both the page and the server endpoint. Keep the API route check too; middleware is not your only enforcement layer.

## 6) Verify the session inside the chat API route

Create `app/api/chat/route.ts`:

```ts
import { auth } from "@/auth"
import { google } from "@ai-sdk/google"
import { streamText, convertToModelMessages } from "ai"

export const runtime = "edge"

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages } = await req.json()

  const result = streamText({
    model: google("gemini-2.0-flash"),
    messages: convertToModelMessages(messages),
    system: "You are a helpful assistant.",
  })

  return result.toUIMessageStreamResponse()
}
```

Integration rules here:
- always check `await auth()` in the route itself
- never trust client-side state for authorization
- call Gemini only after session validation succeeds

## 7) Gate the chat page server-side

Example `app/chat/page.tsx`:

```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { Chat } from "@/components/chat"

export default async function ChatPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/api/auth/signin")
  }

  return <Chat />
}
```

## 8) Use a client chat component that posts to the protected endpoint

```tsx
"use client"

import { useChat } from "@ai-sdk/react"
import { useState } from "react"

export function Chat() {
  const [input, setInput] = useState("")
  const { messages, sendMessage, status } = useChat({
    api: "/api/chat",
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!input.trim()) return
        sendMessage({ text: input })
        setInput("")
      }}
    >
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button disabled={status !== "ready"}>Send</button>
    </form>
  )
}
```

## 9) Optional: attach user metadata to requests

If your app needs rate limits, analytics, or storage keyed by user, read the session in the route and derive a stable identifier:

```ts
const session = await auth()
const userId = session?.user?.email

if (!userId) {
  return new Response("Unauthorized", { status: 401 })
}
```

Prefer a database user id if available. Email works as a fallback but is less ideal as a primary key.

# UX rules

- Do not render a public chat input that fails only after submit; gate access before users start typing.
- If unauthenticated, redirect to sign-in or show a clear sign-in CTA.
- Show who is signed in when the chat is account-scoped.
- Keep sign-out accessible from the chat area.
- Handle `401` responses in the client by prompting re-authentication.
- If the chatbot stores history, scope it per authenticated user.
- If model access is expensive, combine auth with rate limits or usage quotas.

# Avoid

- Do not expose Gemini calls directly from the browser.
- Do not rely only on middleware; also verify the session inside `/api/chat`.
- Do not keep template-specific demo routes like OG generators, cron cleanup endpoints, or test harness files.
- Do not assume this dossier includes database persistence; add storage separately if you need chat history.
- Do not misclassify this as a full auth starter. It is the auth pattern for a protected AI chatbot.

# Verification

Check all of the following:

1. Visiting `/chat` while signed out redirects to Auth.js sign-in.
2. After sign-in, `/chat` renders successfully.
3. `POST /api/chat` returns `401` when called without a valid session.
4. `POST /api/chat` streams a Gemini response when called with a valid session.
5. Signing out removes access to `/chat` and `/api/chat`.
6. No template-only files remain in the integration.

Manual API check:

```bash
curl -i -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"Hello"}]}]}'
```

Expected while signed out:
- `401 Unauthorized`

Expected while signed in through the browser:
- streaming response from the model

If the user reports that chat works for anonymous visitors, the auth integration is incomplete.
