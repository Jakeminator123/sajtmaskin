import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogArticleJsonLd } from "@/lib/blog/article-json-ld";
import {
  getPublishedBlogPost,
  PUBLISHED_BLOG_POSTS,
  type PublishedBlogPost,
} from "@/lib/blog/posts";
import { Footer } from "@/components/layout/footer";
import { publicCanonicalPath, publicIndexRobots, publicPageAlternates } from "@/lib/public-canonical-url";

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return PUBLISHED_BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPublishedBlogPost(slug);
  if (!post) {
    return { robots: { index: false, follow: false } };
  }
  const canonical = publicCanonicalPath(`/blogg/${post.slug}`);
  return {
    title: post.title,
    description: post.description,
    alternates: publicPageAlternates(`/blogg/${post.slug}`),
    robots: publicIndexRobots(),
    openGraph: {
      title: post.title,
      description: post.description,
      url: canonical,
      type: "article",
      locale: "sv_SE",
      siteName: "Sajtmaskin",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

function BlogPostBody({ post }: { post: PublishedBlogPost }) {
  return (
    <article>
      <p className="text-muted-foreground mb-3 text-sm">
        Publicerad {formatDate(post.publishedAt)}
        {post.updatedAt !== post.publishedAt ? ` · uppdaterad ${formatDate(post.updatedAt)}` : ""}
      </p>
      <h1 className="mb-4 text-3xl font-(--font-heading) tracking-tight md:text-5xl">{post.title}</h1>
      <p className="text-muted-foreground mb-10 text-base leading-relaxed md:text-lg">{post.excerpt}</p>

      <div className="space-y-10">
        {post.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-foreground text-xl font-medium md:text-2xl">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-muted-foreground text-sm leading-relaxed md:text-base">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      {post.faqs.length > 0 ? (
        <section className="mt-12 space-y-4">
          <h2 className="text-foreground text-xl font-medium md:text-2xl">Vanliga frågor</h2>
          <dl className="space-y-3">
            {post.faqs.map((faq) => (
              <div key={faq.q} className="border-border/25 bg-card/30 rounded-2xl border px-5 py-5">
                <dt className="text-foreground font-medium">{faq.q}</dt>
                <dd className="text-muted-foreground mt-2 text-sm leading-relaxed">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-12 space-y-3">
        <h2 className="text-foreground text-lg font-medium">Läs mer</h2>
        <ul className="list-disc space-y-1 pl-5">
          {post.related.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-primary underline-offset-4 hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/builder?new=1" className="text-primary underline-offset-4 hover:underline">
              Öppna byggaren
            </Link>
          </li>
        </ul>
      </section>
    </article>
  );
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPublishedBlogPost(slug);
  if (!post) notFound();

  return (
    <>
      <BlogArticleJsonLd post={post} />
      <main className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Link
            href="/blogg"
            className="text-muted-foreground hover:text-foreground mb-8 inline-block text-sm transition-colors"
          >
            &larr; Alla inlägg
          </Link>
          <BlogPostBody post={post} />
        </div>
      </main>
      <Footer />
    </>
  );
}
