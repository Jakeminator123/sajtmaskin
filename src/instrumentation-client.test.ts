import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("instrumentation-client", () => {
  it("turns off Zod's JIT so schema compilation stops tripping script-src", async () => {
    expect(z.config().jitless).not.toBe(true);

    await import("./instrumentation-client");

    expect(z.config().jitless).toBe(true);
  });

  it("keeps object schemas parsing without the JIT path", async () => {
    await import("./instrumentation-client");

    const schema = z.object({ slug: z.string(), count: z.number() });

    expect(schema.parse({ slug: "sajtmaskin", count: 1 })).toEqual({
      slug: "sajtmaskin",
      count: 1,
    });
    expect(schema.safeParse({ slug: "sajtmaskin", count: "1" }).success).toBe(false);
  });
});
