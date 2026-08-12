import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get() { return vi.fn(); } }),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  // schema.ts evaluates `sql`md5(files_json)`` at import time for
  // generatedAlwaysAs — keep a stub so the mock does not break module load.
  sql: (strings: TemplateStringsArray) => ({
    op: "sql",
    text: strings?.join?.("") ?? "",
  }),
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

  it("treats auth-pages as an app scaffold (no bogus app-shell-mismatch pivot)", async () => {
    // `APP_SCAFFOLD_IDS` used to be a hand-maintained set of ids that omitted
    // auth-pages even though its manifest declares `siteKind: "app"`. An `app`
    // build that legitimately matched auth-pages was therefore classified as
    // app-shell-mismatch with confidence "high" and pushed away from the right
    // scaffold on the first blocking preflight.
    const authPages = getScaffoldById("auth-pages");
    expect(authPages?.siteKind).toBe("app");

    const suggestion = await inferScaffoldRetrySuggestion({
      prompt: "Bygg inloggning, registrering och glömt lösenord för vår app.",
      buildIntent: "app",
      resolvedScaffold: authPages!,
      preflightIssues: [
        {
          file: "app/login/page.tsx",
          severity: "error",
          message: "Duplicate route file app/login/page.tsx",
          category: "code_structure_failure",
        },
      ],
      previewBlockingReason: null,
      finalizedFilesForPreview: [
        {
          path: "app/login/page.tsx",
          language: "tsx",
          content: "export default function Page() { return <main />; }",
        },
      ],
    });

    expect(suggestion?.failureType).not.toBe("app-shell-mismatch");
  });

  it("still flags a marketing scaffold as app-shell-mismatch on an app build", async () => {
    const landing = getScaffoldById("landing-page");
    expect(landing?.siteKind).not.toBe("app");

    const suggestion = await inferScaffoldRetrySuggestion({
      prompt: "Bygg ett internt verktyg med tabeller och inställningar.",
      buildIntent: "app",
      resolvedScaffold: landing!,
      preflightIssues: [
        {
          file: "app/page.tsx",
          severity: "error",
          message: "Duplicate route file app/page.tsx",
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

    expect(suggestion?.failureType).toBe("app-shell-mismatch");
    expect(suggestion?.suggestedScaffoldId).toBe("app-shell");
  });

  it("website-intent build on auth-pages must not be classified site-shell-mismatch", async () => {
    // `auth-pages` has siteKind "app" but declares website in
    // allowedBuildIntents. site-shell-mismatch must consult that field so a
    // website build correctly resolved to auth-pages is not pivoted away.
    const authPages = getScaffoldById("auth-pages");
    expect(authPages?.siteKind).toBe("app");
    expect(authPages?.allowedBuildIntents).toContain("website");

    const suggestion = await inferScaffoldRetrySuggestion({
      prompt: "Bygg login- och registreringssidor till vår hemsida.",
      buildIntent: "website",
      resolvedScaffold: authPages!,
      preflightIssues: [
        {
          file: "app/login/page.tsx",
          severity: "error",
          message: "Duplicate route file app/login/page.tsx",
          category: "code_structure_failure",
        },
      ],
      previewBlockingReason:
        "Automatic preflight blocked preview: app/login/page.tsx: Duplicate route file.",
      finalizedFilesForPreview: [
        {
          path: "app/login/page.tsx",
          language: "tsx",
          content: "export default function Page() { return <main />; }",
        },
      ],
    });

    expect(suggestion?.failureType).not.toBe("site-shell-mismatch");
  });

  it("dashboard on a website build must STILL be site-shell-mismatch", async () => {
    // Counter-test: dashboard is also siteKind "app", but unlike auth-pages
    // its allowedBuildIntents is ["app"] only. Removing the entire
    // site-shell-mismatch branch would make the red test pass for the wrong
    // reason — this case must keep classifying as site-shell-mismatch.
    const dashboard = getScaffoldById("dashboard");
    expect(dashboard?.siteKind).toBe("app");
    expect(dashboard?.allowedBuildIntents).not.toContain("website");

    const suggestion = await inferScaffoldRetrySuggestion({
      prompt: "Bygg en hemsida för vår konsultfirma.",
      buildIntent: "website",
      resolvedScaffold: dashboard!,
      preflightIssues: [
        {
          file: "app/page.tsx",
          severity: "error",
          message: "Duplicate route file app/page.tsx",
          category: "code_structure_failure",
        },
      ],
      previewBlockingReason:
        "Automatic preflight blocked preview: app/page.tsx: Duplicate route file.",
      finalizedFilesForPreview: [
        {
          path: "app/page.tsx",
          language: "tsx",
          content: "export default function Page() { return <main />; }",
        },
      ],
    });

    expect(suggestion?.failureType).toBe("site-shell-mismatch");
  });
});
