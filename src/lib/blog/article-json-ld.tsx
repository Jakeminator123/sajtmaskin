import { PUBLIC_CANONICAL_ORIGIN } from "@/lib/public-canonical-url";
import { blogPostCanonical, type PublishedBlogPost } from "./posts";

export function BlogArticleJsonLd({ post }: { post: PublishedBlogPost }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: "sv-SE",
    mainEntityOfPage: blogPostCanonical(post.slug),
    author: {
      "@type": "Organization",
      name: "Sajtmaskin",
      legalName: "Pretty Good B.V.",
      url: PUBLIC_CANONICAL_ORIGIN,
    },
    publisher: {
      "@type": "Organization",
      name: "Sajtmaskin",
      legalName: "Pretty Good B.V.",
      url: PUBLIC_CANONICAL_ORIGIN,
    },
  };

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
