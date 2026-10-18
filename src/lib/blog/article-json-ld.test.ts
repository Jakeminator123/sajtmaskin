import { describe, expect, it } from "vitest";
import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import { BlogArticleJsonLd } from "./article-json-ld";
import { PUBLISHED_BLOG_POSTS } from "./posts";

describe("BlogArticleJsonLd", () => {
  it("emits Article schema for a published post", () => {
    const post = PUBLISHED_BLOG_POSTS[0];
    const element = BlogArticleJsonLd({ post });
    const html = (element.props as { dangerouslySetInnerHTML: { __html: string } })
      .dangerouslySetInnerHTML.__html;
    const data = JSON.parse(html) as {
      "@type": string;
      headline: string;
      datePublished: string;
      author: { name: string };
    };
    expect(data["@type"]).toBe("Article");
    expect(data.headline).toBe(post.title);
    expect(data.datePublished).toBe(post.publishedAt);
    expect(data.author.name).toBe("Sajtmaskin");
    expect(html).toContain(`${PUBLIC_CANONICAL_ORIGIN}/blogg/${post.slug}`);
  });
});
