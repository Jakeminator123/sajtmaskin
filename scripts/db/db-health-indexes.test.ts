import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findMissingIndexes, parseIndexDefinition } from "./db-health-indexes.mjs";

type ExpectedIndex = { name: string; columns: string[]; unique?: boolean; partial?: boolean };

/** The kostnadsfri_mail_events entries exactly as declared in db-health-check.mjs. */
function declaredMailEventIndexes(): ExpectedIndex[] {
  const source = readFileSync(join(process.cwd(), "scripts/db/db-health-check.mjs"), "utf8");
  const block = source.match(/const\s+EXPECTED_INDEXES_WITH_COLUMNS\s*=\s*\{([\s\S]*?)\n\};/)?.[1];
  const entry = block?.match(/kostnadsfri_mail_events:\s*\[([\s\S]*?)\n\s{2}\],/)?.[1] ?? "";
  return [...entry.matchAll(/name:\s*"([^"]+)",\s*columns:\s*\[([^\]]*)\]/g)].map((m) => ({
    name: m[1],
    columns: [...m[2].matchAll(/"([^"]+)"/g)].map((c) => c[1]),
  }));
}

function meta(defs: Record<string, string>) {
  const map = new Map<string, { cols: string[]; unique: boolean; partial: boolean }>();
  for (const [name, def] of Object.entries(defs)) {
    const parsed = parseIndexDefinition(def);
    if (parsed) map.set(name, parsed);
  }
  return map;
}

// Index definitions as Postgres renders them for add-kostnadsfri-mail-events.sql.
const MIGRATED = {
  kostnadsfri_mail_events_pkey:
    "CREATE UNIQUE INDEX kostnadsfri_mail_events_pkey ON public.kostnadsfri_mail_events USING btree (message_id)",
  idx_kostnadsfri_mail_events_slug_created:
    "CREATE INDEX idx_kostnadsfri_mail_events_slug_created ON public.kostnadsfri_mail_events USING btree (slug, created_at DESC)",
  idx_kostnadsfri_mail_events_flow_id:
    "CREATE INDEX idx_kostnadsfri_mail_events_flow_id ON public.kostnadsfri_mail_events USING btree (flow_id)",
};

describe("db-health-check: kostnadsfri_mail_events indexes", () => {
  const expected = declaredMailEventIndexes();

  it("declares exactly the two indexes the migration already creates", () => {
    expect(expected).toEqual([
      { name: "idx_kostnadsfri_mail_events_slug_created", columns: ["slug", "created_at"] },
      { name: "idx_kostnadsfri_mail_events_flow_id", columns: ["flow_id"] },
    ]);
  });

  it("reports both as missing when the table only has its primary key (no false green)", () => {
    const defs = { kostnadsfri_mail_events_pkey: MIGRATED.kostnadsfri_mail_events_pkey };
    expect(findMissingIndexes(expected, Object.keys(defs), meta(defs))).toEqual({
      missing: ["idx_kostnadsfri_mail_events_slug_created", "idx_kostnadsfri_mail_events_flow_id"],
      aliasedFor: {},
    });
  });

  it("reports nothing missing on a correctly migrated table", () => {
    expect(findMissingIndexes(expected, Object.keys(MIGRATED), meta(MIGRATED))).toEqual({
      missing: [],
      aliasedFor: {},
    });
  });

  it("accepts a differently named index with exactly the same columns as covering", () => {
    const defs = {
      kostnadsfri_mail_events_pkey: MIGRATED.kostnadsfri_mail_events_pkey,
      mail_events_by_slug:
        "CREATE INDEX mail_events_by_slug ON public.kostnadsfri_mail_events USING btree (slug, created_at DESC)",
      idx_kostnadsfri_mail_events_flow_id: MIGRATED.idx_kostnadsfri_mail_events_flow_id,
    };
    expect(findMissingIndexes(expected, Object.keys(defs), meta(defs))).toEqual({
      missing: [],
      aliasedFor: { idx_kostnadsfri_mail_events_slug_created: "mail_events_by_slug" },
    });
  });

  it("does not let a slug-only index cover (slug, created_at)", () => {
    const defs = {
      by_slug: "CREATE INDEX by_slug ON public.kostnadsfri_mail_events USING btree (slug)",
      idx_kostnadsfri_mail_events_flow_id: MIGRATED.idx_kostnadsfri_mail_events_flow_id,
    };
    expect(findMissingIndexes(expected, Object.keys(defs), meta(defs)).missing).toEqual([
      "idx_kostnadsfri_mail_events_slug_created",
    ]);
  });
});
