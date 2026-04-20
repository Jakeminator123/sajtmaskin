# When to use

Use this dossier when the app needs MongoDB Atlas as its primary database and is built with Next.js App Router. It is best for server-rendered apps, dashboards, internal tools, ecommerce backends, and any project that needs direct database access from route handlers, Server Actions, or other server-only modules.

Do not use this pattern for client-side direct database access. MongoDB credentials must stay on the server.

# How to integrate

## 1) Add the environment variable

Set `MONGODB_URI` in local development and in your deployment platform.

```env
MONGODB_URI="mongodb+srv://USERNAME:PASSWORD@cluster0.example.mongodb.net/my-app?retryWrites=true&w=majority"
```

Notes:
- Prefer a dedicated database user with least privilege.
- Include a default database name in the URI when possible.
- In Atlas, allow network access from your deployment environment.

## 2) Create a shared server-only MongoDB helper

Use a single module that creates and reuses the `MongoClient`.

```ts
import { MongoClient, MongoClientOptions } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const options: MongoClientOptions = {};

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const client = new MongoClient(uri, options);

export const mongoClientPromise =
  process.env.NODE_ENV === "development"
    ? (global._mongoClientPromise ??= client.connect())
    : client.connect();

export async function getMongoDb(dbName?: string) {
  const connectedClient = await mongoClientPromise;
  return dbName ? connectedClient.db(dbName) : connectedClient.db();
}
```

Why this matters:
- Prevents creating many connections during local hot reload.
- Keeps connection logic in one place.
- Makes route handlers and server utilities simpler.

## 3) Query MongoDB only from server code

Typical places:
- `app/api/**/route.ts`
- Server Actions
- server-only data access modules
- background jobs

Example route handler:

```ts
import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getMongoDb();
  const products = await db
    .collection("products")
    .find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return NextResponse.json(products);
}
```

Example insert:

```ts
import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

export async function POST(request: Request) {
  const body = await request.json();
  const db = await getMongoDb();

  const result = await db.collection("orders").insertOne({
    email: body.email,
    items: body.items,
    createdAt: new Date(),
  });

  return NextResponse.json({ insertedId: result.insertedId });
}
```

## 4) Serialize MongoDB values before returning them to the client

MongoDB documents may contain `ObjectId` and `Date` values that need careful handling in UI payloads.

A simple pattern:

```ts
const docs = await db.collection("products").find({}).toArray();

const safe = docs.map((doc) => ({
  ...doc,
  _id: doc._id.toString(),
}));
```

If your schema includes nested `ObjectId`s, convert them too before passing data into client components or JSON responses.

## 5) Add a health check during setup

Use a lightweight route to confirm Atlas connectivity:

```ts
import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

# UX rules

- Never expose `MONGODB_URI` or database credentials to client components.
- Show friendly empty states if a collection has no documents.
- Show generic failure messages to end users; log detailed database errors on the server.
- For mutations, return clear success/failure states and avoid silent writes.
- If the app depends heavily on database data, provide loading and retry states around data-fetching UI.

# Avoid

- Do not import the MongoDB helper into client components.
- Do not create a new `MongoClient` inside every request handler.
- Do not rely on browser-side MongoDB access.
- Do not pass raw MongoDB documents with unconverted `ObjectId`s into JSON responses or client props.
- Do not keep template-specific metadata, fonts, or styling files in this dossier; they are unrelated to the integration.

# Verification

1. Set a valid `MONGODB_URI` locally.
2. Start the app.
3. Request the health endpoint.

```bash
curl http://localhost:3000/api/health/db
```

Expected response:

```json
{ "ok": true }
```

4. Create a temporary route or action that reads one collection and confirm documents are returned.
5. Deploy and verify the same health check in production.
6. If deployment fails, check:
- Atlas IP/network access rules
- the exact value of `MONGODB_URI`
- whether the database user has permission to read/write the target database
- whether any returned `ObjectId` values are being improperly serialized
