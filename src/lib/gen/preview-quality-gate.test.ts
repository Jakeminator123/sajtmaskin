import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  describeQualityGateVerification,
  maybeAnalyzeVisualQAForPassedExportable,
  qualityGateAllPassed,
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
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
