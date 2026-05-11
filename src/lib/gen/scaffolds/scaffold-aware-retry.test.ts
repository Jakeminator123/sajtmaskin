import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get() { return vi.fn(); } }),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
}));

vi.mock("./scaffold-search", () => ({
  searchScaffolds: vi.fn(async () => []),
}));

import { inferScaffoldRetrySuggestion } from "./scaffold-aware-retry";
import { getScaffoldById } from "./registry";

describe("inferScaffoldRetrySuggestion", () => {
  it("does not classify pure merged syntax errors as scaffold import drift", async () => {
    const landing = getScaffoldById("landing-page");
    expect(landing).toBeTruthy();

    const suggestion = await inferScaffoldRetrySuggestion({
      prompt: "Bygg en filmisk hemsida för en sci-fi-komedi.",
      buildIntent: "website",
      resolvedScaffold: landing!,
      preflightIssues: [
        {
          file: "app/page.tsx",
          severity: "error",
          message: 'Merged syntax error line 5:15 — Expected "as" but found ","',
          category: "code_structure_failure",
        },
      ],
      previewBlockingReason: null,
      finalizedFilesForPreview: [
        {
          path: "app/page.tsx",
          language: "tsx",
          content: "export default function Page() { return <main />; }",
        },
      ],
    });

    expect(suggestion).toBeNull();
  });

  it("does not suggest scaffold pivots for home-route code structure failures", async () => {
    const saas = getScaffoldById("saas-landing");
    expect(saas).toBeTruthy();

    const suggestion = await inferScaffoldRetrySuggestion({
      prompt: "Skapa en modern hantverkarsajt för Nordtak AB.",
      buildIntent: "website",
      resolvedScaffold: saas!,
      preflightIssues: [
        {
          file: "app/page.tsx",
          severity: "error",
          message:
            "Home route renders trivial content (≈199 chars after stripping imports/JSX braces; threshold 200).",
          category: "code_structure_failure",
        },
      ],
      previewBlockingReason:
        "Automatic preflight blocked preview: app/page.tsx: Home route renders trivial content.",
      finalizedFilesForPreview: [
        {
          path: "app/page.tsx",
          language: "tsx",
          content: "export default function Page() { return <main />; }",
        },
      ],
    });

    expect(suggestion).toBeNull();
  });
});
