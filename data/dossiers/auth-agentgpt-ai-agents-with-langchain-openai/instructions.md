# When to use

Use this dossier when the site needs login before users can access an AI-agent workspace, saved agents, usage-limited tools, or account-specific data. This is the right fit for an AgentGPT-style app where authentication is handled in Next.js with NextAuth and one or more OAuth providers.

Use it for:
- protected dashboards or `/app` areas
- per-user agent history or settings
- gating access to OpenAI-powered actions behind login
- simple OAuth sign-in with GitHub, Google, and/or Discord

Do not use it as a full AgentGPT product clone. This dossier only covers the auth layer and the key environment/config expectations around it.

# How to integrate

## 1) Install the auth stack

Add NextAuth v5 and any OAuth providers you want to support.

```bash
npm install next-auth
```

## 2) Create the shared auth config

Create `lib/auth.ts`:

```ts
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";

const providers = [];

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(GitHub({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }));
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }));
}

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  providers.push(Discord({
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
  }));
}

export const authConfig: NextAuthConfig = {
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

## 3) Add the auth route

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

## 4) Protect private routes with middleware

Create `middleware.ts`:

```ts
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*", "/agents/:path*"],
};
```

Adjust the matcher to your actual private routes.

## 5) Gate server-rendered pages

In protected pages, check the session server-side and redirect if missing:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function ProtectedPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  return <div>Private content for {session.user.email}</div>;
}
```

## 6) Add a sign-in page

Use server actions with `signIn()`:

```tsx
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <form
      action={async () => {
        "use server";
        await signIn();
      }}
    >
      <button type="submit">Sign in</button>
    </form>
  );
}
```

If you want explicit provider buttons, pass the provider ID:

```tsx
await signIn("github", { redirectTo: "/dashboard" });
```

## 7) Add sign-out

```tsx
import { signOut } from "@/lib/auth";

<form
  action={async () => {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }}
>
  <button type="submit">Sign out</button>
</form>
```

## 8) Type the session if you store `user.id`

Create `types/next-auth.d.ts`:

```ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
    };
  }
}
```

## 9) Environment variables

Minimum auth-related env vars:

```env
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"

GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."
```

AgentGPT-style apps also commonly rely on runtime config such as:

```env
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"
NEXT_PUBLIC_MAX_LOOPS="100"
REWORKD_PLATFORM_OPENAI_API_KEY="..."
DATABASE_URL="mysql://user:password@host:3307/dbname"
```

Only keep the non-auth env vars if the project actually has a backend, database, and agent runtime. Do not blindly copy the whole template env list into a smaller app.

# UX rules

- Require authentication before showing agent history, saved prompts, API usage, or user-specific dashboards.
- Make the sign-in destination obvious; redirect authenticated users away from `/sign-in` to the main app.
- Use provider buttons only for providers that are actually configured in env.
- Keep post-login redirect deterministic, usually `/dashboard` or `/app`.
- If agent execution is expensive or rate-limited, block launch actions for anonymous users rather than failing later.
- Show the current signed-in identity in the app shell when possible.

# Avoid

- Do not keep template blog utilities, demo content, or agent-message UI helpers in this dossier; they are not auth integration requirements.
- Do not assume all three OAuth providers are configured. Build the provider list dynamically.
- Do not expose secrets or provider credentials to the client.
- Do not rely on client-only auth checks for protected pages; enforce protection with middleware and server redirects.
- Do not copy AgentGPT backend/database env vars unless the site truly includes that backend.
- Do not treat this as a complete multi-tenant user system; it is a session/auth foundation.

# Verification

1. Set `NEXTAUTH_SECRET` and `NEXTAUTH_URL`.
2. Configure at least one provider, for example GitHub.
3. Start the app and visit `/sign-in`.
4. Click sign in and complete the provider flow.
5. Confirm `/api/auth/session` returns a valid session after login.
6. Visit `/dashboard` and confirm it renders for authenticated users.
7. Sign out and confirm `/dashboard` redirects back to `/sign-in`.
8. Visit a protected route directly while logged out and confirm middleware blocks access.
9. If the app includes agent actions, verify anonymous users cannot access user-specific agent state.
