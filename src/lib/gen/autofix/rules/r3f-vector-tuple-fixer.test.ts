import { describe, expect, it } from "vitest";
import { fixR3FVectorTuples } from "./r3f-vector-tuple-fixer";

const CONDENSATION_DROPS_LIKE = `"use client";
import { Canvas, useFrame } from "@react-three/fiber";

const condensationDrops = [
  { position: [-0.28, 0.52, 0.57], scale: [0.035, 0.055, 0.028] as const },
  { position: [-0.14, 0.22, 0.6], scale: [0.03, 0.045, 0.025] as const },
  { position: [0.04, 0.44, 0.6], scale: [0.032, 0.05, 0.026] as const },
];
`;

const NO_R3F_IMPORT = `const config = {
  position: [1, 2, 3],
};
`;

const ALREADY_FIXED = `import { Canvas } from "@react-three/fiber";

const drops = [
  { position: [1, 2, 3] as const, scale: [0.1, 0.1, 0.1] as const },
];
`;

const JSX_INLINE_TUPLE = `import { Canvas } from "@react-three/fiber";

export function Scene() {
  return (
    <mesh position={[1, 2, 3]}>
      <sphereGeometry args={[1, 18, 18]} />
    </mesh>
  );
}
`;

const ROTATION_AND_ARGS_FIELD = `import { useFrame } from "@react-three/fiber";

const meshes = [
  { rotation: [0.1, 0.2, 0.3], args: [1, 2, 3] },
];
`;

const FOUR_ELEMENT_ARGS = `import { Canvas } from "@react-three/fiber";

const geom = {
  args: [1.16, 1.2, 0.34, 48],
};
`;

describe("fixR3FVectorTuples", () => {
  it("appends `as const` to position fields when scale already has it", () => {
    const { code, fixed, fixes } = fixR3FVectorTuples(
      CONDENSATION_DROPS_LIKE,
      "components/flying-meatball-canvas.tsx",
    );
    expect(fixed).toBe(true);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixer).toBe("r3f-vector-tuple-fixer");
    expect(code).toContain("position: [-0.28, 0.52, 0.57] as const");
    expect(code).toContain("position: [-0.14, 0.22, 0.6] as const");
    expect(code).toContain("position: [0.04, 0.44, 0.6] as const");
    expect(code).toContain("scale: [0.035, 0.055, 0.028] as const");
    expect(fixes[0].description).toContain("3 React Three Fiber");
  });

  it("is idempotent", () => {
    const first = fixR3FVectorTuples(CONDENSATION_DROPS_LIKE, "x.tsx");
    expect(first.fixed).toBe(true);
    const second = fixR3FVectorTuples(first.code, "x.tsx");
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });

  it("skips files without R3F or three import (avoid touching unrelated code)", () => {
    const result = fixR3FVectorTuples(NO_R3F_IMPORT, "lib/config.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(NO_R3F_IMPORT);
  });

  it("does not re-touch fields already suffixed by `as const`", () => {
    const result = fixR3FVectorTuples(ALREADY_FIXED, "comp.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(ALREADY_FIXED);
  });

  it("does not match JSX prop literals (already inferred as tuple via contextual typing)", () => {
    const result = fixR3FVectorTuples(JSX_INLINE_TUPLE, "scene.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(JSX_INLINE_TUPLE);
  });

  it("also fixes rotation and 3-arg args object fields", () => {
    const result = fixR3FVectorTuples(ROTATION_AND_ARGS_FIELD, "comp.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain("rotation: [0.1, 0.2, 0.3] as const");
    expect(result.code).toContain("args: [1, 2, 3] as const");
  });

  it("does not touch 4-element args (out of Vector3 tuple scope)", () => {
    const result = fixR3FVectorTuples(FOUR_ELEMENT_ARGS, "geom.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(FOUR_ELEMENT_ARGS);
  });
});
