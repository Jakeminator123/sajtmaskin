import { describe, expect, it } from "vitest";
import { evaluateVerificationFreshness } from "./check-verification-freshness.mjs";

const policy = {
  hardMaxAgeDays: 120,
  softMaxAgeDays: 180,
  warningWindowDays: 30,
};
const now = new Date("2026-08-01T14:00:00.000Z");

describe("dossier verification freshness", () => {
  it("uses a shorter cadence for provider-coupled dossiers", () => {
    const result = evaluateVerificationFreshness({
      now,
      policy,
      dossiers: [
        { id: "hard-old", class: "hard", lastVerified: "2026-03-01" },
        { id: "soft-old", class: "soft", lastVerified: "2026-03-01" },
      ],
    });

    expect(result.stale.map((row) => row.id)).toEqual(["hard-old"]);
    expect(result.warnings.map((row) => row.id)).toEqual(["soft-old"]);
  });

  it("warns before expiry and fails only after max age", () => {
    const result = evaluateVerificationFreshness({
      now,
      policy,
      dossiers: [
        { id: "due-soon", class: "hard", lastVerified: "2026-04-17" },
        { id: "boundary", class: "hard", lastVerified: "2026-04-03" },
        { id: "expired", class: "hard", lastVerified: "2026-04-02" },
      ],
    });

    expect(result.warnings.map((row) => row.id)).toEqual(["due-soon", "boundary"]);
    expect(result.stale.map((row) => row.id)).toEqual(["expired"]);
  });

  it("rejects impossible and future evidence dates", () => {
    const result = evaluateVerificationFreshness({
      now,
      policy,
      dossiers: [
        { id: "invalid", class: "hard", lastVerified: "2026-02-30" },
        { id: "future", class: "soft", lastVerified: "2026-08-02" },
      ],
    });

    expect(result.invalid.map((row) => row.id)).toEqual(["invalid"]);
    expect(result.future.map((row) => row.id)).toEqual(["future"]);
  });

  it("never treats a recent legacy source date as accepted evidence", () => {
    const result = evaluateVerificationFreshness({
      now,
      policy,
      dossiers: [
        {
          id: "legacy-import",
          class: "hard",
          lastVerified: "2026-07-31",
          verificationStatus: "unverified",
        },
      ],
    });

    expect(result.current).toEqual([]);
    expect(result.unverified.map((row) => row.id)).toEqual(["legacy-import"]);
  });
});
