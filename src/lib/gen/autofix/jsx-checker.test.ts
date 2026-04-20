import { describe, expect, it } from "vitest";
import { runJsxChecker } from "./jsx-checker";

describe("runJsxChecker", () => {
  it("does not add lucide Group when Group is imported via import type from three", () => {
    const code = `
import type { Group } from "three";
import { Canvas } from "@react-three/fiber";

export function FloatingJewel() {
  const ref = useRef<Group | null>(null);
  return (
    <Canvas>
      <Group ref={ref} />
    </Canvas>
  );
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code);
    expect(out).not.toMatch(/from "lucide-react"/);
    expect(fixes.some((f) => f.description?.includes("lucide"))).toBe(false);
  });

  it("does not add lucide Mesh/Box/Plane when imported from @react-three/drei", () => {
    const code = `
import { Canvas } from "@react-three/fiber";
import { Box, Plane, Text } from "@react-three/drei";

export default function Scene() {
  return (
    <Canvas>
      <Box position={[0, 0, 0]} />
      <Plane args={[10, 10]} />
      <Text>Hello</Text>
    </Canvas>
  );
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code);
    expect(out).not.toMatch(/from "lucide-react"/);
    expect(fixes.some((f) => f.description?.includes("lucide"))).toBe(false);
  });

  it("still adds lucide icon when it is genuinely missing and not from three/drei", () => {
    const code = `
export default function Page() {
  return <Box className="p-4">content</Box>;
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code);
    expect(out).toMatch(/from "lucide-react"/);
    expect(fixes.some((f) => f.description?.includes("lucide"))).toBe(true);
  });

  it("does not generate @/components stub for HTMLDivElement used as a generic type", () => {
    const code = `
"use client";

import { useRef } from "react";

export default function Reveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  return <div ref={ref}>content</div>;
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code);
    expect(out).not.toMatch(/from "@\/components\/html-div-element"/);
    expect(
      fixes.some((f) => f.description?.includes("HTMLDivElement")),
    ).toBe(false);
  });

  it("does not generate @/components stub for HTMLFormElement in FormEvent generic", () => {
    const code = `
"use client";

import type { FormEvent } from "react";

export default function ContactForm() {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }
  return <form onSubmit={handleSubmit}><input /></form>;
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code);
    expect(out).not.toMatch(/from "@\/components\/html-form-element"/);
    expect(
      fixes.some((f) => f.description?.includes("HTMLFormElement")),
    ).toBe(false);
  });

  it("recognises multiline named imports so RapierRigidBody is not duplicated", () => {
    const code = `
"use client";

import { useRef } from "react";
import {
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";

export default function CoffeeBeanBody() {
  const ref = useRef<RapierRigidBody | null>(null);
  return <RigidBody ref={ref} />;
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code);
    expect(out).not.toMatch(/from "@\/components\/rapier-rigid-body"/);
    expect(
      fixes.some((f) => f.description?.includes("RapierRigidBody")),
    ).toBe(false);
  });
});
