import { beforeEach, describe, expect, it, vi } from "vitest";

const insertValues = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({ values: insertValues }),
  },
  dbConfigured: true,
}));

vi.mock("./shared", () => ({
  assertDbConfigured: () => undefined,
}));

import { clipAnalyticsField, recordPageView } from "./analytics";

describe("clipAnalyticsField", () => {
  it("drops empty values and clips long strings", () => {
    expect(clipAnalyticsField("  ", 10)).toBeNull();
    expect(clipAnalyticsField("abcdefghijklmnop", 8)).toBe("abcdefgh");
    expect(clipAnalyticsField("/builder", 512)).toBe("/builder");
  });
});

describe("recordPageView session_id", () => {
  beforeEach(() => {
    insertValues.mockReset();
    insertValues.mockResolvedValue(undefined);
  });

  it("clips client-controlled session_id like other beacon fields", async () => {
    const hugeSession = `sess_${"x".repeat(400)}`;
    await recordPageView("/builder", hugeSession, undefined, "1.2.3.4");

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/builder",
        session_id: hugeSession.slice(0, 128),
        ip_address: "1.2.3.4",
      }),
    );
  });

  it("does not store kod from the analytics path or the referrer", async () => {
    await recordPageView(
      "/kostnadsfri/ikea-ab?kod=hemligt&variant=rent",
      "sess",
      undefined,
      "1.2.3.4",
      "ua",
      "https://sajtmaskin.se/kostnadsfri/ikea-ab?kod=hemligt&variant=animated",
    );

    const stored = insertValues.mock.calls[0][0] as { path: string; referrer: string };
    expect(stored.path).toBe("/kostnadsfri/ikea-ab?variant=rent");
    expect(stored.referrer).toBe("https://sajtmaskin.se/kostnadsfri/ikea-ab?variant=animated");
    expect(JSON.stringify(stored)).not.toContain("hemligt");
  });

  it("drops blank session_id instead of storing whitespace", async () => {
    await recordPageView("/builder", "   ");

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: null,
      }),
    );
  });
});
