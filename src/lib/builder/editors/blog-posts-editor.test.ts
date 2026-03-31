import { describe, expect, it } from "vitest";
import {
  readBlogPostsDraft,
  updateBlogPostsDraft,
  type BlogPostDraft,
} from "./blog-posts-editor";

describe("blog-posts-editor", () => {
  describe("readBlogPostsDraft", () => {
    it("reads blog post title and excerpt metadata from page files", () => {
      const content = [
        "const posts = [",
        "  {",
        "    slug: 'post-1',",
        "    title: 'Post ett',",
        "    excerpt: 'Kort sammanfattning ett.',",
        "    date: '2026-03-10',",
        "    author: 'Alex',",
        "    category: 'Guide',",
        "  },",
        "  {",
        "    slug: 'post-2',",
        "    title: 'Post två',",
        "    excerpt: 'Kort sammanfattning två.',",
        "    date: '2026-03-09',",
        "    author: 'Alex',",
        "    category: 'Nyheter',",
        "  },",
        "];",
      ].join("\n");

      expect(readBlogPostsDraft("app/blog/page.tsx", content)).toEqual([
        { title: "Post ett", excerpt: "Kort sammanfattning ett." },
        { title: "Post två", excerpt: "Kort sammanfattning två." },
      ]);
    });

    it("returns null for non-page files", () => {
      const content = [
        "const posts = [",
        "  { slug: 'post-1', title: 'Post ett', excerpt: 'Kort sammanfattning ett.', date: '2026-03-10', author: 'Alex', category: 'Guide' },",
        "  { slug: 'post-2', title: 'Post två', excerpt: 'Kort sammanfattning två.', date: '2026-03-09', author: 'Alex', category: 'Nyheter' },",
        "];",
      ].join("\n");

      expect(readBlogPostsDraft("components/blog-list.tsx", content)).toBeNull();
    });

    it("returns null when fewer than two posts exist", () => {
      const content = [
        "const posts = [",
        "  { slug: 'post-1', title: 'Post ett', excerpt: 'Kort sammanfattning ett.', date: '2026-03-10', author: 'Alex', category: 'Guide' },",
        "];",
      ].join("\n");

      expect(readBlogPostsDraft("app/blog/page.tsx", content)).toBeNull();
    });
  });

  describe("updateBlogPostsDraft", () => {
    it("updates title and excerpt in place", () => {
      const content = [
        "const posts = [",
        "  { slug: 'post-1', title: 'Post ett', excerpt: 'Kort sammanfattning ett.', date: '2026-03-10', author: 'Alex', category: 'Guide' },",
        "  { slug: 'post-2', title: 'Post två', excerpt: 'Kort sammanfattning två.', date: '2026-03-09', author: 'Alex', category: 'Nyheter' },",
        "];",
      ].join("\n");

      const nextItems: BlogPostDraft[] = [
        { title: "Ny titel ett", excerpt: "Ny ingress ett." },
        { title: "Ny titel två", excerpt: "Ny ingress två." },
      ];

      const updated = updateBlogPostsDraft(content, nextItems);
      expect(updated).toContain("title: 'Ny titel ett'");
      expect(updated).toContain("excerpt: 'Ny ingress ett.'");
      expect(updated).toContain("title: 'Ny titel två'");
      expect(updated).toContain("excerpt: 'Ny ingress två.'");
    });

    it("returns content unchanged when no edits exist", () => {
      const content = [
        "const posts = [",
        "  { slug: 'post-1', title: 'Post ett', excerpt: 'Kort sammanfattning ett.', date: '2026-03-10', author: 'Alex', category: 'Guide' },",
        "  { slug: 'post-2', title: 'Post två', excerpt: 'Kort sammanfattning två.', date: '2026-03-09', author: 'Alex', category: 'Nyheter' },",
        "];",
      ].join("\n");

      const nextItems: BlogPostDraft[] = [
        { title: "Post ett", excerpt: "Kort sammanfattning ett." },
        { title: "Post två", excerpt: "Kort sammanfattning två." },
      ];

      expect(updateBlogPostsDraft(content, nextItems)).toBe(content);
    });
  });
});
