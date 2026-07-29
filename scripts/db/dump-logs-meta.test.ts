import { describe, expect, it } from "vitest";
import { META_MAX_STRING, truncateMetaStrings } from "./dump-logs-meta.mjs";

describe("truncateMetaStrings", () => {
  /**
   * R7:s nyttolast är hela poängen med att `meta` exporteras — den får inte
   * kapas.
   */
  it("lämnar R7:s missingByIntegration orörd", () => {
    const meta = {
      error: "tier3_env_not_ready",
      source: "finalize-design",
      missingByIntegration: [
        { key: "resend", name: "Resend", missing: ["RESEND_API_KEY", "EMAIL_FROM"] },
      ],
    };

    expect(truncateMetaStrings(meta)).toEqual(meta);
  });

  /**
   * `quality-gate:*-tooling` bär upp till 12 000 tecken rå build-output från ett
   * bygge som körts med användarens riktiga env-värden.
   */
  it("kapar build-output och säger hur mycket som togs bort", () => {
    const output = "x".repeat(12_000);

    const result = truncateMetaStrings({ failureKind: "tooling", output }) as {
      failureKind: string;
      output: string;
    };

    expect(result.failureKind).toBe("tooling");
    expect(result.output).toContain("[trunkerad, 12000 tecken]");
    expect(result.output.length).toBeLessThan(META_MAX_STRING + 60);
  });

  it("kapar även långa strängar nästlade i arrayer", () => {
    const result = truncateMetaStrings({ items: [{ log: "y".repeat(2_000) }] }) as {
      items: { log: string }[];
    };

    expect(result.items[0]?.log).toContain("[trunkerad, 2000 tecken]");
  });

  it("släpper igenom null och primitiver oförändrade", () => {
    expect(truncateMetaStrings(null)).toBeNull();
    expect(truncateMetaStrings(undefined)).toBeUndefined();
    expect(truncateMetaStrings(42)).toBe(42);
    expect(truncateMetaStrings(true)).toBe(true);
  });
});
