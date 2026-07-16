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
  it("accepts the canonical engine route and the surviving v0 deploy boundary", async () => {
    await expect(
      run({
        "src/app/api/engine/chats/route.ts": "export async function POST() {}",
        "src/app/api/v0/deployments/route.ts": "export async function POST() {}",
        "src/lib/api/engine-chats-path.ts": "// /api/v0/chats was removed",
      }),
    ).resolves.toEqual([]);
  });

  it("rejects a reintroduced v0 chat route", async () => {
    await expect(
      run({ "src/app/api/v0/chats/[chatId]/route.ts": "export async function GET() {}" }),
    ).resolves.toEqual([
      "src/app/api/v0/chats/[chatId]/route.ts: removed v0 chat route must not reappear",
    ]);
  });

  it("rejects an active caller but ignores historical documentation", async () => {
    const errors = await run({
      "src/lib/client.ts": 'fetch("/api/v0/chats/123")',
      "docs/archive/old.md": "`/api/v0/chats/123`",
    });
    expect(errors).toEqual([
      "src/lib/client.ts:1: active caller targets removed /api/v0/chats boundary",
    ]);
  });

  it("rejects new active documentation references but allows the two migration notes", async () => {
    const errors = await run({
      "docs/contracts/new.md": "Call `/api/v0/chats/123`.",
      "docs/schemas/chat-message-ui-parts.md": "The `/api/v0/chats/**` aliases were removed.",
      "docs/schemas/preview-session-contract.md": "The `/api/v0/chats/x` alias was removed.",
    });
    expect(errors).toEqual([
      "docs/contracts/new.md:1: active docs reference removed /api/v0/chats boundary",
    ]);
  });
});
