import { describe, expect, it } from "vitest";
import { mergeEnvFileOverProcess } from "./env-merge.mjs";

describe("mergeEnvFileOverProcess", () => {
  it("lets the selected env file win over an inherited process env (the dev/prod footgun)", () => {
    const base = { POSTGRES_URL: "postgres://dev-host/devdb" };
    const parsed = { POSTGRES_URL: "postgres://prod-host/proddb" };
    const merged = mergeEnvFileOverProcess(parsed, base);
    expect(merged.POSTGRES_URL).toBe("postgres://prod-host/proddb");
  });

  it("falls back to process env for keys absent from the file", () => {
    const base = { POSTGRES_URL: "postgres://dev-host/devdb", DB_SSL_REJECT_UNAUTHORIZED: "false" };
    const parsed = { POSTGRES_URL: "postgres://prod-host/proddb" };
    const merged = mergeEnvFileOverProcess(parsed, base);
    expect(merged.POSTGRES_URL).toBe("postgres://prod-host/proddb");
    expect(merged.DB_SSL_REJECT_UNAUTHORIZED).toBe("false");
  });

  it("includes file-only keys", () => {
    const merged = mergeEnvFileOverProcess(
      { DATABASE_URL: "postgres://prod-host/proddb" },
      {},
    );
    expect(merged.DATABASE_URL).toBe("postgres://prod-host/proddb");
  });

  it("does not mutate the inputs", () => {
    const base = { POSTGRES_URL: "postgres://dev-host/devdb" };
    const parsed = { POSTGRES_URL: "postgres://prod-host/proddb" };
    mergeEnvFileOverProcess(parsed, base);
    expect(base.POSTGRES_URL).toBe("postgres://dev-host/devdb");
    expect(parsed.POSTGRES_URL).toBe("postgres://prod-host/proddb");
  });

  it("returns an empty-file passthrough of the base env", () => {
    const base = { POSTGRES_URL: "postgres://dev-host/devdb" };
    const merged = mergeEnvFileOverProcess({}, base);
    expect(merged.POSTGRES_URL).toBe("postgres://dev-host/devdb");
  });
});
