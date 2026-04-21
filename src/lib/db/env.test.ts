import { describe, expect, it } from "vitest";
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "./env";

describe("db env resolver", () => {
  it("exposes STORAGE aliases in allowed DB env vars", () => {
    expect(DB_ENV_VARS).toContain("STORAGE_POSTGRES_URL");
    expect(DB_ENV_VARS).toContain("STORAGE_POSTGRES_URL_NON_POOLING");
  });

  it("prefers primary POSTGRES_URL when both are set", () => {
    const resolved = resolveConfiguredDbEnv({
      POSTGRES_URL: "postgresql://primary.example:5432/db",
      STORAGE_POSTGRES_URL: "postgresql://storage.example:5432/db",
    } as unknown as NodeJS.ProcessEnv);

    expect(resolved).toEqual({
      name: "POSTGRES_URL",
      connectionString: "postgresql://primary.example:5432/db",
    });
  });

  it("falls back to STORAGE_POSTGRES_URL and ignores placeholders", () => {
    const resolved = resolveConfiguredDbEnv({
      POSTGRES_URL: "${POSTGRES_URL}",
      STORAGE_POSTGRES_URL: "postgresql://storage.example:5432/devdb",
    } as unknown as NodeJS.ProcessEnv);

    expect(resolved).toEqual({
      name: "STORAGE_POSTGRES_URL",
      connectionString: "postgresql://storage.example:5432/devdb",
    });
  });
});
