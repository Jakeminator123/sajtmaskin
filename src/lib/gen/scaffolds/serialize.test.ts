import { describe, expect, it } from "vitest";
import { detectScaffoldMode, serializeScaffoldForPrompt } from "./serialize";
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
      id: "test-scaffold",
      family: "landing-page",
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
    expect(out).toContain('file="app/page.tsx"');
    expect(out).not.toContain("NON_CRITICAL_PAYLOAD");
  });

  it("prioritizes route/capability-relevant files in critical scaffold selection", () => {
    const scaffold: ScaffoldManifest = {
      id: "test-auth-aware",
      family: "auth-pages",
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
      },
    });

    expect(out).toContain('file="components/login-form.tsx"');
  });
});

describe("detectScaffoldMode", () => {
  it("does not trigger inspirational mode for 'workspace' containing 'space'", () => {
    expect(detectScaffoldMode("en workspace-app för teamet")).toBe("structural");
  });

  it("does not trigger inspirational mode for Swedish 'barn' (children)", () => {
    expect(detectScaffoldMode("en app för barn och föräldrar")).toBe("structural");
  });

  it("does not trigger from 'workspace' + 'barn' substring false positives", () => {
    expect(detectScaffoldMode("en workspace-app för barn")).toBe("structural");
  });

  it("still triggers inspirational mode for genuine creative keywords", () => {
    expect(detectScaffoldMode("en cyberpunk-sajt med neon och vaporwave")).toBe("inspirational");
  });

  it("triggers on a single strong keyword (>= 10 chars)", () => {
    expect(detectScaffoldMode("jag vill ha en futuristisk sajt")).toBe("inspirational");
  });

  it("does not trigger from 'discover' containing 'disco'", () => {
    expect(detectScaffoldMode("discover new products in our marketplace")).toBe("structural");
  });
});
