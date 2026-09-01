import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: true }));

import { clipAnalyticsField } from "./analytics";

describe("clipAnalyticsField", () => {
  it("drops empty values and clips long strings", () => {
    expect(clipAnalyticsField("  ", 10)).toBeNull();
    expect(clipAnalyticsField("abcdefghijklmnop", 8)).toBe("abcdefgh");
    expect(clipAnalyticsField("/builder", 512)).toBe("/builder");
  });
});
