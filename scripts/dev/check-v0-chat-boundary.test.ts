import { describe, expect, it } from "vitest";

import { checkV0ChatBoundary } from "./check-v0-chat-boundary.mjs";

async function run(files: Record<string, string>) {
  const entries = new Map(Object.entries(files));
  return checkV0ChatBoundary({
    trackedPaths: [...entries.keys()],
    readTrackedFile: async (path: string) => entries.get(path) ?? "",
  });
}

describe("v0 chat compatibility boundary", () => {
  it("accepts the canonical engine route and surviving v0 deploy boundary", async () => {
    await expect(
      run({
        "src/app/api/engine/chats/route.ts": "export async function POST() {}",
        "src/app/api/v0/deployments/route.ts": "export async function POST() {}",
        "src/lib/api/engine-chats-path.ts": "// /api/v0/chats was removed",
      }),
    ).resolves.toEqual([]);
  });

  it("rejects direct and route-group v0 chat routes", async () => {
    await expect(
      run({
        "src/app/api/v0/chats/[chatId]/route.ts": "export async function GET() {}",
        "src/app/api/v0/(compat)/chats/[chatId]/route.ts": "export async function GET() {}",
      }),
    ).resolves.toEqual([
      "src/app/api/v0/chats/[chatId]/route.ts: removed v0 chat route must not reappear",
      "src/app/api/v0/(compat)/chats/[chatId]/route.ts: removed v0 chat route must not reappear",
    ]);
  });

  it("scans root Next config while excluding test fixtures", async () => {
    const errors = await run({
      "next.config.ts": 'const source = "/api/v0/chats/:path*";',
      "src/lib/compat.test.ts": 'const fixture = "/api/v0/chats/123";',
    });
    expect(errors).toEqual([
      "next.config.ts:1: active caller targets removed /api/v0/chats boundary",
    ]);
  });

  it("scans active JSON deployment configs", async () => {
    const errors = await run({
      "vercel.json": '{"rewrites":[{"source":"/api/v0/chats/:path*","destination":"/api/engine/chats/:path*"}]}',
      "fixtures/vercel.json": '{"source":"/safe"}',
      "package.json": '{"example":"/api/v0/chats"}',
    });
    expect(errors).toEqual([
      "vercel.json:1: active caller targets removed /api/v0/chats boundary",
    ]);
  });

  it("scans shipped public JavaScript", async () => {
    const errors = await run({
      "public/service-worker.js": 'fetch("/api/v0/chats/123")',
      "public/manifest.json": '{"start_url":"/api/v0/chats"}',
      "public/logo.svg": "<svg />",
    });
    expect(errors).toEqual([
      "public/service-worker.js:1: active caller targets removed /api/v0/chats boundary",
    ]);
  });

  it("rejects active callers but ignores historical documentation", async () => {
    const errors = await run({
      "src/lib/client.ts": 'fetch("/api/v0/chats/123")',
      "docs/archive/old.md": "`/api/v0/chats/123`",
    });
    expect(errors).toEqual([
      "src/lib/client.ts:1: active caller targets removed /api/v0/chats boundary",
    ]);
  });

  it("recognizes Markdown and sentence URL terminators", async () => {
    const errors = await run({
      "docs/contracts/link.md": "[old endpoint](/api/v0/chats)",
      "docs/contracts/sentence.md": "Call /api/v0/chats now.",
      "docs/contracts/punctuation.md": "Removed: /api/v0/chats.",
    });
    expect(errors).toHaveLength(3);
  });

  it("allows only exact, complete migration-note lines", async () => {
    const errors = await run({
      "docs/schemas/chat-message-ui-parts.md": [
        "> Tidigare `/api/v0/chats/**`-aliases borttagna 2026-04-20 (P29 Fas 1B).",
        "> Tidigare `/api/v0/chats/**`-aliases borttagna 2026-04-20 (P29 Fas 1B). Use /api/v0/chats/new.",
        "Use /api/v0/chats/new as the canonical route.",
      ].join("\n"),
      "docs/schemas/preview-session-contract.md": [
        "(Tidigare `/api/v0/chats/[chatId]/preview-session`-aliaset borttaget i P29 Fas 1B 2026-04-20.)",
        "(Tidigare `/api/v0/chats/[chatId]/...`-aliases borttagna i P29 Fas 1B 2026-04-20.)",
      ].join("\n"),
    });
    expect(errors).toEqual([
      "docs/schemas/chat-message-ui-parts.md:2: active docs reference removed /api/v0/chats boundary",
      "docs/schemas/chat-message-ui-parts.md:3: active docs reference removed /api/v0/chats boundary",
    ]);
  });
});
