import { describe, expect, it } from "vitest";
import { resolveSslConfig } from "./db-ssl.mjs";

/**
 * Every DB script that opens a pool (`db-init.mjs`, `run-migrations.ts`,
 * `ensure-schema.mjs`) resolves SSL through here, so these cases lock the
 * contract they all depend on. The failure this prevents is subtle: one script
 * connecting while another rejects the SAME url, which made `db:migrate` fail on
 * `sslmode=disable` even though `db:init` worked.
 */
describe("resolveSslConfig", () => {
  it("disables TLS entirely for sslmode=disable (documented local Postgres)", () => {
    expect(
      resolveSslConfig("postgresql://u:p@localhost:5432/db?sslmode=disable", {
        env: {},
      }),
    ).toBe(false);
  });

  it("verifies certificates by default", () => {
    expect(
      resolveSslConfig("postgresql://u:p@host.pooler.supabase.com:5432/postgres", {
        env: {},
      }),
    ).toEqual({ rejectUnauthorized: true });
  });

  it("keeps verification on for sslmode=require (the production shape)", () => {
    expect(
      resolveSslConfig("postgresql://u:p@host.pooler.supabase.com:5432/postgres?sslmode=require", {
        env: {},
      }),
    ).toEqual({ rejectUnauthorized: true });
  });

  it("relaxes verification via DB_SSL_REJECT_UNAUTHORIZED=false", () => {
    // How prod migrations connect: Supabase presents a self-signed chain.
    expect(
      resolveSslConfig("postgresql://u:p@host:5432/db?sslmode=require", {
        env: { DB_SSL_REJECT_UNAUTHORIZED: "false" },
      }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("relaxes verification via allowInsecureSsl", () => {
    expect(
      resolveSslConfig("postgresql://u:p@host:5432/db", {
        allowInsecureSsl: true,
        env: {},
      }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("keeps sslmode=disable winning over the verification overrides", () => {
    // `disable` means "no TLS", not "TLS without verification" — those inputs
    // control strictness, never whether TLS is used at all.
    expect(
      resolveSslConfig("postgresql://u:p@localhost:5432/db?sslmode=disable", {
        allowInsecureSsl: true,
        env: { DB_SSL_REJECT_UNAUTHORIZED: "false" },
      }),
    ).toBe(false);
  });

  it("falls back to verifying TLS for an unparseable or missing string", () => {
    expect(resolveSslConfig("not-a-url", { env: {} })).toEqual({
      rejectUnauthorized: true,
    });
    expect(resolveSslConfig(undefined, { env: {} })).toEqual({
      rejectUnauthorized: true,
    });
  });
});
