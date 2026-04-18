# When to use

Use this dossier when the site needs **first-party email/password auth** in a **Next.js App Router** app with users stored in **Postgres via Prisma**.

This is a good fit for:
- dashboards and app shells
- account areas with protected routes
- products that need user records in the application database

This is **not** the best fit when you want OAuth-only auth, passwordless magic links, or a hosted auth product with prebuilt user management.

# How to integrate

## 1) Install and configure environment variables

Required env vars:

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="your-random-secret"
```

Generate a secret with:

```bash
npx auth secret
```

## 2) Add Prisma client setup

Use a singleton Prisma client on the server:

```ts
// lib/prisma.ts
import { PrismaClient } from "../prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const globalForPrisma = global as unknown as { prisma?: typeof prisma };

export default globalForPrisma.prisma ?? prisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

## 3) Define the Prisma schema and generate the client

Add a `User` model with a hashed password field:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  name      String?
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Then run:

```bash
npx prisma generate
npx prisma migrate dev --name init_auth
```

## 4) Create the shared Auth.js config

Create `auth.ts` and keep auth-specific logic there:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (!email || !password || typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) return null;

        const ok = await compare(password, user.password);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id as string;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
```

## 5) Mount the auth route handler

```ts
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

If you use the newer Auth.js export shape from `NextAuth(...)`, prefer:

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

Use **one pattern consistently**. Do not mix both APIs.

## 6) Add registration on the server

Never hash passwords in the client. Create users in a route or server action:

```ts
// app/api/register/route.ts
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  const { email, password, name } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "User already exists." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: await hash(password, 12),
    },
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
```

## 7) Protect server components and routes

In server components, layouts, and route handlers:

```ts
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <div>Signed in as {session.user.email}</div>;
}
```

## 8) Add middleware for protected route groups

```ts
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*", "/settings/:path*"],
};
```

Only protect routes that actually require login.

## 9) Sign in from a form

Client example:

```ts
"use client";

import { signIn } from "next-auth/react";

async function handleLogin(email: string, password: string) {
  const result = await signIn("credentials", {
    email,
    password,
    redirect: false,
  });

  if (result?.error) {
    // show friendly error
    return;
  }

  window.location.href = "/dashboard";
}
```

If your app uses server actions with Auth.js exports from `auth.ts`, you can also wire login/logout around the shared `signIn` and `signOut` helpers.

# UX rules

- Always provide dedicated **login**, **register**, and **logout** flows.
- Show a clear error for invalid credentials, but do not reveal whether the email or password was wrong.
- Redirect authenticated users away from login/register pages.
- Protect sensitive pages on the **server**, not only in client components.
- Use loading and disabled states on auth forms to prevent duplicate submissions.
- Store only the minimum user fields in the session.
- Ask for password confirmation during registration.

# Avoid

- Do not keep the demo blog posts API or blog-specific schema as part of the auth integration.
- Do not hash passwords in the browser.
- Do not store plaintext passwords in Prisma.
- Do not expose Prisma client code to client components.
- Do not mix multiple Auth.js configuration styles (`authOptions` vs `handlers/auth/signIn/signOut`) in the same app.
- Do not rely only on client-side guards for protected content.
- Do not create a new Prisma client on every request in development.

# Verification

1. Set `DATABASE_URL` and `AUTH_SECRET`.
2. Run:

```bash
npx prisma generate
npx prisma migrate dev --name init_auth
npm run dev
```

3. Create a user via the register endpoint or registration form.
4. Sign in with valid credentials.
5. Confirm `/api/auth/session` returns a session with `user.id`.
6. Visit a protected route such as `/dashboard`:
   - when signed out, it should redirect or deny access
   - when signed in, it should render normally
7. Confirm invalid credentials do not log the user in.
8. Confirm passwords stored in the database are hashed, not plaintext.
