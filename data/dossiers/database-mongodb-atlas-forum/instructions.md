# When to use

Use this dossier when the app needs:

- MongoDB Atlas as the main database
- Better Auth with MongoDB-backed sessions/users/accounts
- Next.js App Router route handlers and server actions that read/write authenticated data

Good fits:

- app-shell
- dashboard
- auth-pages
- base-nextjs

This dossier is not a full forum product feature. The original template included forum-specific posting/voting logic, but the reusable part here is the MongoDB Atlas + Better Auth integration pattern.

# How to integrate

## 1) Install dependencies

Required core packages:

```bash
npm install mongodb better-auth
```

If you use the provided route/client helpers, also ensure Next.js App Router is enabled.

## 2) Configure environment variables

Add:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=better-auth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
```

Notes:

- `MONGODB_DB` defaults to `better-auth` if omitted by the helper.
- `BETTER_AUTH_URL` can be omitted on Vercel if deployment URLs are available, but setting it explicitly is safer.
- `BETTER_AUTH_SECRET` must be stable across deploys.

## 3) Add a shared MongoDB connection helper

Create `lib/mongodb.ts` (or keep the dossier version under your chosen path):

```ts
import { Db, MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("Missing required environment variable: MONGODB_URI");
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "better-auth";

type GlobalMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as GlobalMongo;

const clientPromise =
  globalForMongo._mongoClientPromise ??
  new MongoClient(uri).connect();

if (process.env.NODE_ENV !== "production") {
  globalForMongo._mongoClientPromise = clientPromise;
}

export async function getMongoClient() {
  return clientPromise;
}

export async function getDatabase(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}
```

This avoids creating a new Mongo client on every hot reload in development.

## 4) Configure Better Auth on the server

Create `lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { getDatabase } from "@/lib/mongodb";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("Missing required environment variable: BETTER_AUTH_SECRET");
}

const getServerBaseURL = () => {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
};

let authInstance: ReturnType<typeof betterAuth> | null = null;

export async function getAuth() {
  if (!authInstance) {
    const database = await getDatabase();

    authInstance = betterAuth({
      database: mongodbAdapter(database),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: getServerBaseURL(),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
      },
    });
  }

  return authInstance;
}
```

## 5) Expose the auth route

Create `app/api/auth/[...all]/route.ts`:

```ts
import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const createHandler = (method: "GET" | "POST") => async (request: Request) => {
  const auth = await getAuth();
  const handlers = toNextJsHandler(auth);
  return handlers[method](request);
};

export const GET = createHandler("GET");
export const POST = createHandler("POST");
```

This is the required App Router endpoint for Better Auth.

## 6) Add the client helper for React components

Create `lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

const getClientBaseURL = () => {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  if (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
};

export const authClient = createAuthClient({
  baseURL: getClientBaseURL(),
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;
```

## 7) Read the current session in server code

In server actions, route handlers, or server components:

```ts
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export async function getCurrentUser() {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}
```

## 8) Use MongoDB in authenticated server actions

Pattern:

```ts
"use server";

import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { getAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";

export async function createRecord(input: { title: string }) {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const db = await getDatabase();
  const result = await db.collection("records").insertOne({
    title: input.title,
    userId: session.user.id,
    createdAt: new Date(),
  });

  return { id: result.insertedId.toString() };
}

export async function getRecord(id: string) {
  const db = await getDatabase();
  return db.collection("records").findOne({
    _id: new ObjectId(id),
  });
}
```

## 9) Use auth in client components

```tsx
"use client";

import { useSession, signIn, signOut } from "@/lib/auth-client";

export function AuthButton() {
  const { data, isPending } = useSession();

  if (isPending) return <button disabled>Loading...</button>;

  if (data?.user) {
    return <button onClick={() => signOut()}>Sign out</button>;
  }

  return (
    <button
      onClick={() =>
        signIn.email({
          email: "user@example.com",
          password: "password123",
        })
      }
    >
      Sign in
    </button>
  );
}
```

Adapt the exact Better Auth client calls to the auth methods you expose in your UI.

# UX rules

- Gate mutations behind a confirmed server-side session check; do not trust client session state alone.
- Show clear auth states: signed out, loading, signed in.
- Use optimistic UI only if you can safely roll back on MongoDB write failure.
- For forms, return user-safe error messages for duplicate keys, unauthorized actions, and invalid input.
- Convert MongoDB `ObjectId` values to strings before passing data to client components.
- If building account pages, clearly show whether the user is authenticated before rendering protected content.

# Avoid

- Do not create a new `MongoClient` per request.
- Do not leave `BETTER_AUTH_SECRET` unset or regenerate it on each deploy.
- Do not hardcode forum-specific collections like `posts` unless the user actually asked for that product feature.
- Do not keep template-only UI such as branded layout metadata, custom fonts, or toast setup unless the target app already uses them.
- Do not expose raw MongoDB documents with unserialized `ObjectId` fields directly to the client.
- Do not rely only on client-side checks for authorization.

# Verification

Run through this checklist:

1. Environment variables are set:

```bash
printenv MONGODB_URI
printenv BETTER_AUTH_SECRET
```

2. The auth route responds without a server crash:

- Start the app
- Request `/api/auth/*` through a real auth flow
- Confirm no `Missing required environment variable` errors

3. MongoDB connection succeeds:

```ts
import { getDatabase } from "@/lib/mongodb";

const db = await getDatabase();
await db.command({ ping: 1 });
```

4. Session lookup works in server code:

```ts
const auth = await getAuth();
const session = await auth.api.getSession({ headers: await headers() });
console.log(session?.user);
```

5. Sign-up/sign-in creates and reads auth data from MongoDB Atlas.

6. Any protected server action:

- rejects anonymous users
- succeeds for authenticated users
- writes expected documents to the target collection

7. If deployed on Vercel, verify the resolved auth base URL matches the actual deployment domain and cookies work in production.
