import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { hasPublishedBlogPosts, PUBLISHED_BLOG_POSTS } from "@/lib/blog/posts";
import { publicIndexRobots, publicPageAlternates } from "@/lib/public-canonical-url";

const hasPosts = hasPublishedBlogPosts();

export const metadata: Metadata = {
  title: "Blogg",
  description: hasPosts
    ? "Guider om att skapa hemsida, pris och enskild firma. Skrivet av Sajtmaskin för svenska småföretag."
    : "Artiklar om Sajtmaskin, webb bästa praxis och produktnyheter — första inlägg publiceras när redaktionen är igång.",
  alternates: publicPageAlternates("/blogg"),
  robots: hasPosts ? publicIndexRobots() : { ...publicIndexRobots(), index: false },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

export default function BloggPage() {
  return (
    <>
      <main className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-8 inline-block text-sm transition-colors"
          >
            &larr; Tillbaka
          </Link>

          <h1 className="mb-2 text-3xl font-(--font-heading) tracking-tight">Blogg</h1>
          <p className="text-muted-foreground mb-10 text-sm">
            Korta guider för den som ska skapa en hemsida. Inga påhittade kundcase och inga
            hittepå-statistik.
          </p>

          <ul className="space-y-4">
            {PUBLISHED_BLOG_POSTS.map((post) => (
              <li key={post.slug}>
                <article className="border-border/25 bg-card/30 rounded-2xl border p-6">
                  <p className="text-muted-foreground mb-2 text-xs">{formatDate(post.publishedAt)}</p>
                  <h2 className="text-foreground mb-2 text-xl font-medium">
                    <Link
                      href={`/blogg/${post.slug}`}
                      className="hover:text-primary underline-offset-4 hover:underline"
                    >
                      {post.title}
                    </Link>
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">{post.excerpt}</p>
                </article>
              </li>
            ))}
          </ul>

          <div className="prose-sm text-muted-foreground mt-12 space-y-8">
            <section className="space-y-3 text-sm leading-relaxed">
              <h2 className="text-foreground text-lg font-medium">Mer att läsa</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <Link href="/skapa-hemsida" className="text-primary underline-offset-4 hover:underline">
                    Skapa hemsida
                  </Link>
                </li>
                <li>
                  <Link
                    href="/skapa-hemsida-med-ai"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Skapa hemsida med AI
                  </Link>
                </li>
                <li>
                  <Link
                    href="/vad-kostar-en-hemsida"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Vad kostar en hemsida?
                  </Link>
                </li>
                <li>
                  <Link
                    href="/hemsida-till-foretag"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Hemsida till företag
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="text-primary underline-offset-4 hover:underline">
                    Vanliga frågor
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
