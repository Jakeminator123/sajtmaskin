import { describe, expect, it } from "vitest";
import { boxTurnPoses, easeTurn, shadeFor, turnDepth, turnRecess, virtualTurnPoses } from "./cube-geometry";
import { makeStep, orientationOf } from "./cube-model";

const W = 400;
const H = 640;

describe("turn geometry", () => {
  it("uses D = W for horizontal turns and D = H for vertical turns", () => {
    expect(turnDepth(makeStep(orientationOf("chat"), "right"), W, H)).toBe(W);
    expect(turnDepth(makeStep(orientationOf("chat"), "up"), W, H)).toBe(H);
  });

  it("starts flat-front and ends with the target flat-front (virtual)", () => {
    const step = makeStep(orientationOf("chat"), "right");
    const [out0, in0] = virtualTurnPoses(step, 0, W, H);
    expect(out0.face).toBe("chat");
    expect(out0.transform).toContain("rotateY(0deg)");
    expect(out0.shade).toBe(0);
    expect(in0.transform).toContain("rotateY(90deg)"); // höger sida
    const [out1, in1] = virtualTurnPoses(step, 1, W, H);
    expect(in1.face).toBe("answers");
    expect(in1.transform).toContain("rotateY(0deg)");
    expect(out1.transform).toContain("rotateY(-90deg)");
    expect(in1.transform).toContain("translateZ(-200px)");
  });

  it("vertical turn brings the top face down", () => {
    const step = makeStep(orientationOf("chat"), "up");
    const [, in0] = virtualTurnPoses(step, 0, W, H);
    expect(in0.transform).toContain("rotateX(90deg)"); // ovansidan
    expect(in0.transform).toContain(`translateZ(${H / 2}px)`);
  });

  it("recesses the box so the near edge never bulges past the rest plane", () => {
    expect(turnRecess(W, 0)).toBe(0);
    expect(turnRecess(W, 90)).toBe(0);
    expect(turnRecess(W, 45)).toBeCloseTo((W / 2) * (Math.SQRT2 - 1), 1);
    const mid = virtualTurnPoses(makeStep(orientationOf("chat"), "right"), 0.5, W, H)[0];
    expect(mid.transform).toContain(`translateZ(-${Math.round((200 + turnRecess(W, -45)) * 100) / 100}px)`);
  });

  it("box variant places the whole ring and rotates the layer", () => {
    const step = makeStep(orientationOf("chat"), "right");
    const box = boxTurnPoses(step, 0.5, W, H);
    expect(box.faces.map((f) => f.face).sort()).toEqual(["answers", "buildlog", "chat", "tools"]);
    expect(box.layerTransform).toContain("rotateY(-45deg)");
  });

  it("eases monotonically from 0 to 1 and shades by angle", () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeTurn(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeTurn(0)).toBe(0);
    expect(easeTurn(1)).toBe(1);
    expect(shadeFor(0)).toBe(0);
    expect(shadeFor(90)).toBeCloseTo(0.55);
  });
});
