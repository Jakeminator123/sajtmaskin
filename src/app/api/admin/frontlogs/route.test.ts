import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const readDevLogEntries = vi.hoisted(() => vi.fn(() => []));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminAccess: () => Promise.resolve({ ok: true, user: { id: "admin_1" } }),
}));
vi.mock("@/lib/logging/dev-log-reader", () => ({
  readAvailableDevLogSlugs: () => [],
  readDevLogEntries,
}));

import { GET } from "./route";

describe("GET /api/admin/frontlogs", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["", 120],
    ["?limit=invalid", 120],
    ["?limit=17", 17],
    ["?limit=999", 300],
  ])("uses the expected limit for %s", async (query, expected) => {
    const response = await GET(new NextRequest(`http://localhost/api/admin/frontlogs${query}`));

    expect(response.status).toBe(200);
    expect(readDevLogEntries).toHaveBeenCalledWith({ slug: null, limit: expected });
  });
});
