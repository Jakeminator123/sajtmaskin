import { describe, expect, it } from "vitest";
import {
  getIndexableBlogRelPaths,
  getPublishedBlogPost,
  hasPublishedBlogPosts,
  PUBLISHED_BLOG_POSTS,
} from "./posts";
import { BLOG_HAS_PUBLISHED_POSTS } from "./status";

describe("published blog posts", () => {
  it("exposes three indexable Swedish guides", () => {
    expect(BLOG_HAS_PUBLISHED_POSTS).toBe(true);
    expect(hasPublishedBlogPosts()).toBe(true);
    expect(PUBLISHED_BLOG_POSTS).toHaveLength(3);
    expect(PUBLISHED_BLOG_POSTS.map((post) => post.slug)).toEqual([
      "vad-kostar-en-hemsida-2026",
      "hemsida-enskild-firma",
      "skapa-hemsida-med-ai-sa-funkar-det",
    ]);
    expect(getIndexableBlogRelPaths()).toEqual([
      "/blogg",
      "/blogg/vad-kostar-en-hemsida-2026",
      "/blogg/hemsida-enskild-firma",
      "/blogg/skapa-hemsida-med-ai-sa-funkar-det",
    ]);
  });

  it("keeps unique titles, keywords and canonical slugs", () => {
    const slugs = PUBLISHED_BLOG_POSTS.map((post) => post.slug);
    const titles = PUBLISHED_BLOG_POSTS.map((post) => post.title);
    const keywords = PUBLISHED_BLOG_POSTS.map((post) => post.keyword);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(keywords).size).toBe(keywords.length);
    for (const post of PUBLISHED_BLOG_POSTS) {
      expect(post.description.length).toBeGreaterThan(80);
      expect(post.sections.length).toBeGreaterThanOrEqual(4);
      expect(getPublishedBlogPost(post.slug)?.title).toBe(post.title);
    }
  });

  it("treats a non-empty list as published", () => {
    expect(hasPublishedBlogPosts([{ slug: "forsta", title: "Första inlägget" }])).toBe(true);
    expect(hasPublishedBlogPosts([])).toBe(false);
  });
});
