# When to use

Use this dossier when the site needs **AI-generated emoji or small image assets** backed by a server-side model call and persistent storage. Typical fits:

- a Slack/Discord custom emoji generator
- an internal tool that creates branded reaction icons
- a gallery of user-generated emoji assets with shareable URLs
- a SaaS workflow that turns prompts into downloadable square images

This dossier is about the **integration pattern**, not the template UI. Keep your own product UI, but preserve the server-side flow:

1. issue a short-lived signed token
2. submit a generation request to Replicate from the server
3. persist job/result state in your database
4. expose result endpoints by id
5. optionally receive async webhook updates

# How to integrate

## 1) Required environment variables

Use these env vars:

```env
REPLICATE_API_TOKEN=
WEBHOOK_SECRET=
BLOB_READ_WRITE_TOKEN=
DATABASE_URL=
API_SECRET=
```

Notes:

- `REPLICATE_API_TOKEN` is required for model inference.
- `WEBHOOK_SECRET` is required if using asynchronous prediction callbacks.
- `BLOB_READ_WRITE_TOKEN` is useful if you copy final images into your own storage.
- `DATABASE_URL` is required for persistence.
- `API_SECRET` is required for signing the short-lived generation token. The source route refers to `API_SECRET`, so define it explicitly even if the draft `.env.example` omitted it.

`KV_*` and `NGROK_URL` are optional implementation details from the source template, not mandatory for every integration.

## 2) Keep the token issuance pattern

The token route is useful when you want a browser client to obtain a short-lived signed token before generation.

```ts
// app/api/token/route.ts
import { SignJWT } from "jose"
import { nanoid } from "nanoid"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const ip = request.ip ?? "127.0.0.1"
  const userAgent = request.headers.get("user-agent") || "unknown"
  const isIOS = /iPhone|iPad|iPod/.test(userAgent)

  const token = await new SignJWT({ ip, isIOS })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(nanoid())
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(new TextEncoder().encode(process.env.API_SECRET!))

  return NextResponse.json({ token })
}
```

Use this token to:

- discourage anonymous abuse
- tie a request to coarse client metadata
- support rate limiting or quotas

## 3) Submit generation requests from a server route

Do not call Replicate directly from an untrusted client with your API token. Put model invocation in a server route.

```ts
// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"
import Replicate from "replicate"

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const token = authHeader?.replace("Bearer ", "")

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 })
  }

  await jwtVerify(token, new TextEncoder().encode(process.env.API_SECRET!))

  const { prompt } = await request.json()

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
  }

  const output = await replicate.run("black-forest-labs/flux-schnell", {
    input: {
      prompt: `Generate a single emoji-style icon: ${prompt}`,
      aspect_ratio: "1:1",
      output_format: "png",
    },
  })

  return NextResponse.json({ output })
}
```

In production, persist a generation row before calling the model, then update it when the model completes.

Suggested DB fields:

- `id`
- `prompt`
- `status` (`pending` | `succeeded` | `failed`)
- `providerJobId`
- `imageUrl`
- `error`
- `createdAt`
- `updatedAt`

## 4) Expose result-by-id routes

The kept route pattern is correct: provide a stable API endpoint for loading a generated item by id.

```ts
// app/api/emojis/[id]/route.ts
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const emoji = await prisma.emoji.findUnique({ where: { id: params.id } })

  if (!emoji) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ emoji })
}
```

This endpoint is what your:

- gallery page
- detail page
- share page
- edit/download modal

should load from.

## 5) Add webhook handling for async predictions

If you use Replicate predictions asynchronously, create a webhook route and verify the signature before mutating state.

```ts
// app/api/webhooks/replicate/route.ts
import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

function verifySignature(body: string, signature: string | null) {
  if (!signature || !process.env.WEBHOOK_SECRET) return false

  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(body)
    .digest("hex")

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-webhook-signature")

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const payload = JSON.parse(rawBody)

  // Update DB row using payload.id / payload.status / payload.output

  return NextResponse.json({ ok: true })
}
```

Match the exact webhook header/signing scheme to the Replicate API version you use. Do not assume template behavior without checking current provider docs.

## 6) Store final assets in your own storage

Replicate output URLs may be temporary or provider-controlled. For long-lived product URLs, copy the final image into your own storage such as Vercel Blob or S3, then save your own canonical URL in the database.

Typical flow:

```ts
// pseudo-code
const remoteImageUrl = providerOutputUrl
const imageBuffer = await fetch(remoteImageUrl).then((r) => r.arrayBuffer())
const blobUrl = await put(`emojis/${id}.png`, imageBuffer, {
  access: "public",
  contentType: "image/png",
})

await prisma.emoji.update({
  where: { id },
  data: { imageUrl: blobUrl.url, status: "succeeded" },
})
```

## 7) Keep runtime choices intentional

- Use `runtime = "nodejs"` for routes that depend on Node APIs, webhooks, Prisma, or provider SDK behavior that may not be edge-safe.
- Use edge runtime only when all dependencies are edge-compatible.

The draft mixes edge and database access. In most real deployments, Prisma + webhook processing is safer on Node runtime.

# UX rules

- Require a prompt and validate length before submission.
- Show explicit states: `idle`, `generating`, `ready`, `failed`.
- Tell users generation can take several seconds.
- If the result is async, return a job id immediately and poll the result route.
- Show the final asset in a square frame and provide download/copy actions.
- If used for Slack/Discord emojis, guide users toward simple prompts with strong silhouettes and minimal detail.
- Preserve public share links only for finished assets; pending/failed jobs should not render as successful pages.
- If generation is rate-limited, communicate retry timing clearly.

# Avoid

- Do not keep the template's App Store redirect middleware; it is unrelated.
- Do not keep branded metadata, headers, or landing-page layout from the source app.
- Do not expose `REPLICATE_API_TOKEN` to the browser.
- Do not trust webhook payloads without signature verification.
- Do not rely on provider-hosted output URLs as your only permanent asset URL.
- Do not treat the sitemap route as core; add it only if your app intentionally indexes public emoji pages.
- Do not use `API_SECRET ?? ""`; fail fast if the secret is missing.

# Verification

Verify the integration with this checklist:

1. `GET /api/token` returns a JWT.
2. `POST /api/generate` with `Authorization: Bearer <token>` and a valid prompt returns output or a queued job.
3. A database row is created for each generation request.
4. `GET /api/emojis/:id` returns a persisted result for an existing item and `404` for a missing one.
5. Webhook requests with invalid signatures are rejected.
6. Completed generations are stored under your own canonical asset URL.
7. No provider secret appears in client bundles or browser network payloads.

Example manual test:

```bash
curl http://localhost:3000/api/token
```

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"green frog face with big eyes"}'
```

```bash
curl http://localhost:3000/api/emojis/<ID>
```

If you add polling, verify the job moves from `pending` to `succeeded` and the UI updates without a full page reload.
