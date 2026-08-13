import { describe, expect, it } from "vitest";
import { dotenvLoadSpec } from "./load-local-env";

describe("loadLocalEnv", () => {
  it("loads .env first, then lets .env.local override when that file exists", () => {
    expect(dotenvLoadSpec(() => false)).toEqual([{ override: false }]);
    expect(dotenvLoadSpec((path) => path === ".env.local")).toEqual([
      { override: false },
      { path: ".env.local", override: true },
    ]);
  });
});
