import { describe, expect, it } from "vitest";
import {
  normalizeLegacySummary,
  normalizePlaywrightCatalog,
  normalizeRepoUrl,
} from "./template-library-discovery";

describe("template-library discovery helpers", () => {
  it("normalizes legacy summaries into the canonical grouped contract", () => {
    const summary = normalizeLegacySummary({
      ai: [
        {
          category_slug: "ai",
          category_name: "AI",
          template_url: "https://vercel.com/templates/ai/chatbot",
          title: "Chatbot",
          description: "AI app",
          repo_url: "https://github.com/vercel/chatbot/tree/main/",
          demo_url: "https://chatbot.ai-sdk.dev/demo",
          framework_match: true,
          framework_reason: "Next.js, React",
          stack_tags: ["Next.js", "React", "React"],
          important_lines: ["Chatbot", "AI app", "AI app"],
        },
      ],
    });

    expect(summary.ai).toHaveLength(1);
    expect(summary.ai[0].stack_tags).toEqual(["Next.js", "React"]);
    expect(summary.ai[0].important_lines).toEqual(["Chatbot", "AI app"]);
  });

  it("maps Playwright catalog output into builder-compatible records", () => {
    const normalized = normalizePlaywrightCatalog({
      scrapedAt: "2026-03-12T00:00:00.000Z",
      sourceUrl: "https://vercel.com/templates?framework=next.js",
      filterPreset: "sajtmaskin",
      appliedFilters: {
        type: ["documentation"],
      },
      totalTemplates: 1,
      templates: [
        {
          title: "Docs Starter",
          description: "Docs site starter",
          url: "https://vercel.com/templates/documentation/docs-starter",
          categories: ["documentation"],
          imageUrl: null,
          stackTags: ["Next.js", "Tailwind"],
          repoUrl: "https://github.com/vercel/examples/tree/main/solutions/docs",
          demoUrl: "https://docs.example.com",
          importantLines: ["Docs site starter", "Tailwind"],
        },
      ],
    });

    expect(normalized.summary.documentation).toHaveLength(1);
    expect(normalized.summary.documentation[0]).toMatchObject({
      category_slug: "documentation",
      framework_match: true,
      repo_url: "https://github.com/vercel/examples/tree/main/solutions/docs",
    });
  });

  it("drops framework-category noise when type filters are present", () => {
    const normalized = normalizePlaywrightCatalog({
      scrapedAt: "2026-03-12T00:00:00.000Z",
      sourceUrl: "https://vercel.com/templates",
      filterPreset: "sajtmaskin",
      appliedFilters: {
        type: ["starter"],
      },
      totalTemplates: 1,
      templates: [
        {
          title: "Image Gallery Starter",
          description: "",
          url: "https://vercel.com/templates/next.js/image-gallery-starter",
          categories: ["next.js", "starter"],
          stackTags: ["Starter", "Next.js", "Tailwind"],
          repoUrl: "https://github.com/vercel/next.js/tree/canary/examples/with-cloudinary",
          demoUrl: "https://demo.example.com",
        },
      ],
    });

    expect(normalized.summary.starter).toHaveLength(1);
    expect(normalized.summary["next-js"]).toBeUndefined();
  });

  it("normalizes GitHub and deploy-wrapper repo URLs", () => {
    expect(normalizeRepoUrl("https://github.com/vercel/chatbot/tree/main/").normalizedUrl).toBe(
      "https://github.com/vercel/chatbot",
    );
    expect(
      normalizeRepoUrl("https://app.netlify.com/start/deploy?repository=https://github.com/arcjet/example-nextjs")
        .normalizedUrl,
    ).toBe("https://github.com/arcjet/example-nextjs");
  });
});
