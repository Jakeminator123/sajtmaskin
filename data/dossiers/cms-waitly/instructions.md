# When to use

Use this dossier when the site needs a lightweight waitlist instead of a full user account system.

It is a good fit for:
- product launches and coming-soon pages
- startup landing pages collecting early access interest
- campaigns where editors want submissions visible inside Notion
- simple referral-based waitlists without a separate database admin UI

This dossier gives you:
- a Notion-backed signup API route
- duplicate email checking against a Notion database
- generated referral codes for each signup
- optional referral attribution using a Notion relation property
- welcome email sending through Resend
- basic IP-based rate limiting through Upstash Redis

# How to integrate

## 1) Install dependencies

Required server-side packages from this dossier:

```bash
npm install @notionhq/client resend @upstash/redis @upstash/ratelimit @react-email/components react
```

If your app already has React and Next.js, only add the missing packages.

## 2) Set environment variables

```env
NOTION_SECRET=
NOTION_DB_ID=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Notes:
- `NOTION_SECRET` must come from a Notion integration with access to the target database.
- `NOTION_DB_ID` is the database that stores waitlist entries.
- `RESEND_FROM_EMAIL` must be a verified sender/domain in Resend.
- Upstash values are required if you keep the mail rate limiting logic.

## 3) Create the Notion database schema

The route expects these Notion properties:
- `Name` — Title
- `Email` — Email
- `Referral Code` — Rich text
- `Referred By` — Rich text
- `Referrer` — Relation (self-relation or relation to a compatible database)

Minimum requirement for basic signup is:
- `Name`
- `Email`
- `Referral Code`

If you do not need referrals, remove `Referred By` and `Referrer` logic from the route.

## 4) Add the Notion client

```ts
import { Client } from "@notionhq/client";

export const notion = new Client({
  auth: process.env.NOTION_SECRET,
});

export const NOTION_DB_ID = process.env.NOTION_DB_ID || "";
```

## 5) Add the referral code helper

```ts
export function generateCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}
```

Use a restricted alphabet to avoid ambiguous characters like `0/O` and `1/I`.

## 6) Add the waitlist signup route

```ts
import { NextResponse } from "next/server";
import { notion, NOTION_DB_ID } from "@/lib/notion";
import { generateCode } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const { email, firstname, referredBy } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const existing = await notion.databases.query({
      database_id: NOTION_DB_ID,
      filter: {
        property: "Email",
        email: { equals: email },
      },
    });

    if (existing.results.length > 0) {
      return NextResponse.json(
        { error: "You're already on the waitlist!" },
        { status: 409 }
      );
    }

    const code = generateCode();

    let referrerPageId: string | null = null;
    if (referredBy) {
      const results = await notion.databases.query({
        database_id: NOTION_DB_ID,
        filter: {
          property: "Referral Code",
          rich_text: { equals: referredBy },
        },
      });

      if (results.results.length > 0) {
        referrerPageId = results.results[0].id;
      }
    }

    const page = await notion.pages.create({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        Name: {
          title: [{ text: { content: firstname || email.split("@")[0] } }],
        },
        Email: { email },
        "Referral Code": {
          rich_text: [{ text: { content: code } }],
        },
        "Referred By": referredBy
          ? { rich_text: [{ text: { content: referredBy } }] }
          : { rich_text: [] },
        Referrer: referrerPageId
          ? { relation: [{ id: referrerPageId }] }
          : { relation: [] },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Added to waitlist",
        code,
        notionId: page.id,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Notion API error:", message);

    return NextResponse.json(
      {
        error: "Failed to save to Notion",
        details: message,
        success: false,
      },
      { status: 500 }
    );
  }
}
```

Important:
- The source file uses `~/lib/...` aliases. Replace with your app's alias, usually `@/lib/...`.
- Keep this route server-only.
- Normalize and validate email before querying or storing if you want stricter dedupe.

## 7) Add the email check utility if the UI needs preflight validation

```ts
import { notion, NOTION_DB_ID } from "@/lib/notion";

export async function checkEmailExists(email: string) {
  const existing = await notion.databases.query({
    database_id: NOTION_DB_ID,
    filter: { property: "Email", email: { equals: email } },
  });

  return existing.results.length > 0;
}
```

Use this in server actions or route handlers, not directly in a client component.

## 8) Add the welcome email route

```ts
import { Resend } from "resend";
import { type NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import WelcomeTemplate from "@/emails/welcome-template";

const resend = new Resend(process.env.RESEND_API_KEY);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(2, "1 m"),
});

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "127.0.0.1";

  const result = await ratelimit.limit(ip);

  if (!result.success) {
    return NextResponse.json({ error: "Too many requests!" }, { status: 429 });
  }

  const { email, name } = await request.json();

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "",
    to: [email],
    subject: "You're on the waitlist",
    react: WelcomeTemplate({ userFirstname: name }),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ message: "Email sent successfully" }, { status: 200 });
}
```

Keep this route optional. Many apps can skip transactional email and show confirmation in-app only.

## 9) Call the routes from a form

Typical client flow:
1. collect `email`, optional `firstname`, optional `referredBy`
2. `POST /api/notion`
3. on success, show confirmation and referral code
4. optionally `POST /api/mail`

Example payload:

```ts
await fetch("/api/notion", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email,
    firstname,
    referredBy,
  }),
});
```

# UX rules

- Always show a clear success state after signup.
- If a referral code is generated, surface it immediately with a copy button.
- Treat `409` as a friendly duplicate-signup state, not a generic error.
- Do not block submission on optional `firstname`.
- If email sending fails after Notion save succeeds, keep the signup successful and show a non-blocking message.
- Prefer a single primary CTA and a short form: email first, name optional.
- If using referrals, explain what the referral code does before asking users to share it.

# Avoid

- Do not keep template-specific imports like `~/emails`, `~/lib/utils`, custom headers, theme providers, or branded metadata unless your app already uses that structure.
- Do not assume the Notion database property names differ from the route. If you rename properties, update the queries and create payload together.
- Do not expose Notion credentials in client components.
- Do not call Notion directly from the browser.
- Do not rely on Notion alone for hard uniqueness guarantees under heavy concurrent traffic; this pattern is fine for lightweight waitlists, not high-scale transactional systems.
- Do not make welcome email delivery a prerequisite for recording the signup.
- Do not forget that the source route references a missing helper (`generateCode`) and a missing email template; add both.

# Verification

## Manual checks

1. Submit a new email to the waitlist route.
2. Confirm a new row appears in the configured Notion database.
3. Confirm the response includes `success: true` and a `code`.
4. Submit the same email again.
5. Confirm the route returns `409`.
6. Submit with a valid `referredBy` code from an existing user.
7. Confirm the `Referrer` relation is populated in Notion.
8. If mail is enabled, trigger the mail route and confirm delivery in Resend logs.
9. Trigger the mail route more than twice within one minute from the same IP and confirm `429`.

## Quick API examples

```bash
curl -X POST http://localhost:3000/api/notion \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","firstname":"Ava"}'
```

```bash
curl -X POST http://localhost:3000/api/mail \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","name":"Ava"}'
```

## Production readiness notes

Before shipping, consider adding:
- server-side email format validation
- lowercase email normalization before dedupe
- bot protection beyond IP rate limiting
- analytics events for waitlist conversion
- a fallback persistence layer if Notion latency or limits become a concern
- stricter error handling for invalid Notion schema configuration
