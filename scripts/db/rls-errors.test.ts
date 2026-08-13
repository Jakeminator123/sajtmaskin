import { describe, expect, it } from "vitest";
import { isIgnorableRlsError } from "./rls-errors.mjs";

/**
 * Låser att RLS-setup i `db-init.mjs` inte kan bli grön när `service_role`
 * saknas. Den gamla `message.includes("does not exist")` träffade både
 * saknad tabell (42P01, legitim) och saknad roll (42704, false-green).
 */
describe("isIgnorableRlsError", () => {
  it("sväljer bara undefined_table (42P01)", () => {
    expect(
      isIgnorableRlsError({
        code: "42P01",
        message: 'relation "engine_chats" does not exist',
      }),
    ).toBe(true);
  });

  it("fäller saknad roll (42704) även när meddelandet innehåller does not exist", () => {
    expect(
      isIgnorableRlsError({
        code: "42704",
        message: 'role "service_role" does not exist',
      }),
    ).toBe(false);
  });

  it("fäller andra SQLSTATE, t.ex. undefined_column", () => {
    expect(
      isIgnorableRlsError({
        code: "42703",
        message: 'column "x" does not exist',
      }),
    ).toBe(false);
  });

  it("message-fallback träffar bara relation-formen, inte role-formen", () => {
    expect(
      isIgnorableRlsError(new Error('relation "guest_usage" does not exist')),
    ).toBe(true);
    expect(
      isIgnorableRlsError(new Error('role "service_role" does not exist')),
    ).toBe(false);
  });

  it("fäller orelaterade fel", () => {
    expect(isIgnorableRlsError(new Error("connection refused"))).toBe(false);
    expect(isIgnorableRlsError({ code: "23505" })).toBe(false);
    expect(isIgnorableRlsError(undefined)).toBe(false);
  });
});
