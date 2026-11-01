import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const readDevLogEntries = vi.hoisted(() => vi.fn(() => []));

vi.mock("@/lib/logging/dev-log-reader", () => ({
  isDevLogViewerEnabled: () => true,
  readAvailableDevLogSlugs: () => [],
  readDevLogEntries,
}));

import { GET } from "./route";

describe("GET /api/dev-log", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["", 200],
    ["?limit=invalid", 200],
    ["?limit=17", 17],
    ["?limit=999", 500],
  ])("uses the expected limit for %s", async (query, expected) => {
    const response = await GET(new NextRequest(`http://localhost/api/dev-log${query}`));

    expect(response.status).toBe(200);
    expect(readDevLogEntries).toHaveBeenCalledWith({ slug: null, limit: expected });
  });
});
