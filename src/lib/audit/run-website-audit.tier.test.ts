import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("runWebsiteAudit tier wiring", () => {
  const engine = readFileSync(resolve("src/lib/audit/run-website-audit.ts"), "utf8");

  it("uses resolveAuditRun instead of promptKind/model/web-search booleans", () => {
    expect(engine).toMatch(/resolveAuditRun\(\{ promptKind, auditMode: input\.auditMode \}\)/);
    expect(engine).toMatch(/scrapeWebsite\(normalizedUrl, \{ maxPages: run\.maxPages \}\)/);
    expect(engine).toMatch(/schema: run\.schema/);
    expect(engine).toMatch(/allowWebSearch = run\.allowWebSearch/);
    expect(engine).toMatch(/omitAdvancedOnlyFields/);
    expect(engine).not.toMatch(/FEATURES\.useAuditWebSearch/);
    expect(engine).not.toMatch(/AUDIT_AI_SCHEMA,/);
  });

  it("logs tier, pages, model and web-search on the existing cost line", () => {
    expect(engine).toMatch(/web_search=\$\{allowWebSearch\}/);
    expect(engine).toMatch(/pages=\$\{\s*run\.maxPages/);
    expect(engine).toMatch(/model=\$\{usedModel/);
  });
});
