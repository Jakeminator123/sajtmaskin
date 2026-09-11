import { describe, expect, it } from "vitest";
import {
  drawNamedCardBack,
  resolveLanyardCardBackIdentity,
} from "./lanyard-card-back";

describe("lanyard card back identity", () => {
  it("uses the first name when the user is signed in", () => {
    expect(
      resolveLanyardCardBackIdentity({ name: "Jakob Eberg", email: "jakob@example.com" }),
    ).toBe("Jakob");
  });

  it("falls back to the email local-part without a name", () => {
    expect(
      resolveLanyardCardBackIdentity({ name: "  ", email: "jakob@example.com" }),
    ).toBe("jakob");
  });

  it("keeps the cookie/brand back when signed out", () => {
    expect(resolveLanyardCardBackIdentity(null)).toBeNull();
    expect(resolveLanyardCardBackIdentity({ name: null, email: null })).toBeNull();
  });
});

describe("named card back drawing", () => {
  it("paints the first name and brand wordmark", () => {
    const fills: string[] = [];
    const ctx = {
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      fillRect: () => undefined,
      strokeRect: () => undefined,
      measureText: (text: string) => ({ width: text.length * 40 }),
      fillText: (text: string) => {
        fills.push(text);
      },
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "center",
      textBaseline: "middle",
    } as unknown as CanvasRenderingContext2D;

    drawNamedCardBack(ctx, 1024, 1472, "Jakob");

    expect(fills).toContain("Jakob");
    expect(fills).toContain("Sajtmaskin");
  });
});
