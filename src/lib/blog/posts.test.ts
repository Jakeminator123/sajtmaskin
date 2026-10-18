import { describe, expect, it } from "vitest";
import { PUBLISHED_BLOG_POSTS, hasPublishedBlogPosts } from "./posts";

describe("published blog posts", () => {
  it("stays empty until editorial posts exist", () => {
    expect(PUBLISHED_BLOG_POSTS).toEqual([]);
    expect(hasPublishedBlogPosts()).toBe(false);
  });

  it("treats a non-empty list as published", () => {
    expect(hasPublishedBlogPosts([{ slug: "forsta", title: "Första inlägget" }])).toBe(true);
  });
});
