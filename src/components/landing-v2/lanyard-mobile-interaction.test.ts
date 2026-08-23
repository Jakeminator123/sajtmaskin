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

  it("keeps the settled business card inside the camera instead of clipping its bottom", () => {
    const source = readComponent("lanyard-card.tsx");

    expect(source).toContain("const ROPE_SEGMENT_LENGTH = 0.75");
    expect(source).toContain(
      "const CARD_START_Y = -(ROPE_SEGMENT_LENGTH * 3 + CARD_JOINT_Y)",
    );
    expect(source.match(/ROPE_SEGMENT_LENGTH\]\)/g)).toHaveLength(3);
    expect(source).toContain("position={[0, CARD_START_Y, 0]}");
  });

  it("applies the same scroll-safe contract to the lower badge", () => {
    const source = readComponent("lanyard-badge.tsx");

    expect(source).toContain('touchAction: runPhysics ? "pan-y pinch-zoom" : "auto"');
    expect(source).toContain("onPointerCancel");
    expect(source).toContain("onLostPointerCapture");
    expect(source).not.toContain('touchAction: runPhysics ? "none"');
  });

  it("keeps the interactive canvas within a reduced adaptive render budget", () => {
    const lanyard = readComponent("lanyard-card.tsx");
    const journey = readComponent("how-it-works-scene.tsx");

    expect(lanyard).toContain("<AdaptiveDpr />");
    expect(lanyard).toContain("dpr={[1, 1.35]}");
    expect(lanyard).toContain("<Environment resolution={64}>");
    expect(lanyard).toContain("const bandPoints = useRef");

    expect(journey).toContain('frameloop={sceneActive ? "always" : "never"}');
    expect(journey).toContain("setSceneActive(isNearViewport)");
    expect(journey).toContain("<AdaptiveDpr />");
  });
});
