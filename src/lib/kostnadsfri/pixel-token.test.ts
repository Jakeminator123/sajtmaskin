import { describe, expect, it } from "vitest";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";
import { createPixelToken, shouldCountPixelHit, verifyPixelToken } from "./pixel-token";
import {
  KOSTNADSFRI_OPEN_PURPOSE,
  createKostnadsfriSignedToken,
  verifyKostnadsfriSignedToken,
} from "./signed-token";

const ENV = { KOSTNADSFRI_PASSWORD_SEED: "test-pixel-seed" };

describe("kostnadsfri pixel token", () => {
  it("round-trips email, slug and kind inside the signed payload", () => {
    const token = createPixelToken(
      { email: "  Ada@Acme.se ", slug: "acme-ab", kind: "animated" },
      ENV,
    );
    expect(token).toBeTruthy();
    expect(verifyPixelToken(token, ENV)).toEqual({
      email: "ada@acme.se",
      slug: "acme-ab",
      kind: "animated",
    });
    const encoded = token!.split(".")[0];
    expect(Buffer.from(encoded, "base64url").toString("utf8")).toBe(
      '{"email":"ada@acme.se","slug":"acme-ab","kind":"animated"}',
    );
    expect(encoded).not.toContain("=");
  });

  it("rejects a tampered token and a missing seed", () => {
    const token = createPixelToken({ email: "ada@acme.se", slug: "acme-ab", kind: "rent" }, ENV);
    expect(verifyPixelToken(`${token}x`, ENV)).toBeNull();
    expect(verifyPixelToken(token, { KOSTNADSFRI_PASSWORD_SEED: "other" })).toBeNull();
    expect(createPixelToken({ email: "ada@acme.se", slug: "acme-ab", kind: "rent" }, {})).toBeNull();
  });

  it("rejects a token whose kind was edited without a new signature", () => {
    const token = createPixelToken({ email: "ada@acme.se", slug: "acme-ab", kind: "rent" }, ENV)!;
    const [encoded, signature] = token.split(".");
    const json = Buffer.from(encoded, "base64url").toString("utf8").replace("rent", "animated");
    const swapped = `${Buffer.from(json, "utf8").toString("base64url")}.${signature}`;
    expect(verifyPixelToken(swapped, ENV)).toBeNull();
  });

  it("does not accept an unsubscribe token as a pixel token", () => {
    const unsub = createUnsubscribeToken({ email: "ada@acme.se", slug: "acme-ab" }, ENV);
    expect(verifyPixelToken(unsub, ENV)).toBeNull();
  });

  it("does not accept a pixel token as an unsubscribe token", () => {
    const open = createPixelToken({ email: "ada@acme.se", slug: "acme-ab", kind: "rent" }, ENV);
    expect(verifyUnsubscribeToken(open, ENV)).toBeNull();
    expect(verifyKostnadsfriSignedToken("kostnadsfri-unsub-v1", open, ENV)).toBeNull();
  });

  it("rejects an open-purpose token that does not sign kind", () => {
    const token = createKostnadsfriSignedToken(
      KOSTNADSFRI_OPEN_PURPOSE,
      { email: "ada@acme.se", slug: "acme-ab" },
      ENV,
    );
    expect(verifyPixelToken(token, ENV)).toBeNull();
  });
});

describe("pixel debounce", () => {
  it("counts the first hit and ignores repeats within 30 minutes", () => {
    const first = new Date("2026-09-28T10:00:00.000Z");
    expect(shouldCountPixelHit(null, first)).toBe(true);
    expect(shouldCountPixelHit(first, new Date("2026-09-28T10:29:59.000Z"))).toBe(false);
    expect(shouldCountPixelHit(first, new Date("2026-09-28T10:30:00.000Z"))).toBe(true);
  });
});
