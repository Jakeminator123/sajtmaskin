import { describe, expect, it } from "vitest";
import { parseCodeProject } from "@/lib/gen/parser";
import { collectDuplicateImportBindingNames } from "../rules/import-binding-ast";
import {
  runDeterministicImportRepair,
  type DeterministicImportRepairDiagnostic,
  type DeterministicImportRepairResult,
} from "../deterministic-import-repair";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";

function fenceLanguage(path: string): string {
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".jsx")) return "jsx";
  return "tsx";
}

function file(path: string, content: string): string {
  return `\`\`\`${fenceLanguage(path)} file="${path}"\n${content}\n\`\`\``;
}

function project(...files: string[]): string {
  return files.join("\n\n");
}

function diag(filePath: string, message: string): DeterministicImportRepairDiagnostic {
  return { file: filePath, message };
}

function getFileContent(content: string, path: string): string {
  const found = parseCodeProject(content).files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Expected file ${path} in CodeProject fixture.`);
  return found.content;
}

function expectNoDuplicateImportBindings(content: string): void {
  for (const entry of parseCodeProject(content).files) {
    if (!/\.(tsx?|jsx?)$/.test(entry.path)) continue;
    expect(collectDuplicateImportBindingNames(entry.content, entry.path)).toEqual([]);
  }
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

type EvalCase = {
  id: string;
  title: string;
  prodEvidence: string;
  content: string;
  diagnostics: DeterministicImportRepairDiagnostic[];
  previewPolicy?: BuildSpecPreviewPolicy;
  assert: (result: DeterministicImportRepairResult) => void;
};

const CASES: EvalCase[] = [
  {
    id: "EVAL-IMPORT-001",
    title: "TS2304 missing shadcn Badge import",
    prodEvidence: "Badge: 20 träffar i 14d-fönstret.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return <Badge variant="secondary">Ny</Badge>;
}`,
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Badge'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(result.handledCodes).toContain("TS2304");
      expect(getFileContent(result.content, "app/page.tsx")).toContain(
        'import { Badge } from "@/components/ui/badge"',
      );
      expect(result.content).not.toContain('from "lucide-react"');
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-002",
    title: "TS2304 missing shadcn Button import",
    prodEvidence: "Button: 16 träffar i 14d-fönstret.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return <Button>Starta</Button>;
}`,
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Button'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(getFileContent(result.content, "app/page.tsx")).toContain(
        'import { Button } from "@/components/ui/button"',
      );
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-003",
    title: "TS2304 missing next/link default import",
    prodEvidence: "Link/next-import: 6 träffar i 14d-fönstret.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return <Link href="/kontakt">Kontakt</Link>;
}`,
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Link'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(getFileContent(result.content, "app/page.tsx")).toContain(
        'import Link from "next/link"',
      );
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-004",
    title: "TS2304 missing lucide icon import",
    prodEvidence: "Lucide-icon saknas i kända TS2304-importklassen.",
    content: file(
      "components/feature-card.tsx",
      `export function FeatureCard() {
  return <Sparkles className="h-4 w-4" />;
}`,
    ),
    diagnostics: [diag("components/feature-card.tsx", "Cannot find name 'Sparkles'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(getFileContent(result.content, "components/feature-card.tsx")).toContain(
        'import { Sparkles } from "lucide-react"',
      );
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-005",
    title: "TS2304 LucideIcon type residual plus missing lucide value icon",
    prodEvidence: "LucideIcon/lucide-symbol ingår i kända importfelfamiljen.",
    content: file(
      "components/icon-list.tsx",
      `type Feature = { icon: LucideIcon; label: string };

const features: Feature[] = [{ icon: Flame, label: "Het" }];

export function IconList() {
  return features.map(({ icon: Icon, label }) => <Icon key={label} />);
}`,
    ),
    diagnostics: [
      diag("components/icon-list.tsx", "Cannot find name 'LucideIcon'."),
      diag("components/icon-list.tsx", "Cannot find name 'Flame'."),
    ],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(getFileContent(result.content, "components/icon-list.tsx")).toContain(
        'import { Flame } from "lucide-react"',
      );
      // Stabilisering våg 1: the type-named mapping now resolves LucideIcon
      // deterministically as an `import type` (backlog LucideIcon row).
      expect(getFileContent(result.content, "components/icon-list.tsx")).toContain(
        'import type { LucideIcon } from "lucide-react"',
      );
      expect(result.handledCodes).toContain("TS2304");
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-006",
    title: "TS2304 own component named export (Reveal)",
    prodEvidence: "Reveal/egen komponent: 14 träffar i 14d-fönstret.",
    content: project(
      file(
        "app/page.tsx",
        `export default function Page() {
  return <Reveal delay={0.2}>Hej</Reveal>;
}`,
      ),
      file(
        "components/reveal.tsx",
        `"use client";

export function Reveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}`,
      ),
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Reveal'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(getFileContent(result.content, "app/page.tsx")).toContain(
        'import { Reveal } from "@/components/reveal"',
      );
      expect(result.fixes.some((fix) => fix.fixer === "own-component-import-fixer")).toBe(
        true,
      );
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-007",
    title: "TS2304 own component default export (Reveal)",
    prodEvidence: "Reveal-klassen omfattar både named och default export-varianter.",
    content: project(
      file(
        "app/page.tsx",
        `export default function Page() {
  return <Reveal>Hej</Reveal>;
}`,
      ),
      file(
        "components/reveal.tsx",
        `"use client";

export default function Reveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}`,
      ),
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Reveal'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(getFileContent(result.content, "app/page.tsx")).toContain(
        'import Reveal from "@/components/reveal"',
      );
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-008",
    title: "TS2304 unknown own component remains residual",
    prodEvidence: "Normalize ska inte skapa tysta stubs för okända egna komponenter.",
    content: project(
      file(
        "app/page.tsx",
        `export default function Page() {
  return <Reveal>Hej</Reveal>;
}`,
      ),
      file(
        "components/hero.tsx",
        `export function Hero() {
  return <div>Hero</div>;
}`,
      ),
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Reveal'.")],
    assert(result) {
      expect(result.fixed).toBe(false);
      expect(result.handledCodes).toEqual([]);
      expect(result.content).toBe(CASES.find((entry) => entry.id === "EVAL-IMPORT-008")?.content);
    },
  },
  {
    id: "EVAL-IMPORT-009",
    title: "TS2304 ambiguous own component remains residual",
    prodEvidence: "Egen komponent importeras bara vid exakt en egen kandidat.",
    content: project(
      file(
        "app/page.tsx",
        `export default function Page() {
  return <Reveal>Hej</Reveal>;
}`,
      ),
      file("components/reveal.tsx", `export function Reveal() { return <div>A</div>; }`),
      file(
        "components/effects/reveal.tsx",
        `export function Reveal() { return <div>B</div>; }`,
      ),
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Reveal'.")],
    assert(result) {
      expect(result.fixed).toBe(false);
      expect(result.content).toBe(CASES.find((entry) => entry.id === "EVAL-IMPORT-009")?.content);
    },
  },
  {
    id: "EVAL-IMPORT-010",
    title: "TS2300 smörsajt double React import consolidates to one value import",
    prodEvidence: "TS2300 fixer-skapad dubbelimport: 18 träffar i 14d-fönstret.",
    content: file(
      "components/three-canvas-shell.tsx",
      `"use client";
import React from "react";
import { useEffect, useState } from "react";
import { ReactNode, useEffect } from "react";

export function ThreeCanvasShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <React.Fragment>{ready ? children : null}</React.Fragment>;
}`,
    ),
    diagnostics: [
      diag("components/three-canvas-shell.tsx", "Duplicate identifier 'ReactNode'."),
      diag("components/three-canvas-shell.tsx", "Duplicate identifier 'useEffect'."),
    ],
    assert(result) {
      expect(result.fixed).toBe(true);
      const code = getFileContent(result.content, "components/three-canvas-shell.tsx");
      const reactImportLines = code.split("\n").filter((line) => /from "react"/.test(line));
      expect(reactImportLines).toHaveLength(1);
      expect(reactImportLines[0]).toContain("React");
      expect(reactImportLines[0]).toContain("ReactNode");
      expect(reactImportLines[0]).toContain("useEffect");
      expect(reactImportLines[0]).toContain("useState");
      expect(reactImportLines[0]).not.toMatch(/import\s+type/);
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-011",
    title: "TS2300 same-module duplicate for non-React module",
    prodEvidence: "Same-module-dubbletter ska dedupe:as även utanför React.",
    content: file(
      "components/stars.tsx",
      `import { Camera, Star } from "lucide-react";
import { Star } from "lucide-react";

export function Stars() {
  return <><Camera /><Star /></>;
}`,
    ),
    diagnostics: [diag("components/stars.tsx", "Duplicate identifier 'Star'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      const code = getFileContent(result.content, "components/stars.tsx");
      expect(occurrences(code, "Star")).toBeGreaterThanOrEqual(2);
      expect(collectDuplicateImportBindingNames(code, "components/stars.tsx")).toEqual([]);
    },
  },
  {
    id: "EVAL-IMPORT-012",
    title: "TS1361 import type used as value",
    prodEvidence: "TS1361 hanteras av deterministic-import-repair.",
    content: file(
      "components/motifs.tsx",
      `import type { PawPrint, MoonStar } from "lucide-react";

const motifs = [
  { id: "paw", icon: PawPrint },
  { id: "moon", icon: MoonStar },
];

export const motifIcons = motifs;`,
    ),
    diagnostics: [
      diag(
        "components/motifs.tsx",
        "'PawPrint' cannot be used as a value because it was imported using 'import type'.",
      ),
      diag(
        "components/motifs.tsx",
        "'MoonStar' cannot be used as a value because it was imported using 'import type'.",
      ),
    ],
    assert(result) {
      expect(result.fixed).toBe(true);
      const code = getFileContent(result.content, "components/motifs.tsx");
      expect(code).toContain('import { PawPrint, MoonStar } from "lucide-react"');
      expect(code).not.toContain("import type");
      expect(result.handledCodes).toContain("TS1361");
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-013",
    title: "TS2440 self-import conflicts with local declaration",
    prodEvidence: "TS2440 import/local declaration-konflikt är en deterministic repair-klass.",
    content: file(
      "components/ui/carousel.tsx",
      `import { Carousel } from "@/components/ui/carousel";

export function Carousel() {
  return <div />;
}`,
    ),
    diagnostics: [
      diag(
        "components/ui/carousel.tsx",
        "Import declaration conflicts with local declaration of 'Carousel'.",
      ),
    ],
    assert(result) {
      expect(result.fixed).toBe(true);
      const code = getFileContent(result.content, "components/ui/carousel.tsx");
      expect(code).not.toContain('import { Carousel } from "@/components/ui/carousel"');
      expect(code).toContain("export function Carousel");
      expect(result.handledCodes).toContain("TS2440");
    },
  },
  {
    id: "EVAL-IMPORT-014",
    title: "TS2552 did-you-mean variant records distinct code",
    prodEvidence: "TS2552 delar fixer med TS2304 men ska bokföras separat.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return <Button>Starta</Button>;
}`,
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Button'. Did you mean 'button'?")],
    assert(result) {
      expect(result.fixed).toBe(true);
      expect(result.handledCodes).toContain("TS2552");
      expect(result.handledCodes).not.toContain("TS2304");
      expect(getFileContent(result.content, "app/page.tsx")).toContain(
        'import { Button } from "@/components/ui/button"',
      );
    },
  },
  {
    id: "EVAL-IMPORT-015",
    title: "shadcn/lucide collision with children resolves to shadcn",
    prodEvidence: "Badge-kollision: children/variant pekar deterministiskt på shadcn.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return <Badge>Premium</Badge>;
}`,
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Badge'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      const code = getFileContent(result.content, "app/page.tsx");
      expect(code).toContain('import { Badge } from "@/components/ui/badge"');
      expect(code).not.toContain('from "lucide-react"');
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-016",
    title: "shadcn/lucide collision with icon-shaped usage resolves to lucide",
    prodEvidence: "Självstängande ikonusage ska inte importera shadcn-komponenten.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return <Badge className="h-4 w-4" />;
}`,
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Badge'.")],
    assert(result) {
      expect(result.fixed).toBe(true);
      const code = getFileContent(result.content, "app/page.tsx");
      expect(code).toContain('import { Badge } from "lucide-react"');
      expect(code).not.toContain("@/components/ui/badge");
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-017",
    title: "shadcn/lucide bare Calendar remains ambiguous residual",
    prodEvidence: "Propplös `<Calendar />` är avsiktligt oklart och lämnas till LLM.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return <Calendar />;
}`,
    ),
    diagnostics: [diag("app/page.tsx", "Cannot find name 'Calendar'.")],
    assert(result) {
      expect(result.fixed).toBe(false);
      expect(result.handledCodes).toEqual([]);
      expect(result.content).toBe(CASES.find((entry) => entry.id === "EVAL-IMPORT-017")?.content);
    },
  },
  {
    id: "EVAL-IMPORT-018",
    title: "mixed project fixes Badge, Link, own Reveal and TS1361 without duplicates",
    prodEvidence: "Blandfall reproducerar 3–4 fel i samma projekt.",
    content: project(
      file(
        "app/page.tsx",
        `export default function Page() {
  return (
    <main>
      <Badge variant="outline">Ny</Badge>
      <Link href="/om">Om</Link>
      <Reveal>Intro</Reveal>
    </main>
  );
}`,
      ),
      file("components/reveal.tsx", `export function Reveal() { return <section />; }`),
      file(
        "components/icon-data.tsx",
        `import type { Sparkles } from "lucide-react";

export const icons = [{ icon: Sparkles }];`,
      ),
    ),
    diagnostics: [
      diag("app/page.tsx", "Cannot find name 'Badge'."),
      diag("app/page.tsx", "Cannot find name 'Link'."),
      diag("app/page.tsx", "Cannot find name 'Reveal'."),
      diag(
        "components/icon-data.tsx",
        "'Sparkles' cannot be used as a value because it was imported using 'import type'.",
      ),
    ],
    assert(result) {
      expect(result.fixed).toBe(true);
      const page = getFileContent(result.content, "app/page.tsx");
      const iconData = getFileContent(result.content, "components/icon-data.tsx");
      expect(page).toContain('import { Badge } from "@/components/ui/badge"');
      expect(page).toContain('import Link from "next/link"');
      expect(page).toContain('import { Reveal } from "@/components/reveal"');
      expect(iconData).toContain('import { Sparkles } from "lucide-react"');
      expect(result.handledCodes).toEqual(expect.arrayContaining(["TS2304", "TS1361"]));
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-019",
    title: "mixed fixed plus unknown residual does not stub residual symbol",
    prodEvidence: "Normalize får reducera kända imports utan att gömma okända residualer.",
    content: file(
      "app/page.tsx",
      `export default function Page() {
  return (
    <main>
      <Button>Start</Button>
      <MissingWidget />
    </main>
  );
}`,
    ),
    diagnostics: [
      diag("app/page.tsx", "Cannot find name 'Button'."),
      diag("app/page.tsx", "Cannot find name 'MissingWidget'."),
    ],
    assert(result) {
      expect(result.fixed).toBe(true);
      const code = getFileContent(result.content, "app/page.tsx");
      expect(code).toContain('import { Button } from "@/components/ui/button"');
      expect(code).toContain("<MissingWidget />");
      expect(code).not.toContain("MissingWidget from");
      expect(code).not.toContain("function MissingWidget");
      expectNoDuplicateImportBindings(result.content);
    },
  },
  {
    id: "EVAL-IMPORT-020",
    title: "idempotence receipt prevents new duplicate imports on second pass",
    prodEvidence: "Dedupe-kvittot ska göra normalize-passet idempotent.",
    content: project(
      file(
        "app/page.tsx",
        `export default function Page() {
  return (
    <main>
      <Badge variant="secondary">Ny</Badge>
      <Link href="/kontakt">Kontakt</Link>
    </main>
  );
}`,
      ),
      file(
        "components/motifs.tsx",
        `import type { PawPrint } from "lucide-react";

export const motifs = [{ icon: PawPrint }];`,
      ),
    ),
    diagnostics: [
      diag("app/page.tsx", "Cannot find name 'Badge'."),
      diag("app/page.tsx", "Cannot find name 'Link'."),
      diag(
        "components/motifs.tsx",
        "'PawPrint' cannot be used as a value because it was imported using 'import type'.",
      ),
    ],
    assert(result) {
      expect(result.fixed).toBe(true);
      expectNoDuplicateImportBindings(result.content);
      const second = runDeterministicImportRepair(result.content, [
        diag("app/page.tsx", "Cannot find name 'Badge'."),
        diag("app/page.tsx", "Cannot find name 'Link'."),
        diag(
          "components/motifs.tsx",
          "'PawPrint' cannot be used as a value because it was imported using 'import type'.",
        ),
      ]);
      expect(second.fixed).toBe(false);
      expect(second.content).toBe(result.content);
      expectNoDuplicateImportBindings(second.content);
    },
  },
];

describe("control-flow phase 6 deterministic import-repair eval suite", () => {
  it("keeps the fixture matrix at the requested size", () => {
    expect(CASES).toHaveLength(20);
  });

  for (const testCase of CASES) {
    it(`${testCase.id}: ${testCase.title}`, () => {
      // Prod evidence: ${testCase.prodEvidence}
      const result = runDeterministicImportRepair(
        testCase.content,
        testCase.diagnostics,
        testCase.previewPolicy ? { previewPolicy: testCase.previewPolicy } : {},
      );
      testCase.assert(result);
    });
  }
});
