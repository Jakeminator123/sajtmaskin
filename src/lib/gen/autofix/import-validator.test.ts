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

  it("regression: still adds LucideIcon when an existing lucide-react type import is multiline / unparseable", () => {
    // Multiline `import type { ... }` would not match the merge regex
    // (which only grabs single-line patterns). Previously the unparseable
    // line caused `importedNames.add("LucideIcon")` to fire WITHOUT any
    // import being added — the second-chance "fresh import" branch then
    // never ran and the file shipped without LucideIcon. Now the code
    // falls through to a fresh `import type` line.
    const code = [
      "import type {",
      "  LucideProps,",
      '} from "lucide-react";',
      "",
      "type Feature = { icon: LucideIcon; props: LucideProps };",
    ].join("\n");

    const result = runImportValidator(code);
    expect(result.code).toContain("LucideIcon");
    expect(
      result.fixes.some((f) =>
        f.description.includes("type import for LucideIcon"),
      ),
    ).toBe(true);
  });

  it("regression: does not rewrite LucideIcon to a fallback runtime icon alias", () => {
    const code = [
      '"use client";',
      'import { LucideIcon, Flame } from "lucide-react";',
      "",
      "type FeatureCard = {",
      "  icon: LucideIcon;",
      "  title: string;",
      "};",
      "",
      'const cards: FeatureCard[] = [{ icon: Flame, title: "Grill" }];',
      "",
      "export default function HomePage() {",
      "  return <Flame aria-hidden />;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);

    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
    expect(result.code).toContain('import { Flame } from "lucide-react"');
    expect(result.code).not.toContain("Circle as LucideIcon");
    expect(result.code).not.toContain('import { LucideIcon, Flame } from "lucide-react"');
  });

  it("regression: removes existing Circle as LucideIcon aliases before adding the type import", () => {
    const code = [
      '"use client";',
      'import { Circle as LucideIcon, Flame } from "lucide-react";',
      "",
      "type FeatureCard = {",
      "  icon: LucideIcon;",
      "  title: string;",
      "};",
      "",
      'const cards: FeatureCard[] = [{ icon: Flame, title: "Grill" }];',
      "",
      "export default function HomePage() {",
      "  return <Flame aria-hidden />;",
      "}",
    ].join("\n");

    const result = runImportValidator(code);

    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
    expect(result.code).toContain('import { Flame } from "lucide-react"');
    expect(result.code).not.toContain("Circle as LucideIcon");
  });
});
