import { afterEach, describe, expect, it } from "vitest";
import { runProjectSanityChecks } from "./project-sanity";
import type { CodeFile } from "@/lib/gen/parser";

describe("runProjectSanityChecks", () => {
  afterEach(() => {
    delete process.env.SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS;
  });

  it("treats runtime-provided imports as resolved", () => {
    const files: CodeFile[] = [
      {
        path: "components/ui/sidebar.tsx",
        language: "tsx",
        content: [
          '"use client";',
          'import { useIsMobile } from "@/lib/hooks/use-mobile";',
          "export function Sidebar() {",
          "  const mobile = useIsMobile();",
          "  return <aside data-mobile={mobile} />;",
          "}",
        ].join("\n"),
      },
      { path: "package.json", language: "json", content: '{"dependencies":{}}' },
    ];
    const result = runProjectSanityChecks(files);
    expect(result.issues.filter((issue) => issue.message.includes("use-mobile"))).toEqual([]);
  });

  it("flags files that look like partial repair snippets", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: {
            next: "16.2.3",
            react: "19.2.4",
            "react-dom": "19.2.4",
          },
          devDependencies: {
            typescript: "5.8.3",
          },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
      {
        path: "components/trailer-dialog.tsx",
        language: "tsx",
        content: `import {
import { Button } from "@/components/ui/button"
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";`,
      },
    ]);

    expect(result.valid).toBe(false);
    const issue = result.issues.find((entry) => entry.file === "components/trailer-dialog.tsx");
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/partial repair snippet|overlapping import statements|nested import/i);
  });

  it("treats unresolved local imports as errors by default", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          'import Missing from "@/components/missing";\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);
    const issue = result.issues.find((entry) => entry.message.includes("Unresolved local import"));
    expect(issue?.severity).toBe("error");
    expect(result.valid).toBe(false);
  });

  it("flags generated DialogContent without DialogTitle", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/page.tsx",
        language: "tsx",
        content: [
          'import { Dialog, DialogContent } from "@/components/ui/dialog";',
          "export default function Page() {",
          "  return <Dialog><DialogContent>Body only</DialogContent></Dialog>;",
          "}",
        ].join("\n"),
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("missing DialogTitle"))).toBe(true);
  });

  it("flags root-relative image paths that no file in the project serves", () => {
    const result = runProjectSanityChecks([
      { path: "package.json", language: "json", content: '{"dependencies":{}}' },
      {
        path: "components/hero-section.tsx",
        language: "tsx",
        content: [
          'import Image from "next/image";',
          "export function HeroSection() {",
          '  return <Image src="/images/hero-sky.jpg" alt="Sky" width={1200} height={600} priority />;',
          "}",
        ].join("\n"),
      },
    ]);

    const issue = result.issues.find((entry) => entry.subject?.includes("/images/hero-sky.jpg"));
    expect(issue?.severity).toBe("warning");
    expect(issue?.file).toBe("components/hero-section.tsx");
    expect(result.valid).toBe(true);
  });

  it("accepts local images that the project actually ships, the placeholder route and remote hosts", () => {
    const result = runProjectSanityChecks([
      { path: "package.json", language: "json", content: '{"dependencies":{}}' },
      { path: "public/logo.svg", language: "svg", content: "<svg />" },
      {
        path: "components/gallery.tsx",
        language: "tsx",
        content: [
          'import Image from "next/image";',
          "export function Gallery({ slug }: { slug: string }) {",
          "  return (",
          "    <div>",
          '      <Image src="/logo.svg" alt="Logo" width={64} height={64} />',
          '      <Image src="/placeholder.svg?width=800&height=600&text=Workshop" alt="Workshop" width={800} height={600} />',
          '      <Image src="https://images.unsplash.com/photo-1506905925346.jpg" alt="Remote" width={800} height={600} unoptimized />',
          "      <Image src={`/uploads/${slug}.png`} alt=\"Dynamic\" width={64} height={64} />",
          "    </div>",
          "  );",
          "}",
        ].join("\n"),
      },
    ]);

    expect(
      result.issues.filter((entry) => entry.subject?.startsWith("dangling-static-asset:")),
    ).toEqual([]);
  });

  it("allows warning severity for unresolved imports behind env flag", () => {
    process.env.SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS = "true";
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          'import Missing from "@/components/missing";\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);
    const issue = result.issues.find((entry) => entry.message.includes("Unresolved local import"));
    expect(issue?.severity).toBe("warning");
  });

  it("errors when package.json is missing", () => {
    const result = runProjectSanityChecks([
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);
    const issue = result.issues.find((entry) => entry.file === "package.json");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toMatch(/package\.json is missing/i);
    expect(result.valid).toBe(false);
  });

  it("flags a leading bare `ts` token as a leaked Markdown code-fence", () => {
    // Real repro from `Ny mapp (2)`: an LLM "fix" round wrote the language
    // tag from a Markdown ```ts fence as the first line of the file, which
    // the runtime evaluated as `ReferenceError: ts is not defined` on first
    // boot. Block at preflight so this never reaches the preview host.
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "hooks/use-reduced-motion.tsx",
        language: "tsx",
        content: [
          "ts",
          'import { useReducedMotion as useFramerReducedMotion } from "framer-motion";',
          "",
          "export function useReducedMotion() {",
          "  return useFramerReducedMotion();",
          "}",
        ].join("\n"),
      },
    ]);
    const fenceIssue = result.issues.find((entry) =>
      entry.message.includes("ReferenceError: ts is not defined"),
    );
    expect(fenceIssue?.severity).toBe("error");
    expect(fenceIssue?.file).toBe("hooks/use-reduced-motion.tsx");
    expect(result.valid).toBe(false);
  });

  it("errors on duplicate module stems with different source extensions", () => {
    // Bundler resolution is non-deterministic when both `.ts` and `.tsx`
    // exist for the same import specifier — the loser becomes silent dead
    // weight and the winner may be a stale stub. Block at preflight.
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "hooks/use-reduced-motion.ts",
        language: "ts",
        content: '"use client";\nexport function useReducedMotion(): boolean { return false; }',
      },
      {
        path: "hooks/use-reduced-motion.tsx",
        language: "tsx",
        content:
          '"use client";\nimport { useReducedMotion as useFramerReducedMotion } from "framer-motion";\nexport function useReducedMotion() { return useFramerReducedMotion(); }',
      },
    ]);
    const collisionIssues = result.issues.filter((entry) =>
      entry.message.includes("Duplicate module sources"),
    );
    expect(collisionIssues.length).toBeGreaterThanOrEqual(2);
    expect(collisionIssues.every((issue) => issue.severity === "error")).toBe(true);
    expect(
      collisionIssues.some((issue) => issue.file === "hooks/use-reduced-motion.ts"),
    ).toBe(true);
    expect(
      collisionIssues.some((issue) => issue.file === "hooks/use-reduced-motion.tsx"),
    ).toBe(true);
    expect(result.valid).toBe(false);
    // Meddelandet räknar upp alla kolliderande sökvägar, så det krymper när en
    // av dem tas bort. `subject` är fyndets identitet och ändras inte — det är
    // den reparationsloopens regressionsvakt jämför på (Codex P1 på #623).
    expect(collisionIssues.every((issue) => issue.subject === "duplicate-module:hooks/use-reduced-motion")).toBe(true);
  });

  it("gives a missing dependency a subject that survives a shrinking importer list", () => {
    const importer = (name: string) => ({
      path: `components/${name}.tsx`,
      language: "tsx" as const,
      content: `import { X } from "recharts";\nexport const ${name} = () => X;`,
    });
    const pkg = {
      path: "package.json",
      language: "json" as const,
      content: JSON.stringify({ name: "site", dependencies: {} }),
    };

    const many = runProjectSanityChecks([pkg, importer("a"), importer("b"), importer("c")]);
    const one = runProjectSanityChecks([pkg, importer("a")]);
    const subjectOf = (result: { issues: Array<{ subject?: string; message: string }> }) =>
      result.issues.find((issue) => issue.message.includes("recharts"))?.subject;

    expect(subjectOf(many)).toBe("missing-dependency:recharts");
    expect(subjectOf(one)).toBe("missing-dependency:recharts");
  });

  describe("dangling internal API references", () => {
    const pkg: CodeFile = {
      path: "package.json",
      language: "json",
      content: JSON.stringify({ name: "site", dependencies: {} }),
    };
    const danglingIssues = (files: CodeFile[]) =>
      runProjectSanityChecks(files).issues.filter((issue) =>
        issue.subject?.startsWith("dangling-api-route:"),
      );

    // Incidenten (chat 747636c8, 2026-07-13): den LLM-byggda chattwidgeten
    // fortsatte anropa sin egen `/api/ai-chat` efter att openai-chat-dossiern
    // tagit över ytan med `/api/chat`. Panelen renderade fint och 404:ade på
    // varje skickat meddelande — previewen kunde inte visa felet.
    it("flags a component calling a route that no handler serves", () => {
      const issues = danglingIssues([
        pkg,
        {
          path: "components/chatbot-widget.tsx",
          language: "tsx",
          content: [
            '"use client";',
            "export function ChatbotWidget() {",
            '  const send = () => fetch("/api/ai-chat", { method: "POST" });',
            "  return <button onClick={send}>Skicka</button>;",
            "}",
          ].join("\n"),
        },
        {
          path: "app/api/chat/route.ts",
          language: "ts",
          content: "export async function POST() {\n  return new Response('ok');\n}",
        },
      ]);

      expect(issues).toHaveLength(1);
      expect(issues[0].file).toBe("components/chatbot-widget.tsx");
      expect(issues[0].severity).toBe("warning");
      expect(issues[0].subject).toBe("dangling-api-route:/api/ai-chat");
    });

    it("accepts literal, dynamic, catch-all and route-group handlers", () => {
      const issues = danglingIssues([
        pkg,
        {
          path: "components/data-panel.tsx",
          language: "tsx",
          content: [
            'const a = fetch("/api/chat");',
            'const b = fetch("/api/posts/42");',
            'const c = fetch("/api/files/a/b/c");',
            'const d = fetch("/api/newsletter/");',
            'const e = fetch("/api/placeholder");',
            'const f = fetch("/api/chat?stream=1");',
            "export const Panel = () => null;",
          ].join("\n"),
        },
        { path: "app/api/chat/route.ts", language: "ts", content: "export const POST = () => null;" },
        {
          path: "app/api/posts/[id]/route.ts",
          language: "ts",
          content: "export const GET = () => null;",
        },
        {
          path: "app/api/files/[...path]/route.ts",
          language: "ts",
          content: "export const GET = () => null;",
        },
        {
          path: "app/(marketing)/api/newsletter/route.ts",
          language: "ts",
          content: "export const POST = () => null;",
        },
      ]);

      expect(issues).toEqual([]);
    });

    // Svärm-verifierat fynd 2026-07-31: teckenklassen uteslöt `?`/`#` utan att
    // konsumera dem, så hela literalen `"/api/missing?x=1"` föll utanför regexen
    // och en saknad route med query/hash gav aldrig någon varning (falskt grönt).
    it("flags a dangling route even when the literal carries a query or hash", () => {
      const issues = danglingIssues([
        pkg,
        {
          path: "components/search-panel.tsx",
          language: "tsx",
          content: [
            'const a = fetch("/api/missing?x=1");',
            "const b = fetch(`/api/also-missing#section`);",
            "export const Panel = () => null;",
          ].join("\n"),
        },
      ]);

      expect(issues.map((issue) => issue.subject).sort()).toEqual([
        "dangling-api-route:/api/also-missing",
        "dangling-api-route:/api/missing",
      ]);
    });

    it("skips interpolated paths and commented-out calls", () => {
      const issues = danglingIssues([
        pkg,
        {
          path: "components/loader.tsx",
          language: "tsx",
          content: [
            "const base = (id: string) => fetch(`/api/${id}/detail`);",
            '// fetch("/api/legacy-endpoint")',
            "export const Loader = () => null;",
          ].join("\n"),
        },
      ]);

      expect(issues).toEqual([]);
    });

    it("never blocks the build on its own", () => {
      const result = runProjectSanityChecks([
        pkg,
        {
          path: "components/widget.tsx",
          language: "tsx",
          content: 'export const Widget = () => fetch("/api/nowhere");',
        },
      ]);

      expect(
        result.issues.some((issue) => issue.subject === "dangling-api-route:/api/nowhere"),
      ).toBe(true);
      expect(
        result.issues.filter((issue) => issue.severity === "error").every(
          (issue) => !issue.subject?.startsWith("dangling-api-route:"),
        ),
      ).toBe(true);
    });
  });
});
