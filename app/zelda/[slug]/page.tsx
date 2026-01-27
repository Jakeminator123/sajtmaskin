import { notFound } from 'next/navigation';
import { getPostBySlug, getPostsByAuthor } from '@/lib/db';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { MarkdownContent } from '@/components/markdown-content';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ZeldaPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug('zelda', slug);

  if (!post) {
    notFound();
  }

  const formattedDate = new Date(post.createdAt).toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      
      <main className="flex-1">
        <article className="py-12 sm:py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <Breadcrumbs
              items={[
                { label: 'Zelda blogg', href: '/zelda' },
                { label: post.title },
              ]}
            />

            <div className="mb-8">
              <Button asChild variant="ghost" size="sm" className="mb-6">
                <Link href="/zelda">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Tillbaka till Zelda blogg
                </Link>
              </Button>
            </div>

            {/* Post Header */}
            <header className="mb-12 rounded-3xl bg-gradient-to-br from-zelda-pink-bg to-zelda-pink-light/30 p-8 sm:p-12">
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <Badge className="bg-gradient-to-r from-zelda-pink to-zelda-pink-dark text-white border-0 shadow-md px-3 py-1 font-bold">
                  <User className="mr-1.5 h-4 w-4" />
                  Zelda
                </Badge>
                <span className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                  <Calendar className="h-4 w-4" />
                  {formattedDate}
                </span>
              </div>

              <h1 className="mb-8 text-balance font-bold text-5xl text-foreground sm:text-6xl leading-tight">
                {post.title}
              </h1>

              {post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="rounded-full px-3 py-1 font-medium">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </header>

            {/* Featured Image */}
            {post.imageUrl && (
              <div className="mb-12 overflow-hidden rounded-3xl shadow-2xl border-4 border-white">
                <img
                  src={post.imageUrl || "/placeholder.svg"}
                  alt={post.title}
                  className="h-auto w-full object-cover"
                />
              </div>
            )}

            {/* Post Content */}
            <div className="prose prose-lg max-w-none">
              <MarkdownContent content={post.content} />
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}

export async function generateStaticParams() {
  const posts = await getPostsByAuthor('zelda');
  return posts.map((post) => ({
    slug: post.slug,
  }));
}
