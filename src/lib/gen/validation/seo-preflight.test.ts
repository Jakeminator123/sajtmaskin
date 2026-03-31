import { describe, expect, it } from "vitest";
import { runSeoPreflightChecks } from "./seo-preflight";
import type { CodeFile } from "@/lib/gen/parser";

function file(path: string, content: string): CodeFile {
  return { path, content, language: "tsx" };
}

describe("runSeoPreflightChecks", () => {
  it("passes with no errors when metadata, title, description, robots, sitemap, H1 and openGraph are present", () => {
    const files: CodeFile[] = [
      file("src/app/layout.tsx", `
export const metadata = {
  title: "My Site",
  description: "A great site",
  openGraph: { title: "My Site" },
};
export default function Layout({ children }) { return children; }
      `),
      file("src/app/page.tsx", "export default function Page() { return <h1>Welcome</h1>; }"),
      file("src/app/robots.ts", "export default function robots() { return {}; }"),
      file("src/app/sitemap.ts", "export default function sitemap() { return []; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("generates error when layout has no metadata export", () => {
    const files: CodeFile[] = [
      file("src/app/layout.tsx", "export default function Layout({ children }) { return children; }"),
      file("src/app/page.tsx", "export default function Page() { return <h1>Hello</h1>; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    const missingMetadata = issues.find((i) => i.code === "missing-metadata");
    expect(missingMetadata).toBeDefined();
    expect(missingMetadata!.severity).toBe("error");
    expect(missingMetadata!.category).toBe("non_blocking_quality_warning");
  });

  it("generates error when metadata exists but title is missing", () => {
    const files: CodeFile[] = [
      file("src/app/layout.tsx", `
export const metadata = {
  description: "A site",
};
export default function Layout({ children }) { return children; }
      `),
      file("src/app/page.tsx", "export default function Page() { return <h1>Hi</h1>; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    const missingTitle = issues.find((i) => i.code === "missing-title");
    expect(missingTitle).toBeDefined();
    expect(missingTitle!.severity).toBe("error");
    expect(missingTitle!.category).toBe("non_blocking_quality_warning");
  });

  it("generates warning when robots.ts is missing", () => {
    const files: CodeFile[] = [
      file("src/app/layout.tsx", `
export const metadata = { title: "Site", description: "Desc" };
export default function Layout({ children }) { return children; }
      `),
      file("src/app/page.tsx", "export default function Page() { return <h1>Home</h1>; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    const missingRobots = issues.find((i) => i.code === "missing-robots");
    expect(missingRobots).toBeDefined();
    expect(missingRobots!.severity).toBe("warning");
  });

  it("generates warning when sitemap.ts is missing", () => {
    const files: CodeFile[] = [
      file("src/app/layout.tsx", `
export const metadata = { title: "Site", description: "Desc" };
export default function Layout({ children }) { return children; }
      `),
      file("src/app/page.tsx", "export default function Page() { return <h1>Home</h1>; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    const missingSitemap = issues.find((i) => i.code === "missing-sitemap");
    expect(missingSitemap).toBeDefined();
    expect(missingSitemap!.severity).toBe("warning");
  });

  it("generates warning when home page has no H1", () => {
    const files: CodeFile[] = [
      file("src/app/layout.tsx", `
export const metadata = { title: "Site", description: "Desc" };
export default function Layout({ children }) { return children; }
      `),
      file("src/app/page.tsx", "export default function Page() { return <div>No H1</div>; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    const missingH1 = issues.find((i) => i.code === "missing-h1");
    expect(missingH1).toBeDefined();
    expect(missingH1!.severity).toBe("warning");
  });

  it("recognizes generateMetadata as metadata export", () => {
    const files: CodeFile[] = [
      file("src/app/layout.tsx", `
export async function generateMetadata() {
  return { title: "Site", description: "Desc" };
}
export default function Layout({ children }) { return children; }
      `),
      file("src/app/page.tsx", "export default function Page() { return <h1>Hi</h1>; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    expect(issues.filter((i) => i.code === "missing-metadata" || i.code === "missing-title")).toHaveLength(
      0,
    );
  });

  it("finds app/layout.tsx when using root app dir", () => {
    const files: CodeFile[] = [
      file("app/layout.tsx", `
export const metadata = { title: "Site", description: "Desc" };
export default function Layout({ children }) { return children; }
      `),
      file("app/page.tsx", "export default function Page() { return <h1>Hi</h1>; }"),
    ];
    const issues = runSeoPreflightChecks(files);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });
});
