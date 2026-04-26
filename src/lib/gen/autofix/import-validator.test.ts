import { describe, expect, it } from "vitest";
import { runImportValidator } from "./import-validator";

describe("import-validator (SAJ-61 namespace + LucideIcon)", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // JSX namespace detection: <motion.X> implies `import { motion } from "framer-motion"`
  // ─────────────────────────────────────────────────────────────────────────

  it("adds missing `import { motion } from \"framer-motion\"` when <motion.div> is used", () => {
    const code = [
      '"use client";',
      "",
      "export default function Hero() {",
      "  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);

    expect(result.code).toContain('import { motion } from "framer-motion"');
    expect(
      result.fixes.some((f) =>
        f.description.includes("namespace import for <motion.*>"),
      ),
    ).toBe(true);
  });

  it("adds the namespace import when <motion.aside> is used", () => {
    const code = [
      '"use client";',
      "",
      "export function FloatingCta() {",
      "  return <motion.aside aria-label=\"cta\">x</motion.aside>;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);
    expect(result.code).toContain('import { motion } from "framer-motion"');
  });

  it("does not add motion when it is already imported", () => {
    const code = [
      '"use client";',
      'import { motion } from "framer-motion";',
      "",
      "export default function Hero() {",
      "  return <motion.div />;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);
    const motionImports = result.code.match(/import\s+\{\s*motion\s*\}\s+from\s+"framer-motion"/g);
    expect(motionImports?.length ?? 0).toBe(1);
  });

  it("does not add motion when it is namespace-imported as motion", () => {
    const code = [
      '"use client";',
      'import * as motion from "framer-motion";',
      "",
      "export default function Hero() {",
      "  return <motion.div />;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);
    const motionNamedImports = result.code.match(/import\s+\{[^}]*motion[^}]*\}\s+from\s+"framer-motion"/g);
    expect(motionNamedImports?.length ?? 0).toBe(0);
  });

  it("does not add a namespace import for unknown lowercase tags", () => {
    const code = [
      "export default function Foo() {",
      "  return <unknown.thing />;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);
    expect(result.code).not.toContain('from "framer-motion"');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LucideIcon type import
  // ─────────────────────────────────────────────────────────────────────────

  it("adds `import type { LucideIcon } from \"lucide-react\"` when LucideIcon is used as a type", () => {
    const code = [
      "type Feature = {",
      "  icon: LucideIcon;",
      "  title: string;",
      "};",
      "",
      "export const features: Feature[] = [];",
    ].join("\n");

    const result = runImportValidator(code);

    expect(result.code).toContain(
      'import type { LucideIcon } from "lucide-react"',
    );
    expect(
      result.fixes.some((f) =>
        f.description.includes("type import for LucideIcon"),
      ),
    ).toBe(true);
  });

  it("does not add LucideIcon type import when already type-imported", () => {
    const code = [
      'import type { LucideIcon } from "lucide-react";',
      "",
      "type Feature = { icon: LucideIcon };",
    ].join("\n");

    const result = runImportValidator(code);
    const matches = result.code.match(/import\s+type\s+\{[^}]*LucideIcon[^}]*\}\s+from\s+"lucide-react"/g);
    expect(matches?.length ?? 0).toBe(1);
  });

  it("merges LucideIcon into an existing lucide-react type import", () => {
    const code = [
      'import type { LucideProps } from "lucide-react";',
      "",
      "type Feature = { icon: LucideIcon; props: LucideProps };",
    ].join("\n");

    const result = runImportValidator(code);
    expect(result.code).toContain(
      'import type { LucideProps, LucideIcon } from "lucide-react"',
    );
    // Should not duplicate the import as a separate line
    const lineCount = (result.code.match(/from\s+"lucide-react"/g) ?? []).length;
    expect(lineCount).toBe(1);
  });

  it("does not import LucideIcon when the symbol is not used", () => {
    const code = [
      "export default function Foo() {",
      "  return <div>no lucide icon here</div>;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);
    expect(result.code).not.toContain("LucideIcon");
  });
});
