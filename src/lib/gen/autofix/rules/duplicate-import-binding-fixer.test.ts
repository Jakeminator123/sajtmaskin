import { describe, it, expect } from "vitest";
import { fixDuplicateImportBindings } from "./duplicate-import-binding-fixer";

describe("fixDuplicateImportBindings", () => {
  it("removes duplicate default import when named alias exists", () => {
    const code = [
      'import { ArrowRight, Camera, Hash as ImageIcon, Sparkles } from "lucide-react"',
      'import { Badge } from "@/components/ui/badge"',
      'import Image from "next/image"',
      'import { Button } from "@/components/ui/button"',
      'import ImageIcon from "@/components/image-icon"',
      "",
      "export default function Page() {",
      "  return <ImageIcon className=\"h-5 w-5\" />",
      "}",
    ].join("\n");

    const result = fixDuplicateImportBindings(code, "app/page.tsx");

    expect(result.fixed).toBe(true);
    expect(result.removedBindings).toEqual(["ImageIcon"]);
    expect(result.code).not.toContain("@/components/image-icon");
    expect(result.code).toContain("Hash as ImageIcon");
  });

  it("prefers package import over local stub", () => {
    const code = [
      'import MyIcon from "@/components/my-icon"',
      'import { Star as MyIcon } from "lucide-react"',
    ].join("\n");

    const result = fixDuplicateImportBindings(code, "app/page.tsx");

    expect(result.fixed).toBe(true);
    expect(result.removedBindings).toEqual(["MyIcon"]);
    expect(result.code).not.toContain("@/components/my-icon");
    expect(result.code).toContain("Star as MyIcon");
  });

  it("does nothing when no duplicates exist", () => {
    const code = [
      'import { Button } from "@/components/ui/button"',
      'import { Badge } from "@/components/ui/badge"',
      'import Image from "next/image"',
    ].join("\n");

    const result = fixDuplicateImportBindings(code, "app/page.tsx");

    expect(result.fixed).toBe(false);
    expect(result.removedBindings).toEqual([]);
    expect(result.code).toBe(code);
  });

  it("handles duplicate named imports from different sources", () => {
    const code = [
      'import { cn } from "@/lib/utils"',
      'import { cn } from "some-other-lib"',
    ].join("\n");

    const result = fixDuplicateImportBindings(code, "app/page.tsx");

    expect(result.fixed).toBe(true);
    expect(result.removedBindings).toEqual(["cn"]);
    expect(result.code).toContain('@/lib/utils');
    expect(result.code).not.toContain("some-other-lib");
  });

  it("removes entire import line when only binding is the duplicate", () => {
    const code = [
      'import { Hash as Icon } from "lucide-react"',
      'import Icon from "@/components/icon-stub"',
    ].join("\n");

    const result = fixDuplicateImportBindings(code, "app/page.tsx");

    expect(result.fixed).toBe(true);
    const lines = result.code.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("lucide-react");
  });
});
