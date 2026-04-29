import { describe, expect, it } from "vitest";
import { getAllScaffolds } from "./registry";
import { serializeScaffoldForPrompt } from "./serialize";
import type { ScaffoldManifest } from "./types";

function makeLongFile(label: string): string {
  return [
    `export const ${label} = () => {`,
    "  return (",
    "    <section>",
    `      <h2>${label}</h2>`,
    `      <p>${"content ".repeat(400)}</p>`,
    "    </section>",
    "  );",
    "};",
  ].join("\n");
}

describe("serializeScaffoldForPrompt", () => {
  it("keeps structural mode within a predictable budget", () => {
    const scaffold: ScaffoldManifest = {
      id: "landing-page",
      label: "Test scaffold",
      description: "A scaffold used for prompt-budget tests.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: [],
      files: [
        { path: "app/layout.tsx", content: makeLongFile("Layout") },
        { path: "app/page.tsx", content: makeLongFile("HomePage") },
        { path: "app/globals.css", content: ".root { color: red; }\n".repeat(500) },
        { path: "components/hero.tsx", content: makeLongFile("Hero") },
        { path: "components/features.tsx", content: makeLongFile("Features") },
        { path: "components/testimonials.tsx", content: makeLongFile("Testimonials") },
        { path: "components/non-critical.tsx", content: "NON_CRITICAL_PAYLOAD\n".repeat(600) },
      ],
    };

    const out = serializeScaffoldForPrompt(scaffold, "structural", {
      maxChars: 22_000,
      contextPolicy: "normal",
    });

    expect(out.length).toBeLessThanOrEqual(22_500);
    expect(out).toContain("## Scaffold File Tree");
    expect(out).toContain("## Critical Scaffold Files");
    expect(out).toContain('file="app/layout.tsx"');
    expect(out).toContain("### FileContract: app/page.tsx");
    expect(out).not.toContain("NON_CRITICAL_PAYLOAD");
  });

  it("prioritizes route/capability-relevant files in critical scaffold selection", () => {
    const scaffold: ScaffoldManifest = {
      id: "auth-pages",
      label: "Auth aware scaffold",
      description: "A scaffold for relevance ranking tests.",
      allowedBuildIntents: ["website", "app"],
      tags: [],
      promptHints: [],
      files: [
        { path: "app/layout.tsx", content: makeLongFile("Layout") },
        { path: "app/globals.css", content: ".root { color: red; }\n".repeat(150) },
        { path: "app/page.tsx", content: makeLongFile("HomePage") },
        { path: "components/login-form.tsx", content: makeLongFile("LoginForm") },
        { path: "components/pricing-table.tsx", content: makeLongFile("PricingTable") },
      ],
    };

    const out = serializeScaffoldForPrompt(scaffold, "structural", {
      maxChars: 18_000,
      contextPolicy: "light",
      routePlan: {
        provenance: { primarySource: "prompt", sources: ["prompt"] },
        siteType: "app-shell",
        reason: "test",
        routes: [{ path: "/login", name: "Login", intent: "auth", required: true }],
      },
      capabilities: {
        needsMotion: false,
        needs3D: false,
        needsCharts: false,
        needsDatabase: false,
        needsAuth: true,
        needsAppShell: false,
        needsDataUI: false,
        needsForms: true,
        needsEcommerce: false,
        needsCarousel: false,
        needsPremiumVisuals: false,
        needsCalendar: false,
        needsCommandSearch: false,
        needsThemeToggle: false,
      },
    });

    expect(out).toContain("### FileContract: components/login-form.tsx");
  });

  it("renders a route-page as excerpt by default and shrinks Critical Scaffold Files", () => {
    const scaffold: ScaffoldManifest = {
      id: "landing-page",
      label: "Excerpt scaffold",
      description: "A scaffold used to verify excerpt-by-default for page.tsx.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: [],
      files: [
        { path: "app/layout.tsx", content: makeLongFile("Layout") },
        {
          path: "app/page.tsx",
          content: [
            'import Hero from "@/components/hero";',
            'import Features from "@/components/features";',
            "",
            "export default function HomePage() {",
            "  return (",
            "    <main>",
            "      <Hero>",
            `        ${"long body content ".repeat(500)}`,
            "      </Hero>",
            "      <Features />",
            "    </main>",
            "  );",
            "}",
          ].join("\n"),
        },
        { path: "app/globals.css", content: ".root { color: red; }" },
        {
          path: "components/hero.tsx",
          content: [
            'import Link from "next/link";',
            "",
            "export const Hero = (props: { title: string }) => {",
            `  return <section>${"hero body ".repeat(300)}</section>;`,
            "};",
          ].join("\n"),
        },
      ],
    };

    const out = serializeScaffoldForPrompt(scaffold, "structural", {
      maxChars: 22_000,
      contextPolicy: "normal",
    });

    expect(out).toContain("### FileContract: app/page.tsx");
    expect(out).toContain("- completeness: partial-not-executable");
    expect(out).toContain("- mustEmit: true");
    expect(out).toContain("- routePath: /");
    expect(out).toContain("Full source body intentionally omitted");
    expect(out).not.toContain('```tsx file="app/page.tsx"');
    expect(out).not.toContain(
      "long body content long body content long body content long body content",
    );
    expect(out).toContain("### FileContract: components/hero.tsx");
    expect(out).toContain("- completeness: signature-only");
    expect(out).not.toContain("hero body hero body hero body");
  });

  it("respects an explicit serialization=full override on a route-page file", () => {
    const fullPage = [
      'import Hero from "@/components/hero";',
      "",
      "export default function HomePage() {",
      `  return <main>${"full body content ".repeat(40)}</main>;`,
      "}",
    ].join("\n");
    const scaffold: ScaffoldManifest = {
      id: "landing-page",
      label: "Override scaffold",
      description: "A scaffold used to verify per-file serialization overrides.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: [],
      files: [
        { path: "app/layout.tsx", content: makeLongFile("Layout") },
        { path: "app/page.tsx", content: fullPage, serialization: "full" },
        { path: "app/globals.css", content: ".root { color: red; }" },
      ],
    };

    const out = serializeScaffoldForPrompt(scaffold, "structural", {
      maxChars: 22_000,
      contextPolicy: "normal",
    });

    expect(out).toContain("full body content full body content");
    expect(out).not.toContain("// excerpt truncated — full file");
  });

  it("omits oversized scaffold files instead of emitting truncated TSX snippets", () => {
    const scaffold: ScaffoldManifest = {
      id: "landing-page",
      label: "Oversized scaffold",
      description: "A scaffold used for truncation tests.",
      allowedBuildIntents: ["website"],
      tags: [],
      promptHints: [],
      files: [
        { path: "app/layout.tsx", content: makeLongFile("HugeLayout") },
        { path: "components/site-header.tsx", content: makeLongFile("HugeHeader") },
      ],
    };

    const out = serializeScaffoldForPrompt(scaffold, "structural", {
      maxChars: 4_000,
      contextPolicy: "normal",
    });

    expect(out).not.toContain("// ... truncated");
    expect(out).toContain("omitted for prompt budget");
    expect(out).toContain("components/site-header.tsx");
  });

  it("keeps Critical Scaffold Files under 6k across all runtime scaffolds", () => {
    for (const scaffold of getAllScaffolds()) {
      const out = serializeScaffoldForPrompt(scaffold, "structural", {
        maxChars: 10_000,
        contextPolicy: "normal",
      });
      const critical = out.split("## Critical Scaffold Files\n\n")[1] ?? "";
      const criticalWithoutHints = critical.split("\n\nScaffold hints:")[0] ?? critical;
      expect(
        criticalWithoutHints.length,
        `${scaffold.id} Critical Scaffold Files too large`,
      ).toBeLessThanOrEqual(6_000);
      expect(criticalWithoutHints).not.toMatch(/```tsx file="(?:app|src\/app)\/[^"]*page\.tsx"/);
      expect(criticalWithoutHints).toContain("FileContract");
    }
  });
});
