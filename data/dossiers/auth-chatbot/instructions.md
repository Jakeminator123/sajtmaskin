# When to use

Use this dossier when the app needs **authenticated AI chat** rather than anonymous prompting. It is a good fit for:

- chat tied to a signed-in user
- saved chat history or user-owned documents
- protected chat routes in an app shell or dashboard
- chat APIs that need both auth checks and rate limiting

This dossier is **not** a complete chatbot product by itself. It provides the auth/session, database config, error handling, and request protection patterns that the runtime LLM should wire into the app's chat UI and API routes.

# How to integrate

## 1) Add the root session provider

Wrap the app with `SessionProvider` so client components can read auth state.

```tsx
import { SessionProvider } from "next-auth/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
```

If the app uses a base path, pass `basePath` to `SessionProvider`.

## 2) Create a central NextAuth config

Create `auth.ts` and export `auth`, `handlers`, `signIn`, and `signOut`.

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { auth, handlers, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Replace with real user lookup + password verification.
        return {
          id: String(credentials.email),
          email: String(credentials.email),
        };
      },
    }),
  ],
});
```

## 3) Expose the auth route

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

Place it at:

```text
app/api/auth/[...nextauth]/route.ts
```

## 4) Protect chat pages and chat APIs

Use middleware for route-level protection:

```ts
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/chat/:path*", "/api/chat/:path*"],
};
```

For server-side enforcement inside route handlers, use a helper:

```ts
import { auth } from "@/auth";
import { ChatbotError } from "@/lib/errors";

export async function requireSession() {
  const session = await auth();

  if (!session?.user) {
    throw new ChatbotError("unauthorized:auth");
  }

  return session;
}
```

Then in a chat route:

```ts
import { requireSession } from "@/lib/auth-guard";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { ChatbotError } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    await checkIpRateLimit(ip);

    return Response.json({ userId: session.user?.email });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    return Response.json(
      { code: "", message: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}
```

## 5) Keep Drizzle config for persisted chat data

This dossier includes `drizzle.config.ts` for Postgres-backed persistence.

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? "",
  },
});
```

The runtime LLM should create the actual schema for users, chats, messages, and any document/history tables as needed by the project.

## 6) Use structured errors in auth and chat endpoints

The provided `ChatbotError` utility gives consistent response codes and messages.

Example:

```ts
throw new ChatbotError("forbidden:chat");
```

Return it like this:

```ts
catch (error) {
  if (error instanceof ChatbotError) {
    return error.toResponse();
  }

  return Response.json({ code: "", message: "Something went wrong." }, { status: 500 });
}
```

## 7) Apply Redis rate limiting to message creation

Use the included rate limit utility on endpoints that create or continue chats. The current implementation:

- only runs in production
- skips when no IP is available
- uses Redis `INCR` + `EXPIRE`
- throws `rate_limit:chat` after the limit is reached

Typical usage:

```ts
const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
await checkIpRateLimit(ip);
```

If the app is deployed behind a proxy or platform-specific edge, make sure the real client IP header is used consistently.

# UX rules

- Require sign-in before showing saved chats, private chat history, or user-owned documents.
- If a guest mode exists, make it explicit and separate from authenticated history.
- Show friendly auth failures like "You need to sign in before continuing."
- On rate limit errors, preserve the current draft message in the UI and explain when the user can retry.
- Do not expose raw database or provider errors to end users.
- If chat data is user-owned, enforce ownership checks on every read/write route, not just in the UI.

# Avoid

- Do not keep template demo suggestions, branded metadata, or template-specific copy as part of the integration layer.
- Do not rely only on client-side session checks for protected chat routes.
- Do not trust a `chatId` from the client without verifying that the authenticated user owns it.
- Do not throw generic `Error` objects for expected auth/chat failures when `ChatbotError` exists.
- Do not make Redis rate limiting block local development unless intentionally testing it.
- Do not store passwords in plain text if implementing credentials auth; use proper hashing and verification.

# Verification

- `AUTH_SECRET`, `POSTGRES_URL`, and `REDIS_URL` are set.
- Visiting a protected route like `/chat` while signed out redirects or returns unauthorized.
- `GET /api/auth/session` returns a valid session after sign-in.
- A protected chat API returns `401` via `unauthorized:auth` when no session exists.
- Repeated chat requests from the same IP eventually return `429` in production.
- Drizzle can generate migrations successfully using `POSTGRES_URL`.
- Structured error responses are returned for auth, chat, and database failure paths.
