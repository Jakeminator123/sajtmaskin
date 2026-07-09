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

  it("does not generate component stubs for known runtime class names", () => {
    const code = `
"use client";

export default function BrokenScene() {
  return (
    <CanvasErrorBoundary>
      <WebGLRenderer />
    </CanvasErrorBoundary>
  );
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code);
    expect(out).not.toMatch(/web-gl-renderer/);
    expect(out).not.toMatch(/canvas-error-boundary/);
    expect(fixes.some((f) => f.description?.includes("WebGLRenderer"))).toBe(false);
    expect(fixes.some((f) => f.description?.includes("CanvasErrorBoundary"))).toBe(false);
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

  it("marks R3F tag mismatch warnings as preview-blocking", () => {
    const code = `
"use client";

import { Canvas } from "@react-three/fiber";

export default function FloatingWatch3d() {
  return (
    <Canvas>
      <Group>
        <mesh />
    </Canvas>
  );
}
`.trim();
    const { warnings } = runJsxChecker(code, "components/floating-watch-3d.tsx");
    expect(
      warnings.some((warning) =>
        warning.includes("preview-blocking: Tag mismatch for <Group>"),
      ),
    ).toBe(true);
  });

  // Prod chat 1c34592c v3 (fish-pinball): `useRef<HTMLCanvasElement | null>`
  // was counted as a JSX opening tag → false `Tag mismatch for
  // <HTMLCanvasElement>: 1 opening vs 0 closing`, escalated to preview-blocking
  // (the file has a plain <canvas>), which failed the version and sent it into
  // the repair loop. Global DOM/standard type names must be excluded from tag
  // counting the same way fixMissingImports excludes them.
  it("does not report tag mismatch for global DOM types in generic position", () => {
    const code = `
"use client";

import { useEffect, useRef } from "react";

export function FishPinball() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    void ctx;
  }, []);
  return <canvas ref={canvasRef} className="h-full w-full" />;
}

export default FishPinball;
`.trim();
    const { warnings } = runJsxChecker(code, "components/fish-pinball.tsx");
    expect(
      warnings.some((w) => w.includes("Tag mismatch for <HTMLCanvasElement>")),
    ).toBe(false);
  });

  it("does not escalate warnings to preview-blocking for plain HTML <canvas> files", () => {
    // <canvas> (DOM 2D canvas) is not an R3F <Canvas>; a genuine tag mismatch in
    // such a file must stay an ordinary warning, not preview-blocking.
    const code = `
"use client";

export default function Game() {
  return (
    <div>
      <ScoreBoard>
      <canvas className="h-64 w-full" />
    </div>
  );
}
`.trim();
    const { warnings } = runJsxChecker(code, "components/fish-pinball.tsx");
    const mismatch = warnings.find((w) => w.includes("Tag mismatch for <ScoreBoard>"));
    expect(mismatch).toBeDefined();
    expect(mismatch).not.toContain("preview-blocking");
  });

  // shadcn∩lucide collision: a missing Badge used with children/variant is the
  // shadcn component — merging it into the lucide import renders an svg whose
  // children are invalid HTML (hydration mismatch; prod chat 1c34592c v3).
  it("imports missing Badge from shadcn (not lucide) when used with children/variant", () => {
    const code = `
import { Fish } from "lucide-react";

export default function Hero() {
  return (
    <div>
      <Badge variant="secondary">Lokal fångst</Badge>
      <Fish className="h-4 w-4" />
    </div>
  );
}
`.trim();
    const { code: out } = runJsxChecker(code, "app/page.tsx");
    expect(out).toContain('import { Badge } from "@/components/ui/badge"');
    expect(out).not.toMatch(/import\s*\{[^}]*\bBadge\b[^}]*\}\s*from\s*["']lucide-react/);
  });

  it("still merges a missing icon-only collision name into the lucide import", () => {
    const code = `
import { Fish } from "lucide-react";

export default function Hero() {
  return (
    <div>
      <Badge className="h-4 w-4" />
      <Fish className="h-4 w-4" />
    </div>
  );
}
`.trim();
    const { code: out } = runJsxChecker(code, "app/page.tsx");
    expect(out).toMatch(/import\s*\{[^}]*\bBadge\b[^}]*\}\s*from\s*["']lucide-react/);
    expect(out).not.toContain("@/components/ui/badge");
  });

  // Codex P2 (PR #356): mixed shadcn + icon-shaped usage — importing from
  // either module silently mis-binds one of the usages, so the checker must
  // leave the name unresolved (LLM fixer owns it).
  it("skips a mixed shadcn/icon collision usage instead of guessing", () => {
    const code = `
import { Fish } from "lucide-react";

export default function Hero() {
  return (
    <div>
      <Badge variant="secondary">Nyhet</Badge>
      <Badge className="h-4 w-4" />
      <Fish className="h-4 w-4" />
    </div>
  );
}
`.trim();
    const { code: out, warnings } = runJsxChecker(code, "app/page.tsx");
    expect(out).not.toContain("@/components/ui/badge");
    expect(out).not.toMatch(/import\s*\{[^}]*\bBadge\b[^}]*\}\s*from\s*["']lucide-react/);
    expect(warnings.some((w) => w.includes("ambiguous shadcn∩lucide"))).toBe(true);
  });

  // Parse gate (prod incident retro-3D "Monster 3D Sälja TV-spel i Stockholm AB",
  // components/retro-3d-scene.tsx): checkTagMatching's count regexes mis-fire on
  // three perfectly VALID JSX shapes, and the false `Tag mismatch` escalates to a
  // preview-blocking verifier finding → version failed → repair loop that never
  // converges (the code is already correct, so the fixer changes nothing and the
  // checker deterministically re-reports). The TS parser is ground truth: a
  // genuinely unclosed/mis-paired JSX tag always makes the file unparseable, so
  // tag warnings are only emitted when the file fails to parse.

  it("does not report tag mismatch for valid nested self-closing JSX in a prop (fallback={<X />})", () => {
    // Vector A: the strip regex eats the opening tag head because `[^>]*`
    // crosses `fallback={<SceneFallback /` and lands on the nested `/>`.
    // `fallback={<X />}` is the MANDATORY API of the three-fiber-canvas
    // dossier's ThreeCanvasShell, so every 3D generation hits this shape.
    const code = `
"use client";

import { ThreeCanvasShell } from "@/components/three-canvas-shell";
import { SceneFallback } from "@/components/scene-fallback";
import { RetroLogo } from "@/components/retro-logo";

export default function Retro3dScene() {
  return (
    <ThreeCanvasShell className="h-96 w-full" fallback={<SceneFallback />}>
      <ambientLight intensity={0.6} />
      <RetroLogo />
    </ThreeCanvasShell>
  );
}
`.trim();
    const { warnings } = runJsxChecker(code, "components/retro-3d-scene.tsx");
    expect(warnings.some((w) => w.includes("Tag mismatch"))).toBe(false);
  });

  it("does not report tag mismatch for a valid self-closing tag with an arrow-function prop", () => {
    // Vector B: `[^>]*` in the self-closing strip regex cannot cross the `>`
    // of `=>`, so the tag is never stripped and gets counted as an opening.
    const code = `
"use client";

import { useState } from "react";
import { Group } from "@react-three/drei";

export default function HoverPart() {
  const [hovered, setHovered] = useState(false);
  return <Group onPointerOver={() => setHovered(true)} position={[0, 1, 0]} data-hovered={hovered} />;
}
`.trim();
    const { warnings } = runJsxChecker(code, "components/retro-3d-scene.tsx");
    expect(warnings.some((w) => w.includes("Tag mismatch"))).toBe(false);

    // Same guarantee without a filePath (parse gate defaults to TSX dialect).
    const { warnings: noPathWarnings } = runJsxChecker(code);
    expect(noPathWarnings.some((w) => w.includes("Tag mismatch"))).toBe(false);
  });

  it("does not report tag mismatch for an imported type used in generic position", () => {
    // Vector C: `useRef<Group>(null)` with `import type { Group } from "three"`
    // (ubiquitous in R3F/drei code). The #356 guard only covers GLOBAL DOM type
    // names and LOCAL declarations — imported type names were still counted.
    const code = `
"use client";

import { useRef } from "react";
import type { Group } from "three";
import { useFrame } from "@react-three/fiber";

export default function SpinningLogo() {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta;
  });
  return (
    <group ref={groupRef}>
      <mesh />
    </group>
  );
}
`.trim();
    const { warnings } = runJsxChecker(code, "components/retro-3d-scene.tsx");
    expect(warnings.some((w) => w.includes("Tag mismatch for <Group>"))).toBe(false);
  });

  // Prod incident 2026-07-09: `new ReadableStream<Uint8Array>` matched the
  // opening-tag regex (`>` satisfies `[\s/>]`) and the autofix inserted
  // `import Uint8Array from "@/components/uint8-array"`, shadowing the global
  // typed array and crashing /api/assistant in prod.
  it("does not stub a JS global used in a TS generic position (ReadableStream<Uint8Array>)", () => {
    const code = `
"use client";

export default function StreamViewer() {
  const stream = new ReadableStream<Uint8Array>();
  void stream;
  return <div>stream</div>;
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code, "components/stream-viewer.tsx");
    expect(out).not.toMatch(/@\/components\/uint8-array/);
    expect(fixes.some((f) => f.description?.includes("Uint8Array"))).toBe(false);
  });

  it("inserts no component import into an app/api route handler (non-JSX surface)", () => {
    const code = `
export async function POST() {
  return new Response(new ReadableStream<Uint8Array>());
}
`.trim();
    const { code: out, fixes } = runJsxChecker(
      code,
      "app/api/assistant/route.ts",
    );
    expect(out).toBe(code);
    expect(out).not.toMatch(/@\/components\//);
    expect(fixes).toHaveLength(0);
  });

  it("does not phantom-import single-letter generics or Promise<T>", () => {
    const code = `
export default function Page<T>() {
  const items: Promise<T>[] = [];
  void items;
  return <div>ok</div>;
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code, "app/page.tsx");
    expect(out).not.toMatch(/@\/components\/t"/);
    expect(fixes.some((f) => f.description === "Added missing import for <T>")).toBe(
      false,
    );
  });

  it("still inserts a generated import for a real self-closing JSX component (regression)", () => {
    const code = `
export default function Page() {
  return <MyWidget className="p-4" />;
}
`.trim();
    const { code: out, fixes } = runJsxChecker(code, "app/page.tsx");
    expect(out).toContain('import MyWidget from "@/components/my-widget"');
    expect(fixes.some((f) => f.description?.includes("<MyWidget>"))).toBe(true);
  });

  it("still reports (and preview-blocks) a genuine tag mismatch in an R3F-critical file", () => {
    // True positive preserved: <Group> opened but closed by </ThreeCanvasShell>
    // (the exact shape the prod verifier reported). The file does not parse, so
    // the parse gate keeps the count-based warnings as locator hints — including
    // the preview-blocking escalation for R3F-critical paths.
    const code = `
"use client";

import { ThreeCanvasShell } from "@/components/three-canvas-shell";

export default function Retro3dScene() {
  return (
    <ThreeCanvasShell className="h-96 w-full">
      <Group>
    </ThreeCanvasShell>
  );
}
`.trim();
    const { warnings } = runJsxChecker(code, "components/retro-3d-scene.tsx");
    expect(
      warnings.some((w) =>
        w.includes("preview-blocking: Tag mismatch for <Group>"),
      ),
    ).toBe(true);
  });
});
