import { describe, it, expect } from "vitest";
import { runImportValidator } from "./import-validator";

describe("fixNestedImportBlocks", () => {
  it("closes orphaned import block when specifiers match a known module", () => {
    const broken = [
      'import {',
      '  useState,',
      '  useEffect,',
      'import { Button } from "@/components/ui/button"',
      '',
      'export default function Page() { return null; }',
    ].join("\n");

    const { code, fixes } = runImportValidator(broken);
    expect(code).toContain('import { useState, useEffect } from "react"');
    expect(code).toContain('import { Button } from "@/components/ui/button"');
    expect(fixes.some((f) => f.description.includes("orphaned import block"))).toBe(true);
  });

  it("removes empty orphaned import block opener", () => {
    const broken = [
      'import {',
      'import { motion } from "framer-motion"',
      '',
      'export default function Page() { return null; }',
    ].join("\n");

    const { code } = runImportValidator(broken);
    expect(code).not.toMatch(/^import \{$/m);
    expect(code).toContain('import { motion } from "framer-motion"');
  });

  it("does not touch valid multi-line imports", () => {
    const valid = [
      'import {',
      '  useState,',
      '  useEffect,',
      '} from "react"',
      '',
      'export default function Page() { return null; }',
    ].join("\n");

    const { code, fixes } = runImportValidator(valid);
    expect(code).toContain('} from "react"');
    expect(fixes.filter((f) => f.description.includes("orphaned"))).toHaveLength(0);
  });

  it("handles lucide-react specifiers in orphaned block", () => {
    const broken = [
      'import {',
      '  ChevronRight,',
      '  Star,',
      'import { cn } from "@/lib/utils"',
      '',
      'export default function Page() { return null; }',
    ].join("\n");

    const { code } = runImportValidator(broken);
    expect(code).toContain('import { ChevronRight, Star } from "lucide-react"');
    expect(code).toContain('import { cn } from "@/lib/utils"');
  });
});
