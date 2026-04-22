import { describe, expect, it } from "vitest";
import { fixTypeOnlyImports } from "./type-only-import-fixer";

const POINTER_POSITION_CASE = `"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerPosition } from "@/components/use-pointer-parallax";
import { useEffect, useRef, type MutableRefObject } from "react";

function Mascot({
  pointerRef,
  reducedMotion,
}: {
  pointerRef: MutableRefObject<PointerPosition>;
  reducedMotion: boolean;
}) {
  return null;
}

export function MeatballScene({
  pointerRef,
}: {
  pointerRef: MutableRefObject<PointerPosition>;
}) {
  return <Mascot pointerRef={pointerRef} reducedMotion={false} />;
}
`;

const VALUE_USED_CASE = `import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;

const MIXED_USAGE_CASE = `import { Group } from "three";

const ref: { current: Group | null } = { current: null };
const factory = () => new Group();

export { ref, factory };
`;

const MIXED_IMPORT_PARTIAL_TYPE_CASE = `import { Foo, Bar } from "@/lib";

interface Props {
  foo: Foo;
}

export function Use(props: Props) {
  return Bar(props.foo);
}
`;

const ALREADY_TYPE_ONLY_CASE = `import type { Group } from "three";

const ref: { current: Group | null } = { current: null };
`;

const JSX_VALUE_CASE = `import { Button } from "@/ui";

export function Page() {
  return <Button variant="primary">Hello</Button>;
}
`;

const MEMBER_ACCESS_VALUE_CASE = `import { MathUtils } from "three";

export const clamped = MathUtils.clamp(0.5, 0, 1);
`;

const TYPEOF_VALUE_CASE = `import { schema } from "@/lib/schema";

export type Inferred = typeof schema;
`;

const NEW_OPERATOR_VALUE_CASE = `import { EventEmitter } from "node:events";

export const emitter = new EventEmitter();
`;

const MULTI_TYPE_BLOCK_CASE = `import { Mesh, Group } from "three";

interface SceneRefs {
  mesh: Mesh;
  group: Group;
}

export type { SceneRefs };
`;

describe("fixTypeOnlyImports", () => {
  it("converts an import that is only ever used as a type (PointerPosition empirical case)", () => {
    const { code, fixed, fixes } = fixTypeOnlyImports(
      POINTER_POSITION_CASE,
      "components/flying-meatball-canvas.tsx",
    );
    expect(fixed).toBe(true);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixer).toBe("type-only-import-fixer");
    expect(code).toContain('import type { PointerPosition } from "@/components/use-pointer-parallax";');
    // Other (legitimately-value) imports stay unchanged.
    expect(code).toContain('import { Canvas, useFrame, useThree } from "@react-three/fiber";');
  });

  it("does NOT convert when the symbol is used as a value (function call)", () => {
    const result = fixTypeOnlyImports(VALUE_USED_CASE, "components/counter.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(VALUE_USED_CASE);
  });

  it("does NOT convert when the symbol has both type and value usage (Group)", () => {
    const result = fixTypeOnlyImports(MIXED_USAGE_CASE, "lib/refs.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(MIXED_USAGE_CASE);
  });

  it("does NOT split mixed-import blocks where one specifier is a value", () => {
    const result = fixTypeOnlyImports(MIXED_IMPORT_PARTIAL_TYPE_CASE, "lib/use.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(MIXED_IMPORT_PARTIAL_TYPE_CASE);
  });

  it("is idempotent on imports already marked type-only", () => {
    const result = fixTypeOnlyImports(ALREADY_TYPE_ONLY_CASE, "lib/refs.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(ALREADY_TYPE_ONLY_CASE);
  });

  it("does NOT convert components used in JSX", () => {
    const result = fixTypeOnlyImports(JSX_VALUE_CASE, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(JSX_VALUE_CASE);
  });

  it("does NOT convert symbols accessed via member dot", () => {
    const result = fixTypeOnlyImports(MEMBER_ACCESS_VALUE_CASE, "lib/util.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(MEMBER_ACCESS_VALUE_CASE);
  });

  it("does NOT convert symbols referenced by `typeof` (typeof requires a value)", () => {
    const result = fixTypeOnlyImports(TYPEOF_VALUE_CASE, "lib/types.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(TYPEOF_VALUE_CASE);
  });

  it("does NOT convert symbols used with `new`", () => {
    const result = fixTypeOnlyImports(NEW_OPERATOR_VALUE_CASE, "lib/emitter.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(NEW_OPERATOR_VALUE_CASE);
  });

  it("converts a multi-symbol import where ALL specifiers are used only as types", () => {
    const { code, fixed, fixes } = fixTypeOnlyImports(MULTI_TYPE_BLOCK_CASE, "lib/scene.ts");
    expect(fixed).toBe(true);
    expect(fixes).toHaveLength(1);
    expect(code).toContain('import type { Mesh, Group } from "three";');
    expect(fixes[0].description).toMatch(/Mesh, Group/);
  });

  it("is idempotent (running twice yields no change)", () => {
    const first = fixTypeOnlyImports(POINTER_POSITION_CASE, "x.tsx");
    expect(first.fixed).toBe(true);
    const second = fixTypeOnlyImports(first.code, "x.tsx");
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });
});
