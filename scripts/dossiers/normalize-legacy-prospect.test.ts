import { describe, expect, it } from "vitest";
import { parseProspectsPlanFile } from "./normalize-legacy-prospect";

/**
 * Regression test for backlog A#15 (#419): a broken prospects.json crashed
 * the CLI with an opaque `undefined.filter` TypeError. The parser must fail
 * with an actionable message for invalid JSON / missing or malformed
 * `prospects`, and pass valid payloads through untouched.
 */
describe("parseProspectsPlanFile", () => {
  const PLAN_PATH = "/tmp/dossiers-prospect/prospects.json";

  it("parses a valid plan file", () => {
    const raw = JSON.stringify({
      prospects: [
        { legacyId: "old-1", targetId: "acme-pay", targetClass: "hard", targetCapability: "payments" },
      ],
    });
    const plans = parseProspectsPlanFile(raw, PLAN_PATH);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.legacyId).toBe("old-1");
  });

  it("throws an actionable error on invalid JSON (previously undefined.filter)", () => {
    expect(() => parseProspectsPlanFile("{ trasig json", PLAN_PATH)).toThrow(
      /prospects\.json is not valid JSON/,
    );
  });

  it("throws when the prospects key is missing", () => {
    expect(() => parseProspectsPlanFile(JSON.stringify({ other: [] }), PLAN_PATH)).toThrow(
      /must contain a "prospects" array/,
    );
  });

  it("throws when prospects is not an array", () => {
    expect(() =>
      parseProspectsPlanFile(JSON.stringify({ prospects: { nope: true } }), PLAN_PATH),
    ).toThrow(/must contain a "prospects" array/);
  });

  it("throws when the top level is not an object", () => {
    expect(() => parseProspectsPlanFile("null", PLAN_PATH)).toThrow(
      /must contain a "prospects" array/,
    );
  });
});
