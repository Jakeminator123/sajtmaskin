import { describe, expect, it } from "vitest";
import { checkMotionReduceTrap } from "./verifier-pass";

const TRAP_CLASS = `motion-reduce` + `:hidden`;

describe("checkMotionReduceTrap", () => {
  it("verifier flags motion-reduce:hidden on Canvas", () => {
    const findings = checkMotionReduceTrap([
      {
        path: "components/Scene.tsx",
        content: [
          'import { Canvas } from "@react-three/fiber";',
          "export function Scene() {",
          `  return <Canvas className="${TRAP_CLASS} h-screen w-full"><mesh /></Canvas>;`,
          "}",
        ].join("\n"),
      },
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("motion-reduce-canvas-trap");
    expect(findings[0]?.detail).toContain("motion-reduce trap");
    expect(findings[0]?.detail).toContain("components/Scene.tsx");
  });

  it("accepts Canvas when a motion-safe: counterpart class is present", () => {
    const findings = checkMotionReduceTrap([
      {
        path: "components/Scene.tsx",
        content:
          `<Canvas className="${TRAP_CLASS} motion-safe:block h-screen"><mesh /></Canvas>`,
      },
    ]);
    expect(findings).toEqual([]);
  });

  it("flags fixed full-screen overlays that hide under reduced motion", () => {
    const findings = checkMotionReduceTrap([
      {
        path: "components/Background.tsx",
        content:
          `<div className="fixed inset-0 pointer-events-none ${TRAP_CLASS}">` +
          `<Canvas /></div>`,
      },
    ]);
    expect(findings.some((f) => f.id === "motion-reduce-overlay-trap")).toBe(true);
  });

  it("ignores files without the trap class", () => {
    const findings = checkMotionReduceTrap([
      { path: "components/Hero.tsx", content: '<Canvas className="h-screen" />' },
      { path: "lib/util.ts", content: "export const x = 1;" },
    ]);
    expect(findings).toEqual([]);
  });

  it("ignores non-tsx/jsx files even when the literal substring appears", () => {
    const findings = checkMotionReduceTrap([
      { path: "app/globals.css", content: `.bad { /* ${TRAP_CLASS} */ }` },
    ]);
    expect(findings).toEqual([]);
  });
});
