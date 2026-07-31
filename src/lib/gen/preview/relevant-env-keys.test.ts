import { describe, expect, it } from "vitest";

import { collectRelevantPreviewEnvKeys } from "./relevant-env-keys";

const CATALOG = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "MONGODB_URI",
  "POSTGRES_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
] as const;

describe("collectRelevantPreviewEnvKeys", () => {
  it("keeps keys referenced by name and drops the rest", () => {
    const keep = collectRelevantPreviewEnvKeys({
      files: [
        {
          name: "app/api/chat/route.ts",
          content: "const key = process.env.OPENAI_API_KEY;",
        },
        { name: "app/page.tsx", content: "export default function Page() {}" },
      ],
      catalogKeys: [...CATALOG],
    });
    expect(keep.has("OPENAI_API_KEY")).toBe(true);
    expect(keep.has("STRIPE_SECRET_KEY")).toBe(false);
    expect(keep.has("RESEND_API_KEY")).toBe(false);
    expect(keep.has("MONGODB_URI")).toBe(false);
  });

  it("adds SDK-implicit keys for imported packages that read env internally", () => {
    const keep = collectRelevantPreviewEnvKeys({
      files: [
        {
          name: "lib/db.ts",
          content: 'import { sql } from "@vercel/postgres";',
        },
        {
          name: "middleware.ts",
          content: 'import { clerkMiddleware } from "@clerk/nextjs/server";',
        },
      ],
      catalogKeys: [...CATALOG],
    });
    expect(keep.has("POSTGRES_URL")).toBe(true);
    expect(keep.has("CLERK_SECRET_KEY")).toBe(true);
    expect(keep.has("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")).toBe(true);
    expect(keep.has("OPENAI_API_KEY")).toBe(false);
  });

  it("matches package.json dependency declarations (module-scope crash guard)", () => {
    const keep = collectRelevantPreviewEnvKeys({
      files: [
        {
          name: "package.json",
          content: '{ "dependencies": { "pg": "^8.11.0", "ioredis": "^5.4.0" } }',
        },
      ],
      catalogKeys: [...CATALOG],
    });
    expect(keep.has("DATABASE_URL")).toBe(true);
    expect(keep.has("POSTGRES_URL")).toBe(true);
    expect(keep.has("REDIS_URL")).toBe(true);
  });

  it("keeps stubs for SDKs that read their key internally at construction", () => {
    const keep = collectRelevantPreviewEnvKeys({
      files: [
        { name: "lib/ai.ts", content: 'import OpenAI from "openai";\nconst ai = new OpenAI();' },
        {
          name: "package.json",
          content: '{ "dependencies": { "resend": "^4.0.0", "stripe": "^16.0.0" } }',
        },
      ],
      catalogKeys: [...CATALOG],
    });
    expect(keep.has("OPENAI_API_KEY")).toBe(true);
    expect(keep.has("RESEND_API_KEY")).toBe(true);
    expect(keep.has("STRIPE_SECRET_KEY")).toBe(true);
    expect(keep.has("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")).toBe(true);
    expect(keep.has("MONGODB_URI")).toBe(false);
  });

  it("detects next-auth via import specifier (AUTH_SECRET is read internally)", () => {
    const keep = collectRelevantPreviewEnvKeys({
      files: [
        {
          name: "auth.ts",
          content: 'import NextAuth from "next-auth";',
        },
      ],
      catalogKeys: [...CATALOG],
    });
    expect(keep.has("AUTH_SECRET")).toBe(true);
    expect(keep.has("NEXTAUTH_URL")).toBe(true);
  });

  it("ignores env artifact files so catalog dumps cannot defeat the scoping", () => {
    const envDump = CATALOG.map((key) => `${key}=placeholder`).join("\n");
    const keep = collectRelevantPreviewEnvKeys({
      files: [
        { name: "env.example", content: envDump },
        { name: ".env.local", content: envDump },
        { name: "sub/.env.production", content: envDump },
      ],
      catalogKeys: [...CATALOG],
    });
    expect(keep.size).toBe(0);
  });

  it("returns an empty set for empty input", () => {
    const keep = collectRelevantPreviewEnvKeys({ files: [], catalogKeys: [...CATALOG] });
    expect(keep.size).toBe(0);
  });
});
