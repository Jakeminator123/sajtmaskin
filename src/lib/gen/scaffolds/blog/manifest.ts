import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const blogManifest: ScaffoldManifest = {
  id: "blog",
  label: "Blog",
  description:
    "Content-first blog starter with article list, post layout, author, featured posts, and reading-friendly typography.",
  siteKind: "editorial",
  complexity: "medium",
  structureProfile: "editorial-hub",
  contentProfile: "long-form-content",
  features: ["article-list", "taxonomy", "author-bio"],
  allowedBuildIntents: ["website", "template"],
  tags: ["blog", "article", "post", "content", "writer", "newsletter", "magazine", "editorial"],
  promptHints: [
    "Use this scaffold for blogs, articles, editorial sites, and content-driven publications.",
    "Keep the blog rhythm: article list, post detail layout, metadata (date, author, tags), and reading-friendly typography.",
    "Modify post content, categories, and author info to fit the user's topic instead of replacing the whole structure.",
  ],
  qualityChecklist: [
    "Archive, article, and reading flow should stay intact instead of collapsing into generic landing-page sections.",
    "Metadata like author, dates, tags, and excerpts should feel editorial and topic-specific.",
    "Typography and spacing should prioritize readability and content hierarchy over decorative UI.",
  ],
  research: {
    upgradeTargets: [
      "Add topic/category filtering with dedicated archive pages and tag navigation.",
      "Add related posts, reading time, and share actions on article pages.",
      "Add newsletter CTA blocks tuned to the publication's actual niche.",
    ],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): /blog was always planned, required unless buildIntent
  // was "app".
  routeContract: {
    requiredRoutes: [
      {
        path: "/blog",
        name: "Blog",
        planIntent: "Keep an editorial route for articles and archives.",
        requiredOnlyForBuildIntents: ["website", "template"],
        initEquivalentPaths: ["/artiklar", "/articles"],
      },
    ],
    optionalRoutes: [],
    declaredRoutePaths: [],
    // No delivery group needed: app/blog/[slug]/page.tsx is a path
    // descendant of /blog, so the plan filter already couples them.
    dynamicRoutePatterns: ["/blog/[slug]"],
  },
  navSurface: "components/site-header.tsx",
  files: loadScaffoldFiles("blog"),
};
