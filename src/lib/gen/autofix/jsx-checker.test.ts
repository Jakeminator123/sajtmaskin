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
});
