import { wisp } from "@/lib/wisp";
import { notFound } from "next/navigation";
import { formatFullDate } from "@/lib/date";
import type { Metadata } from "next";
import { siteConfig } from "@/lib/site-config";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  try {
    const post = await wisp.getPost(slug);

    return {
      title: post.title,
      description: post.description || siteConfig.description,
      openGraph: {
        title: post.title,
        description: post.description || siteConfig.description,
        type: "article",
        url: `${siteConfig.baseUrl}/blog/${post.slug}`,
        images: [
          {
            url: `${siteConfig.baseUrl}/api/og-image?title=${encodeURIComponent(post.title)}&brand=${encodeURIComponent(siteConfig.organization)}`,
            width: 1200,
            height: 600,
          },
        ],
      },
    };
  } catch {
    return {};
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let post;
  try {
    post = await wisp.getPost(slug);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <article>
        <h1 className="text-4xl font-bold">{post.title}</h1>
        {post.publishedAt && (
          <p className="mt-3 text-sm text-muted-foreground">
            {formatFullDate(new Date(post.publishedAt))}
          </p>
        )}
        {post.description && <p className="mt-6 text-lg">{post.description}</p>}
        <div className="prose prose-neutral mt-10 max-w-none dark:prose-invert">
          <div dangerouslySetInnerHTML={{ __html: post.content }} />
        </div>
      </article>
    </main>
  );
}
