// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PUBLISHED_BLOG_POSTS } from "@/lib/blog/posts";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import BloggPage, { metadata } from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));

describe("/blogg", () => {
  it("lists published posts and is indexable on the canonical origin", () => {
    expect(metadata.title).toBe("Blogg");
    expect(metadata.alternates).toEqual({ canonical: `${PUBLIC_CANONICAL_ORIGIN}/blogg` });

    render(<BloggPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Blogg" })).toBeTruthy();
    for (const post of PUBLISHED_BLOG_POSTS) {
      expect(screen.getByRole("link", { name: post.title }).getAttribute("href")).toBe(
        `/blogg/${post.slug}`,
      );
    }
    expect(screen.queryByText("Inga inlägg ännu")).toBeNull();
  });
});
