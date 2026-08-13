import { describe, expect, it } from "vitest";
import { dotenvLoadSpec } from "./load-local-env";

describe("loadLocalEnv", () => {
  it("lets .env.local override .env when the local file exists", () => {
    const spec = dotenvLoadSpec();
    expect(spec[0]).toEqual({ override: false });
    const local = spec.find((entry) => entry.path === ".env.local");
    if (local) {
      expect(local.override).toBe(true);
    }
  });
});
