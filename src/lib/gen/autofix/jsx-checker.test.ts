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
});
