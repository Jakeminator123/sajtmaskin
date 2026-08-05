import { describe, expect, it } from "vitest";
import {
  columnSignature,
  connectionFromParsedEnv,
  diffSchemas,
  normalizeSqlDef,
} from "./check-schema-parity.mjs";

type SchemaModel = {
  tables: Set<string>;
  columns: Map<string, string>;
  indexes: Map<string, string>;
  constraints: Map<string, string>;
};

function model(partial: Partial<SchemaModel> = {}): SchemaModel {
  return {
    tables: partial.tables ?? new Set(),
    columns: partial.columns ?? new Map(),
    indexes: partial.indexes ?? new Map(),
    constraints: partial.constraints ?? new Map(),
  };
}

describe("normalizeSqlDef", () => {
  it("collapses whitespace and strips a trailing semicolon", () => {
    expect(normalizeSqlDef("CREATE INDEX foo\n  ON bar (baz);")).toBe(
      "CREATE INDEX foo ON bar (baz)",
    );
  });

  it("maps null/undefined/empty to null", () => {
    expect(normalizeSqlDef(null)).toBeNull();
    expect(normalizeSqlDef(undefined)).toBeNull();
    expect(normalizeSqlDef("   ")).toBeNull();
  });
});

describe("columnSignature", () => {
  it("includes type, nullability and normalized default", () => {
    const sig = columnSignature({
      data_type: "text",
      udt_name: "text",
      is_nullable: "YES",
      column_default: " 'x'::text ",
      character_maximum_length: null,
      numeric_precision: null,
      numeric_scale: null,
    });
    expect(sig).toBe("type=text udt=text nullable=YES default='x'::text");
  });

  it("appends length/precision only when present", () => {
    const sig = columnSignature({
      data_type: "numeric",
      udt_name: "numeric",
      is_nullable: "NO",
      column_default: null,
      character_maximum_length: null,
      numeric_precision: 10,
      numeric_scale: 2,
    });
    expect(sig).toContain("precision=10");
    expect(sig).toContain("scale=2");
    expect(sig).not.toContain("maxlen=");
  });
});

describe("diffSchemas", () => {
  it("returns no findings for identical models", () => {
    const a = model({
      tables: new Set(["sites"]),
      columns: new Map([["sites.id", "type=uuid"]]),
      indexes: new Map([["sites_pkey", "CREATE UNIQUE INDEX ..."]]),
      constraints: new Map([["sites.sites_pkey", "PRIMARY KEY (id)"]]),
    });
    const b = model({
      tables: new Set(["sites"]),
      columns: new Map([["sites.id", "type=uuid"]]),
      indexes: new Map([["sites_pkey", "CREATE UNIQUE INDEX ..."]]),
      constraints: new Map([["sites.sites_pkey", "PRIMARY KEY (id)"]]),
    });
    expect(diffSchemas(a, b)).toEqual([]);
  });

  it("reports tables missing on either side, with direction", () => {
    const dev = model({ tables: new Set(["only_dev"]) });
    const prod = model({ tables: new Set(["only_prod"]) });
    const findings = diffSchemas(dev, prod);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ kind: "table", object: "only_dev" });
    expect(findings[0].detail).toContain("saknas i PROD");
    expect(findings[1]).toMatchObject({ kind: "table", object: "only_prod" });
    expect(findings[1].detail).toContain("saknas i DEV");
  });

  it("reports a column that differs, with both signatures", () => {
    const dev = model({
      tables: new Set(["sites"]),
      columns: new Map([["sites.name", "type=text nullable=YES"]]),
    });
    const prod = model({
      tables: new Set(["sites"]),
      columns: new Map([["sites.name", "type=text nullable=NO"]]),
    });
    const findings = diffSchemas(dev, prod);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("column");
    expect(findings[0].detail).toContain("nullable=YES");
    expect(findings[0].detail).toContain("nullable=NO");
  });

  it("reports a dashboard-added column missing in dev", () => {
    const dev = model({ tables: new Set(["sites"]) });
    const prod = model({
      tables: new Set(["sites"]),
      columns: new Map([["sites.sneaky", "type=text"]]),
    });
    const findings = diffSchemas(dev, prod);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "column", object: "sites.sneaky" });
    expect(findings[0].detail).toContain("saknas i DEV");
  });

  it("suppresses column/constraint noise for a table already reported as missing", () => {
    const dev = model({
      tables: new Set(["extra"]),
      columns: new Map([
        ["extra.id", "type=uuid"],
        ["extra.name", "type=text"],
      ]),
      constraints: new Map([["extra.extra_pkey", "PRIMARY KEY (id)"]]),
    });
    const prod = model();
    const findings = diffSchemas(dev, prod);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("table");
  });

  it("reports index definition drift", () => {
    const dev = model({
      tables: new Set(["sites"]),
      indexes: new Map([["idx_sites_name", "CREATE INDEX idx_sites_name ON sites (name)"]]),
    });
    const prod = model({
      tables: new Set(["sites"]),
      indexes: new Map([["idx_sites_name", "CREATE INDEX idx_sites_name ON sites (lower(name))"]]),
    });
    const findings = diffSchemas(dev, prod);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("index");
    expect(findings[0].detail).toContain("skiljer sig");
  });
});

describe("connectionFromParsedEnv", () => {
  it("follows the shared key precedence", () => {
    expect(
      connectionFromParsedEnv({
        DATABASE_URL: "postgres://later",
        POSTGRES_URL: "postgres://first",
      }),
    ).toBe("postgres://first");
  });

  it("skips uninterpolated placeholders and empty values", () => {
    expect(
      connectionFromParsedEnv({
        POSTGRES_URL: "${POSTGRES_URL}",
        DATABASE_URL: "postgres://real",
      }),
    ).toBe("postgres://real");
    expect(connectionFromParsedEnv({ POSTGRES_URL: "  " })).toBeUndefined();
    expect(connectionFromParsedEnv({})).toBeUndefined();
  });
});
