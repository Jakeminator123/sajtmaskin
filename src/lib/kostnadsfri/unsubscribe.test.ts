import { describe, expect, it } from "vitest";
import {
  createUnsubscribeToken,
  normalizeUnsubscribeEmail,
  unsubscribedAtFromExtra,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "./unsubscribe";

const ENV = { KOSTNADSFRI_PASSWORD_SEED: "test-unsub-seed" };

describe("kostnadsfri unsubscribe token", () => {
  it("round-trips email and slug", () => {
    const token = createUnsubscribeToken({ email: "  Ada@Acme.se ", slug: "acme-ab" }, ENV);
    expect(token).toBeTruthy();
    expect(verifyUnsubscribeToken(token, ENV)).toEqual({
      email: "ada@acme.se",
      slug: "acme-ab",
    });
  });

  it("rejects a tampered token and a missing seed", () => {
    const token = createUnsubscribeToken({ email: "ada@acme.se", slug: "acme-ab" }, ENV);
    expect(verifyUnsubscribeToken(`${token}x`, ENV)).toBeNull();
    expect(verifyUnsubscribeToken(token, { KOSTNADSFRI_PASSWORD_SEED: "other" })).toBeNull();
    expect(createUnsubscribeToken({ email: "ada@acme.se", slug: "acme-ab" }, {})).toBeNull();
  });

  it("builds the one-click URL and reads unsubscribedAt from extra_data only", () => {
    expect(unsubscribeUrl("https://sajtmaskin.se/", "tok.en")).toBe(
      "https://sajtmaskin.se/api/kostnadsfri/unsubscribe?token=tok.en",
    );
    expect(unsubscribedAtFromExtra({ unsubscribedAt: "2026-09-16T12:00:00.000Z" })).toBe(
      "2026-09-16T12:00:00.000Z",
    );
    expect(unsubscribedAtFromExtra({ openclaw: { roleLabel: "hemligt" } })).toBeNull();
    expect(normalizeUnsubscribeEmail("  John@Sajtmaskin.SE ")).toBe("john@sajtmaskin.se");
  });
});
