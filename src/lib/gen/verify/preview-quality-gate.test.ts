import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { resetServerEnvCacheForTests } from "@/lib/env";
import {
  describeQualityGateVerification,
  firstGateOutputLine,
  maybeAnalyzeVisualQAForPassedExportable,
  qualityGateAllPassed,
  resolveRepairQualityGateChecks,
} from "./preview-quality-gate";

const sampleExportable: CodeFile[] = [
  {
    path: "app/page.tsx",
    language: "tsx",
    content: `
export default function Page() {
  return (
    <main>
      <section>
        <h1>Acme Studio</h1>
        <p>Modern sites for local businesses.</p>
        <img src="/hero.jpg" alt="Acme Studio showroom" />
      </section>
      <section>
        <h2>Tjanster</h2>
        <p>Webb, SEO och uppfoljning.</p>
      </section>
    </main>
  );
}
`.trim(),
  },
  {
    path: "app/layout.tsx",
    language: "tsx",
    content: `
export const metadata = {
  title: "Acme Studio",
  description: "Modern sites for local businesses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
`.trim(),
  },
  {
    path: "app/globals.css",
    language: "css",
    content: `
:root {
  color-scheme: light;
}

body {
  margin: 0;
  font-family: sans-serif;
  background: #ffffff;
  color: #111111;
}
`.trim(),
  },
];

describe("maybeAnalyzeVisualQAForPassedExportable", () => {
  beforeEach(() => {
    resetServerEnvCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvCacheForTests();
  });

  it("returns undefined when visual QA is disabled", () => {
    vi.stubEnv("SAJTMASKIN_VISUAL_QA", "0");

    expect(
      maybeAnalyzeVisualQAForPassedExportable({
        exportable: sampleExportable,
        results: [{ check: "build", passed: true, exitCode: 0, output: "" }],
      }),
    ).toBeUndefined();
  });

  it("returns undefined when quality gate did not pass", () => {
    vi.stubEnv("SAJTMASKIN_VISUAL_QA", "1");

    expect(
      maybeAnalyzeVisualQAForPassedExportable({
        exportable: sampleExportable,
        results: [{ check: "build", passed: false, exitCode: 1, output: "Build failed" }],
      }),
    ).toBeUndefined();
  });

  it("returns visual QA when enabled and all checks passed", () => {
    vi.stubEnv("SAJTMASKIN_VISUAL_QA", "1");

    const result = maybeAnalyzeVisualQAForPassedExportable({
      exportable: sampleExportable,
      results: [
        { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 200 },
        { check: "build", passed: true, exitCode: 0, output: "", durationMs: 400 },
      ],
    });

    expect(result).toBeDefined();
    expect(result?.checks.length).toBeGreaterThan(0);
    expect(typeof result?.overallScore).toBe("number");
  });

  it("adds a WebGL readiness check for React Three Fiber client boundaries", () => {
    vi.stubEnv("SAJTMASKIN_VISUAL_QA", "1");

    const result = maybeAnalyzeVisualQAForPassedExportable({
      exportable: [
        ...sampleExportable,
        {
          path: "components/scene.tsx",
          language: "tsx",
          content: [
            'import { Canvas } from "@react-three/fiber";',
            "export function Scene() {",
            "  return <Canvas><mesh /></Canvas>;",
            "}",
          ].join("\n"),
        },
      ],
      results: [{ check: "typecheck", passed: true, exitCode: 0, output: "" }],
    });

    expect(result?.checks.find((check) => check.check === "webgl-readiness")).toMatchObject({
      passed: false,
      score: 0,
    });
  });
});

describe("qualityGateAllPassed", () => {
  it("returns false for empty result sets", () => {
    expect(qualityGateAllPassed([])).toBe(false);
  });
});

describe("describeQualityGateVerification", () => {
  it("describes empty result sets as a failed verification run", () => {
    expect(describeQualityGateVerification([])).toBe(
      "Automatic verification could not run because no checks executed.",
    );
  });

  it("appends the first error line from the failed typecheck", () => {
    const message = describeQualityGateVerification([
      {
        check: "typecheck",
        passed: false,
        exitCode: 1,
        output:
          "app/page.tsx(11,14): error TS2304: Cannot find name 'Clapperboard'.\nFound 1 error.",
      },
    ]);

    expect(message).toContain("Automatic verification failed: typecheck.");
    expect(message).toContain(
      "app/page.tsx(11,14): error TS2304: Cannot find name 'Clapperboard'.",
    );
  });

  it("skips blank leading lines and uses the first meaningful output line", () => {
    const message = describeQualityGateVerification([
      { check: "typecheck", passed: true, exitCode: 0, output: "" },
      {
        check: "build",
        passed: false,
        exitCode: 1,
        output: "\n\n   \nError: Module not found: foo",
      },
    ]);

    expect(message).toBe(
      "Automatic verification failed: build. Error: Module not found: foo",
    );
  });

  it("falls back to the check name when the failed check has no usable output", () => {
    expect(
      describeQualityGateVerification([
        { check: "lint", passed: false, exitCode: 1, output: "   \n  " },
      ]),
    ).toBe("Automatic verification failed: lint.");
  });
});

describe("firstGateOutputLine", () => {
  it("returns null for empty or whitespace-only output", () => {
    expect(firstGateOutputLine("")).toBeNull();
    expect(firstGateOutputLine(null)).toBeNull();
    expect(firstGateOutputLine("\n   \n\t")).toBeNull();
  });

  it("returns the first non-empty trimmed line", () => {
    expect(firstGateOutputLine("\n  first useful line  \nsecond")).toBe(
      "first useful line",
    );
  });

  it("truncates long lines to the cap with a trailing ellipsis", () => {
    const line = firstGateOutputLine(`error: ${"x".repeat(500)}`, 50);

    expect(line).not.toBeNull();
    expect(line?.endsWith("...")).toBe(true);
    expect((line ?? "").length).toBeLessThanOrEqual(53);
  });
});

describe("resolveRepairQualityGateChecks", () => {
  it("keeps explicit repair checks when provided", () => {
    expect(resolveRepairQualityGateChecks(["typecheck", "lint"])).toEqual([
      "typecheck",
      "lint",
    ]);
  });

  it("falls back to F2 design-preview defaults when no explicit checks are provided", () => {
    // F2 default slimmed to `typecheck` only on 2026-04-23 since warm-tsc
    // + warm-eslint now run pre-VM in the Sajtmaskin backend. See
    // `quality-gate-checks.ts` for the full rationale.
    expect(resolveRepairQualityGateChecks()).toEqual(["typecheck"]);
  });
});
