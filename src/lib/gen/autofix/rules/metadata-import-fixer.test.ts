import { describe, expect, it } from "vitest";
import { fixCnImportConflict, fixMissingCnImport } from "./metadata-import-fixer";

describe("metadata-import-fixer cn rules", () => {
  it("adds missing cn import when a component uses cn", () => {
    const code = `export function Card() {
  return <div className={cn("rounded-xl", "shadow-sm")} />;
}
`;

    const result = fixMissingCnImport(code, "components/card.tsx");

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { cn } from "@/lib/utils";');
  });

  it("does not add cn import when the file already defines cn locally", () => {
    const code = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

    const result = fixMissingCnImport(code, "lib/utils.ts");

    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("removes a conflicting cn self-import while keeping sibling imports", () => {
    const code = `import { cn, formatPrice } from "@/lib/utils";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

    const result = fixCnImportConflict(code, "lib/utils.ts");

    expect(result.fixed).toBe(true);
    expect(result.code).not.toContain('import { cn,');
    expect(result.code).toContain('import { formatPrice } from "@/lib/utils";');
    expect(result.code).toContain("export function cn(...inputs: ClassValue[])");
  });
});
