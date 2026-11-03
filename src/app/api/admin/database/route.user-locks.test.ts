// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const query = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  visibleUserIds: [] as string[],
  capturedUserIds: [] as string[],
  insertedUserId: "new-paying-user",
}));

vi.mock("@/lib/db/client", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  return { db: drizzle({ client: { query } as never }) };
});
vi.mock("@/lib/auth/admin", () => ({
  requireAdminAccess: async () => ({ ok: true, user: { email: "admin@example.test" } }),
}));
vi.mock("@/lib/config", () => ({ FEATURES: { useRedisCache: false }, PATHS: {} }));
vi.mock("@/lib/data/redis", () => ({ getRedisInfo: vi.fn(), flushRedisCache: vi.fn() }));
vi.mock("@/lib/db/services/shared", () => ({
  TEST_USER_EMAIL: "test@example.test",
  getUploadsDir: () => "/tmp/sajtmaskin-user-locks-test-does-not-exist",
}));

const { POST } = await import("./route");

const USER_DELETING_ACTIONS = [
  { action: "clear", table: "users" },
  { action: "reset-all" },
  { action: "mega-cleanup" },
];

function actionRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function userDeleteQuery() {
  const call = query.mock.calls.find(([config]) => config.text.startsWith('delete from "users"'));
  if (!call) throw new Error("Expected a user DELETE");
  return { sql: call[0].text as string, params: call[1] as unknown[] };
}

beforeEach(() => {
  state.visibleUserIds = ["locked-a", "locked-b"];
  state.capturedUserIds = [];
  query.mockReset();
  query.mockImplementation(async (config: { text: string }) => {
    if (config.text.includes("count(*)")) {
      return { rows: [{ subscriptions: 0, grants: 0, jobs: 0, customers: 0 }] };
    }
    if (config.text.startsWith('select "id" from "users"') && config.text.endsWith("for update")) {
      state.capturedUserIds = [...state.visibleUserIds];
      // The lock snapshot excludes a new payer that a later DELETE can see.
      state.visibleUserIds.push(state.insertedUserId);
      return { rows: state.capturedUserIds.map((id) => [id]) };
    }
    return { rows: [] };
  });
});

describe("admin user cleanup — compiled PostgreSQL lock scope (offline driver)", () => {
  it.each(USER_DELETING_ACTIONS)("limits DELETE to captured locks after a new user appears: %j", async (body) => {
    expect((await POST(actionRequest(body))).status).toBe(200);

    expect(state.visibleUserIds).toContain(state.insertedUserId);
    expect(state.capturedUserIds).toEqual(["locked-a", "locked-b"]);
    const { sql, params } = userDeleteQuery();
    const idPredicate = sql.match(/"users"\."id" in \(([^)]+)\)/u);
    expect(idPredicate).not.toBeNull();
    const boundIds = [...idPredicate![1].matchAll(/\$(\d+)/gu)].map((match) => params[Number(match[1]) - 1]);
    expect(boundIds).toEqual(state.capturedUserIds);
    expect(params).not.toContain(state.insertedUserId);
  });

  it.each(USER_DELETING_ACTIONS)("issues no user DELETE for an empty lock snapshot: %j", async (body) => {
    state.visibleUserIds = [];

    expect((await POST(actionRequest(body))).status).toBe(200);

    expect(state.capturedUserIds).toEqual([]);
    expect(state.visibleUserIds).toEqual([state.insertedUserId]);
    expect(query.mock.calls.some(([config]) => config.text.startsWith('delete from "users"'))).toBe(false);
  });

  it("keeps protected emails and all three receipt keys in the compiled DELETE", async () => {
    await POST(actionRequest({ action: "clear", table: "users" }));

    const { sql, params } = userDeleteQuery();
    expect(sql).toContain('"users"."email" not in ($1, $2)');
    expect(params.slice(0, 2)).toEqual(["test@example.test", "admin@example.test"]);
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = "users"."id"');
    expect(sql).toContain("t.stripe_session_id IS NOT NULL OR t.stripe_payment_intent IS NOT NULL OR t.idempotency_key IS NOT NULL");
  });
});
