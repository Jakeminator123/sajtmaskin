import { describe, expect, it } from "vitest";
import {
  CUBE_DIRECTIONS,
  CUBE_FACE_IDS,
  advanceTurn,
  idleTurnState,
  isTurnIdle,
  makeStep,
  neighborOf,
  neighborOrientation,
  oppositeOf,
  orientationOf,
  planTurn,
  retargetTurn,
  reverseStep,
  turnDestination,
  type CubeDirection,
  type CubeOrientation,
} from "./cube-model";

const OPP: Record<CubeDirection, CubeDirection> = { left: "right", right: "left", up: "down", down: "up" };

function allOrientations(): CubeOrientation[] {
  const out: CubeOrientation[] = [];
  for (const face of CUBE_FACE_IDS) {
    if (face === "avatar" || face === "sitemap") {
      for (const anchor of ["chat", "answers", "buildlog", "tools"] as const) out.push({ face, anchor });
    } else out.push(orientationOf(face));
  }
  return out;
}

describe("neighborOf", () => {
  it("lays out the equator ring and poles", () => {
    expect(neighborOf("chat", "right")).toBe("answers");
    expect(neighborOf("answers", "right")).toBe("buildlog");
    expect(neighborOf("buildlog", "right")).toBe("tools");
    expect(neighborOf("tools", "right")).toBe("chat");
    expect(neighborOf("chat", "left")).toBe("tools");
    expect(neighborOf("chat", "up")).toBe("avatar");
    expect(neighborOf("buildlog", "down")).toBe("sitemap");
  });

  it("orients the poles by the remembered equator face", () => {
    const top = { face: "avatar", anchor: "answers" } as const;
    expect(neighborOf(top, "down")).toBe("answers");
    expect(neighborOf(top, "left")).toBe("chat");
    expect(neighborOf(top, "right")).toBe("buildlog");
    expect(neighborOf(top, "up")).toBe("tools"); // över polen: motsidan
    const bottom = { face: "sitemap", anchor: "answers" } as const;
    expect(neighborOf(bottom, "up")).toBe("answers");
    expect(neighborOf(bottom, "down")).toBe("tools");
  });

  it("every move is undone by the opposite move (predictable die)", () => {
    for (const o of allOrientations()) {
      for (const d of CUBE_DIRECTIONS) {
        const there = neighborOrientation(o, d);
        // Över polen landar man på en ekvatorsida; vägen tillbaka går via polen igen.
        const back = neighborOrientation(there, OPP[d]);
        if (back.face !== o.face) {
          expect(o.face === "avatar" || o.face === "sitemap").toBe(true);
          continue;
        }
        expect(back.face).toBe(o.face);
      }
    }
  });

  it("never returns the face itself or its opposite as a neighbour from the equator", () => {
    for (const face of ["chat", "answers", "buildlog", "tools"] as const) {
      for (const d of CUBE_DIRECTIONS) {
        const n = neighborOf(face, d);
        expect(n).not.toBe(face);
        expect(n).not.toBe(oppositeOf(face));
      }
    }
  });
});

describe("planTurn", () => {
  it("reaches every face from every orientation in at most two 90° steps", () => {
    for (const o of allOrientations()) {
      for (const target of CUBE_FACE_IDS) {
        const plan = planTurn(o, target);
        if (target === o.face) {
          expect(plan).toEqual([]);
          continue;
        }
        expect(plan.length).toBeGreaterThan(0);
        expect(plan.length).toBeLessThanOrEqual(2);
        expect(plan.at(-1)?.to).toBe(target);
        let at = o;
        for (const step of plan) {
          expect(step.from).toBe(at.face);
          expect(step.degrees).toBe(90);
          expect(step.after).toEqual(neighborOrientation(at, step.direction));
          at = step.after;
        }
      }
    }
  });

  it("is deterministic: opposite via right-right, poles straight up/down", () => {
    expect(planTurn("chat", "buildlog").map((s) => s.direction)).toEqual(["right", "right"]);
    expect(planTurn("chat", "avatar").map((s) => s.direction)).toEqual(["up"]);
    expect(planTurn("chat", "sitemap").map((s) => s.direction)).toEqual(["down"]);
    expect(planTurn({ face: "avatar", anchor: "chat" }, "sitemap").map((s) => s.direction)).toEqual(["down", "down"]);
  });

  it("maps directions to axis and sign", () => {
    expect(makeStep(orientationOf("chat"), "right")).toMatchObject({ axis: "y", sign: -1 });
    expect(makeStep(orientationOf("chat"), "left")).toMatchObject({ axis: "y", sign: 1 });
    expect(makeStep(orientationOf("chat"), "up")).toMatchObject({ axis: "x", sign: -1 });
    expect(makeStep(orientationOf("chat"), "down")).toMatchObject({ axis: "x", sign: 1 });
  });
});

describe("turn engine", () => {
  const run = (state: ReturnType<typeof idleTurnState>, delta = 0.25, max = 100) => {
    let s = state;
    for (let i = 0; i < max && !isTurnIdle(s); i++) s = advanceTurn(s, delta);
    return s;
  };

  it("runs a plan to completion and lands on the target", () => {
    const s = run(retargetTurn(idleTurnState("chat"), "buildlog"));
    expect(s.settled.face).toBe("buildlog");
    expect(isTurnIdle(s)).toBe(true);
  });

  it("rapid retargets end on the last requested face", () => {
    let s = retargetTurn(idleTurnState("chat"), "answers");
    s = advanceTurn(s, 0.3);
    for (const f of ["tools", "avatar", "sitemap", "buildlog", "answers", "avatar"] as const) {
      s = retargetTurn(s, f);
      s = advanceTurn(s, 0.1);
    }
    expect(turnDestination(s)).toBe("avatar");
    expect(run(s).settled.face).toBe("avatar");
  });

  it("reverses an in-flight step in place when asked to go back", () => {
    let s = retargetTurn(idleTurnState("chat"), "answers");
    s = advanceTurn(s, 0); // pop
    s = advanceTurn(s, 0.3);
    expect(s.current?.to).toBe("answers");
    const r = retargetTurn(s, "chat");
    expect(r.current).toEqual(reverseStep(s.current!));
    // Samma vinkel: kvarvarande 70 % av vägen tillbaka, inget hopp.
    expect(r.progress).toBeCloseTo(0.7);
    expect(run(r).settled.face).toBe("chat");
  });

  it("an in-flight step is never cut: a new target is planned from its end", () => {
    let s = retargetTurn(idleTurnState("chat"), "answers");
    s = advanceTurn(s, 0);
    s = advanceTurn(s, 0.6);
    const r = retargetTurn(s, "sitemap");
    expect(r.current).toBe(s.current);
    expect(r.progress).toBe(s.progress);
    expect(r.queue[0].from).toBe("answers");
  });

  it("clamps progress and reports the destination when idle", () => {
    const s = idleTurnState("tools");
    expect(turnDestination(s)).toBe("tools");
    expect(advanceTurn(s, 5)).toBe(s);
  });
});
