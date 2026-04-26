import { describe, expect, it } from "vitest";
import { resolveConnectionString } from "./run-migrations";

// Anchor against env-convention drift for the manual-run migration script.
// The actual resolver lives in `src/lib/db/env.ts` and is unit-tested there;
// this file just guards the wiring inside `run-migrations.ts` so a future
// regression that re-introduces a hand-rolled `process.env.POSTGRES_URL ||
// ...` chain (which is what point 4 of KRAVER-DIALOG-2026-04-24 fixed) is
// caught by `npm run test:ci`.
describe("scripts/db/run-migrations resolveConnectionString", () => {
  it("accepts DATABASE_URL (the alias the standalone script previously ignored)", () => {
    const env = {
      DATABASE_URL: "postgresql://datab.example:5432/devdb",
    } as unknown as NodeJS.ProcessEnv;

    expect(resolveConnectionString(env)).toBe(
      "postgresql://datab.example:5432/devdb",
    );
  });

  it("prefers POSTGRES_URL over DATABASE_URL when both are set", () => {
    const env = {
      POSTGRES_URL: "postgresql://primary.example:5432/db",
      DATABASE_URL: "postgresql://fallback.example:5432/db",
    } as unknown as NodeJS.ProcessEnv;

    expect(resolveConnectionString(env)).toBe(
      "postgresql://primary.example:5432/db",
    );
  });

  it("ignores uninterpolated placeholders and falls through to next alias", () => {
    const env = {
      POSTGRES_URL: "${POSTGRES_URL}",
      DATABASE_URL: "postgresql://datab.example:5432/devdb",
    } as unknown as NodeJS.ProcessEnv;

    expect(resolveConnectionString(env)).toBe(
      "postgresql://datab.example:5432/devdb",
    );
  });

  it("throws with a message that lists every supported alias when nothing is set", () => {
    const env = {} as unknown as NodeJS.ProcessEnv;

    expect(() => resolveConnectionString(env)).toThrow(/POSTGRES_URL/);
    expect(() => resolveConnectionString(env)).toThrow(
      /POSTGRES_URL_NON_POOLING/,
    );
    expect(() => resolveConnectionString(env)).toThrow(/STORAGE_POSTGRES_URL/);
    expect(() => resolveConnectionString(env)).toThrow(
      /STORAGE_POSTGRES_URL_NON_POOLING/,
    );
    expect(() => resolveConnectionString(env)).toThrow(/DATABASE_URL/);
  });
});
