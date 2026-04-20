import { wisp } from "@/lib/wisp";
import Link from "next/link";
import { formatFullDate } from "@/lib/date";

export default async function BlogPage() {
  const posts = await wisp.getPosts({ limit: 20 });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Blog</h1>
      <div className="mt-8 space-y-8">
        {posts.posts.map((post) => (
          <article key={post.id} className="border-b pb-8">
            <h2 className="text-2xl font-semibold">
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </h2>
            {post.publishedAt && (
              <p className="mt-2 text-sm text-muted-foreground">
                {formatFullDate(new Date(post.publishedAt))}
              </p>
            )}
            {post.description && <p className="mt-3 text-base">{post.description}</p>}
          </article>
        ))}
      </div>
    </main>
  );
}
