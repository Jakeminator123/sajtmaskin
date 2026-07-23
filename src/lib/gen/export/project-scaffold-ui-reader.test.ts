import { describe, expect, it } from "vitest";
import { ensureClientDirectiveForVendoredUi } from "./project-scaffold-ui-reader";

describe("ensureClientDirectiveForVendoredUi", () => {
  it("prepends 'use client' to a Slot-using primitive that lacks it (button/badge repro)", () => {
    const button = [
      'import * as React from "react"',
      'import { Slot } from "radix-ui"',
      'import { cn } from "@/lib/utils"',
      "",
      "function Button({ asChild = false, ...props }) {",
      '  const Comp = asChild ? Slot.Root : "button"',
      "  return <Comp {...props} />",
      "}",
      "export { Button }",
    ].join("\n");

    const out = ensureClientDirectiveForVendoredUi(button);

    expect(out.startsWith('"use client";\n\n')).toBe(true);
    // Original source is preserved verbatim after the directive.
    expect(out.slice('"use client";\n\n'.length)).toBe(button);
  });

  it("prepends the directive for legacy individual @radix-ui/* imports too", () => {
    const src = 'import * as SlotPrimitive from "@radix-ui/react-slot"\nexport const X = SlotPrimitive.Slot';
    expect(ensureClientDirectiveForVendoredUi(src).startsWith('"use client";')).toBe(true);
  });

  it("prepends the directive when a file calls createContext directly", () => {
    const src = 'import { createContext } from "react"\nexport const Ctx = createContext(null)';
    expect(ensureClientDirectiveForVendoredUi(src).startsWith('"use client";')).toBe(true);
  });

  it("is a no-op when the directive is already present (double-quoted)", () => {
    const src = '"use client";\nimport { Slot } from "radix-ui"\nexport const X = Slot.Root';
    expect(ensureClientDirectiveForVendoredUi(src)).toBe(src);
  });

  it("is a no-op when the directive is already present (single-quoted, with blank lines)", () => {
    const src = "\n'use client'\nimport { Slot } from \"radix-ui\"\n";
    expect(ensureClientDirectiveForVendoredUi(src)).toBe(src);
  });

  it("does not touch a server-safe primitive with no radix/createContext usage", () => {
    const src = 'import { cn } from "@/lib/utils"\nexport function Separator(props) { return <hr {...props} /> }';
    expect(ensureClientDirectiveForVendoredUi(src)).toBe(src);
  });
});
