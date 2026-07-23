import { describe, expect, it } from "vitest";
import {
  checkDbEnvTarget,
  describeDbTarget,
  extractSupabaseProjectRef,
  loadDbTargets,
  normalizeDbUrlValue,
  resolveConfiguredDbUrl,
} from "./check-db-env-target.mjs";

const targets = {
  dev: { projectRef: "yubbckduwblyrbnlglwf", region: "eu-north-1" },
  prod: { projectRef: "egcitvwgettkftkyzbvn", region: "us-east-1" },
};

const DEV_POOLER =
  "postgres://postgres.yubbckduwblyrbnlglwf:secret@aws-0-eu-north-1.pooler.supabase.com:6543/postgres";
const PROD_POOLER =
  "postgres://postgres.egcitvwgettkftkyzbvn:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const PROD_DIRECT = "postgres://postgres:secret@db.egcitvwgettkftkyzbvn.supabase.co:5432/postgres";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/sajtmaskin?sslmode=disable";

describe("extractSupabaseProjectRef", () => {
  it("extracts the ref from a direct URL (hostname)", () => {
    expect(extractSupabaseProjectRef(PROD_DIRECT)).toEqual({
      ref: "egcitvwgettkftkyzbvn",
      via: "hostname",
    });
  });

  it("extracts the ref from a pooler URL (username)", () => {
    expect(extractSupabaseProjectRef(DEV_POOLER)).toEqual({
      ref: "yubbckduwblyrbnlglwf",
      via: "username",
    });
  });

  it("returns null for non-Supabase URLs", () => {
    expect(extractSupabaseProjectRef(LOCAL)).toBeNull();
    expect(extractSupabaseProjectRef("not a url")).toBeNull();
  });
});

describe("describeDbTarget (sanitized)", () => {
  it("never includes credentials", () => {
    const described = describeDbTarget(PROD_POOLER);
    expect(described).toEqual({
      host: "aws-0-us-east-1.pooler.supabase.com",
      port: "6543",
      database: "postgres",
      projectRef: "egcitvwgettkftkyzbvn",
    });
    expect(JSON.stringify(described)).not.toContain("secret");
  });
});

describe("checkDbEnvTarget", () => {
  it("passes when prod expectation meets the prod project", () => {
    const result = checkDbEnvTarget({ expect: "prod", urlValue: PROD_POOLER, targets });
    expect(result.ok).toBe(true);
    expect(result.level).toBe("ok");
  });

  it("passes when dev expectation meets the dev project", () => {
    const result = checkDbEnvTarget({ expect: "dev", urlValue: DEV_POOLER, targets });
    expect(result.ok).toBe(true);
  });

  it("fails hard when prod expectation gets the DEV project (env mixup)", () => {
    const result = checkDbEnvTarget({ expect: "prod", urlValue: DEV_POOLER, targets });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("FEL MILJÖ");
  });

  it("fails hard when dev expectation gets the PROD project", () => {
    const result = checkDbEnvTarget({ expect: "dev", urlValue: PROD_POOLER, targets });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("FEL MILJÖ");
  });

  it("fails for prod when the URL is not a known Supabase URL", () => {
    const result = checkDbEnvTarget({ expect: "prod", urlValue: LOCAL, targets });
    expect(result.ok).toBe(false);
  });

  it("accepts local Postgres for dev with a warning", () => {
    const result = checkDbEnvTarget({ expect: "dev", urlValue: LOCAL, targets });
    expect(result.ok).toBe(true);
    expect(result.level).toBe("warn");
  });

  it("fails on unknown Supabase projects", () => {
    const result = checkDbEnvTarget({
      expect: "prod",
      urlValue: "postgres://postgres:pw@db.aaaabbbbccccddddeeee.supabase.co:5432/postgres",
      targets,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Okänt Supabase-projekt");
  });

  it("fails when no URL is set", () => {
    const result = checkDbEnvTarget({ expect: "prod", urlValue: undefined, targets });
    expect(result.ok).toBe(false);
  });

  it("never leaks credentials in messages", () => {
    for (const urlValue of [DEV_POOLER, PROD_POOLER, PROD_DIRECT]) {
      for (const expectEnv of ["dev", "prod"] as const) {
        const result = checkDbEnvTarget({ expect: expectEnv, urlValue, targets });
        expect(result.message).not.toContain("secret");
      }
    }
  });
});

describe("normalizeDbUrlValue", () => {
  it("strips surrounding quotes", () => {
    expect(normalizeDbUrlValue(`"${DEV_POOLER}"`)).toBe(DEV_POOLER);
    expect(normalizeDbUrlValue(`'${DEV_POOLER}'`)).toBe(DEV_POOLER);
  });

  it("skips uninterpolated placeholders", () => {
    expect(normalizeDbUrlValue("${POSTGRES_URL}")).toBeUndefined();
    expect(normalizeDbUrlValue("$POSTGRES_URL")).toBeUndefined();
  });

  it("returns undefined for empty/whitespace/non-strings", () => {
    expect(normalizeDbUrlValue("   ")).toBeUndefined();
    expect(normalizeDbUrlValue(undefined)).toBeUndefined();
  });
});

describe("resolveConfiguredDbUrl", () => {
  it("falls back past an uninterpolated POSTGRES_URL placeholder to a real alias", () => {
    // Speglar runtime-kontraktet i src/lib/db/env.ts: primärnyckeln är en
    // ointerpolerad template, den riktiga URL:en ligger i storage-aliaset.
    const resolved = resolveConfiguredDbUrl({
      POSTGRES_URL: "${POSTGRES_URL}",
      STORAGE_POSTGRES_URL: DEV_POOLER,
    });
    expect(resolved).toEqual({ key: "STORAGE_POSTGRES_URL", value: DEV_POOLER });
  });

  it("takes the first real URL in key order", () => {
    const resolved = resolveConfiguredDbUrl({
      POSTGRES_URL: PROD_POOLER,
      DATABASE_URL: DEV_POOLER,
    });
    expect(resolved).toEqual({ key: "POSTGRES_URL", value: PROD_POOLER });
  });

  it("returns null when only placeholders are set", () => {
    expect(resolveConfiguredDbUrl({ POSTGRES_URL: "${POSTGRES_URL}" })).toBeNull();
  });
});

describe("loadDbTargets", () => {
  it("loads the canonical config with both envs", () => {
    const loaded = loadDbTargets();
    expect(loaded.dev.projectRef).toBe("yubbckduwblyrbnlglwf");
    expect(loaded.prod.projectRef).toBe("egcitvwgettkftkyzbvn");
  });
});
