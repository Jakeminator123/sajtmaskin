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

  // SAJ-63: TS generics like `useState<GamePhase>(…)` were treated as JSX
  // openings, producing phantom imports from non-existent files and
  // "Tag mismatch for <GamePhase>" warnings. Same root cause as SAJ-61b but
  // for `type`/`interface`/`class` declarations rather than `Lane`-style
  // type aliases captured by the original local-decl guard.
  it("does not phantom-import a TS type used in generic position with local declaration", () => {
    const code = `
"use client";
import { useState } from "react";

type GamePhase = "idle" | "playing" | "finished";
type SausageType = "classic" | "crispy" | "burnt";

export default function KorvGame() {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [type, setType] = useState<SausageType>("classic");
  return <div>{phase} {type}</div>;
}
`.trim();
    const { code: out, fixes, warnings } = runJsxChecker(code);
    expect(out).not.toMatch(/from "@\/components\/game-phase"/);
    expect(out).not.toMatch(/from "@\/components\/sausage-type"/);
    expect(
      fixes.some(
        (f) =>
          f.description?.includes("GamePhase") ||
          f.description?.includes("SausageType"),
      ),
    ).toBe(false);
    expect(
      warnings.some((w) => w.includes("Tag mismatch for <GamePhase>")),
    ).toBe(false);
    expect(
      warnings.some((w) => w.includes("Tag mismatch for <SausageType>")),
    ).toBe(false);
  });

  it("respects local interface and class declarations the same way", () => {
    const code = `
interface ButtonProps { label: string }
class Logger { log() {} }

export default function Demo() {
  const ref = useRef<ButtonProps>(null);
  const log = useRef<Logger>(null);
  return <div />;
}
`.trim();
    const { code: out } = runJsxChecker(code);
    expect(out).not.toMatch(/from "@\/components\/button-props"/);
    expect(out).not.toMatch(/from "@\/components\/logger"/);
  });

  // SAJ-63: hook files (use-*.ts/tsx, /hooks/*) are named-export hooks, not
  // components. The default-export heuristic produced a noisy false positive
  // `No default export found` warning on every such file.
  it("skips default-export check for use-* hook files", () => {
    const code = `
"use client";
import { useEffect, useState } from "react";

export function useReducedMotion() {
  const [v, setV] = useState(false);
  useEffect(() => { setV(true); }, []);
  return v;
}
`.trim();
    const { warnings: noPath } = runJsxChecker(code);
    // Without filePath, the legacy behaviour kicks in (warning emitted).
    expect(
      noPath.some((w) => w.includes("No default export found")),
    ).toBe(true);

    const { warnings: hookWarnings } = runJsxChecker(
      code,
      "hooks/use-reduced-motion.ts",
    );
    expect(
      hookWarnings.some((w) => w.includes("No default export found")),
    ).toBe(false);

    const { warnings: prefixedHookWarnings } = runJsxChecker(
      code,
      "components/use-pointer.tsx",
    );
    expect(
      prefixedHookWarnings.some((w) => w.includes("No default export found")),
    ).toBe(false);
  });
});
