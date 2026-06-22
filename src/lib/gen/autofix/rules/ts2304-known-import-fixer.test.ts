import { describe, expect, it } from "vitest";
import { fixKnownTs2304Imports } from "./ts2304-known-import-fixer";

function project(filePath: string, content: string): string {
  return `\`\`\`tsx file="${filePath}"\n${content}\n\`\`\``;
}

const FILE = "app/page.tsx";

describe("ts2304-known-import-fixer", () => {
  it("adds a lucide import for a JSX usage flagged by TS2304", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <Clapperboard className="h-6 w-6" />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Clapperboard'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Clapperboard", module: "lucide-react" },
    ]);
    expect(result.code).toContain('import { Clapperboard } from "lucide-react"');
    expect(result.fixes[0]?.fixer).toBe("ts2304-known-import-fixer");
  });

  it("adds a lucide import for a NON-JSX usage flagged by TS2304", () => {
    // This is the gap the JSX-scan fixers miss: the icon is used as a value,
    // never as `<Clapperboard/>`, so only a diagnostic-driven fixer catches it.
    const content = project(
      FILE,
      `import type { LucideIcon } from "lucide-react";

const ActiveIcon: LucideIcon = Clapperboard;

export default function Page() {
  const Icon = ActiveIcon;
  return <Icon />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Clapperboard'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Clapperboard", module: "lucide-react" },
    ]);
    // Must add a VALUE import, not merge into the type-only line.
    expect(result.code).toContain('import { Clapperboard } from "lucide-react"');
    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
  });

  it("leaves an unknown / non-lucide name untouched for the LLM", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <TotallyMadeUpWidget />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'TotallyMadeUpWidget'." },
    ]);

    expect(result.addedImports).toEqual([]);
    expect(result.fixes).toEqual([]);
    expect(result.code).toBe(content);
  });

  it("merges into an existing lucide-react value import line", () => {
    const content = project(
      FILE,
      `import { Camera } from "lucide-react";

export default function Page() {
  return (
    <div>
      <Camera />
      <Clapperboard />
    </div>
  );
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Clapperboard'." },
    ]);

    expect(result.code).toContain(
      'import { Camera, Clapperboard } from "lucide-react"',
    );
    // No duplicate second lucide import line.
    expect(result.code.match(/from "lucide-react"/g)).toHaveLength(1);
  });

  it("resolves a known module specifier (react hook) flagged by TS2304", () => {
    const content = project(
      FILE,
      `"use client";

export default function Page() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'useState'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "useState", module: "react" },
    ]);
    expect(result.code).toContain('import { useState } from "react"');
  });

  it("prefers next/image default import over the lucide Image icon (non-JSX)", () => {
    // `Image` exists in BOTH LUCIDE_ICONS and KNOWN_MODULE_SPECIFIERS. The Next
    // component (default import) must win, otherwise we promote the wrong
    // component and keep failing on Next-specific props.
    const content = project(
      FILE,
      `export default function Page() {
  const HeroImage = Image;
  return <HeroImage src="/hero.png" alt="" width={1200} height={600} />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Image'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Image", module: "next/image" },
    ]);
    expect(result.code).toContain('import Image from "next/image"');
    expect(result.code).not.toContain('from "lucide-react"');
  });

  it("prefers next/link default import over the lucide Link icon (non-JSX)", () => {
    const content = project(
      FILE,
      `export default function Page() {
  const Anchor = Link;
  return <Anchor href="/">home</Anchor>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Link'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Link", module: "next/link" },
    ]);
    expect(result.code).toContain('import Link from "next/link"');
    expect(result.code).not.toContain('from "lucide-react"');
  });

  it("does nothing when there are no Cannot-find-name diagnostics", () => {
    const content = project(FILE, `export default function Page() { return null; }`);

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Type 'string' is not assignable to type 'number'." },
    ]);

    expect(result.code).toBe(content);
    expect(result.addedImports).toEqual([]);
  });
});
