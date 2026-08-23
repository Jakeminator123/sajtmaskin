import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readComponent = (name: string) =>
  readFileSync(resolve(process.cwd(), `src/components/landing-v2/${name}`), "utf8");

describe("lanyard mobile interactions", () => {
  it("lets vertical gestures scroll and releases the 3D drag on cancellation", () => {
    const source = readComponent("lanyard-card.tsx");

    expect(source).toContain('touchAction: "pan-y pinch-zoom"');
    expect(source).toContain("onPointerCancel");
    expect(source).toContain("onLostPointerCapture");
    expect(source).not.toContain('touchAction: "none"');
  });

  it("applies the same scroll-safe contract to the lower badge", () => {
    const source = readComponent("lanyard-badge.tsx");

    expect(source).toContain('touchAction: runPhysics ? "pan-y pinch-zoom" : "auto"');
    expect(source).toContain("onPointerCancel");
    expect(source).toContain("onLostPointerCapture");
    expect(source).not.toContain('touchAction: runPhysics ? "none"');
  });
});
