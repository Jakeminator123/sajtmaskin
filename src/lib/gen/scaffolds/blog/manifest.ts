import type { ScaffoldManifest } from "../types";

export const blogManifest: ScaffoldManifest = {
  id: "blog",
  family: "blog",
  label: "Blog",
  description:
    "Content-first blog starter with article list, post layout, author, featured posts, and reading-friendly typography.",
  buildIntents: ["website", "template"],
  tags: [
    "blog",
    "article",
    "post",
    "content",
    "writer",
    "newsletter",
    "magazine",
    "editorial",
  ],
  promptHints: [
    "Use this scaffold for blogs, articles, editorial sites, and content-driven publications.",
    "Keep the blog rhythm: article list, post detail layout, metadata (date, author, tags), and reading-friendly typography.",
    "Modify post content, categories, and author info to fit the user's topic instead of replacing the whole structure.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.99 0.005 95);
  --color-foreground: oklch(0.18 0.02 260);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.21 0.02 260);
  --color-primary: oklch(0.5 0.14 260);
  --color-primary-foreground: oklch(0.98 0.004 260);
  --color-secondary: oklch(0.96 0.01 260);
  --color-secondary-foreground: oklch(0.25 0.02 260);
  --color-muted: oklch(0.95 0.008 260);
  --color-muted-foreground: oklch(0.5 0.02 260);
  --color-accent: oklch(0.94 0.02 220);
  --color-accent-foreground: oklch(0.22 0.02 260);
  --color-border: oklch(0.9 0.01 260);
  --color-ring: oklch(0.5 0.14 260);
  --radius: 0.75rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  }

  .prose {
    @apply max-w-none;
  }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Blog Starter",
  description: "A content-first blog starter with article list, post layout, and reading-friendly typography.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={inter.variable}>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, BookOpen } from "lucide-react";
import { BlogCard } from "@/components/blog-card";
import Link from "next/link";

const featured = [
  {
    slug: "getting-started-with-content",
    title: "Getting started with content-first design",
    excerpt: "How to structure a blog for readability and engagement.",
    date: "2026-03-10",
    author: "Alex",
    category: "Design",
  },
  {
    slug: "typography-for-readers",
    title: "Typography choices that make readers stay",
    excerpt: "Font sizes, line heights, and spacing for long-form content.",
    date: "2026-03-08",
    author: "Alex",
    category: "Design",
  },
];

const recent = [
  {
    slug: "building-a-blog",
    title: "Building a blog from scratch",
    excerpt: "A step-by-step guide to setting up a modern blog.",
    date: "2026-03-05",
    author: "Alex",
    category: "Tutorial",
  },
];

export default function HomePage() {
  return (
    <div className="px-6 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl space-y-16">
        <section className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <Badge className="rounded-full px-3 py-1">Blog starter</Badge>
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
                A blog with clear structure for articles and reading
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                This scaffold gives you a home page with featured posts, an article list, and a post detail layout.
                Adapt the content and categories to your topic.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/blog">
                View all posts <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {featured.map((post) => (
              <BlogCard key={post.slug} {...post} featured />
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-semibold tracking-tight">Recent posts</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((post) => (
              <BlogCard key={post.slug} {...post} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/blog/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { BlogCard } from "@/components/blog-card";
import Link from "next/link";

const posts = [
  {
    slug: "getting-started-with-content",
    title: "Getting started with content-first design",
    excerpt: "How to structure a blog for readability and engagement.",
    date: "2026-03-10",
    author: "Alex",
    category: "Design",
  },
  {
    slug: "typography-for-readers",
    title: "Typography choices that make readers stay",
    excerpt: "Font sizes, line heights, and spacing for long-form content.",
    date: "2026-03-08",
    author: "Alex",
    category: "Design",
  },
  {
    slug: "building-a-blog",
    title: "Building a blog from scratch",
    excerpt: "A step-by-step guide to setting up a modern blog.",
    date: "2026-03-05",
    author: "Alex",
    category: "Tutorial",
  },
];

export default function BlogPage() {
  return (
    <div className="px-6 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-4xl space-y-12">
        <div className="space-y-3">
          <Badge variant="secondary" className="rounded-full">All posts</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
          <p className="text-muted-foreground">
            Articles, updates, and thoughts. Replace the placeholder content with your own posts.
          </p>
        </div>

        <div className="space-y-4">
          {posts.map((post) => (
            <BlogCard key={post.slug} {...post} />
          ))}
        </div>

        <div className="flex justify-center">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/blog/[slug]/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";

const posts: Record<string, { title: string; excerpt: string; date: string; author: string; category: string; body: string }> = {
  "getting-started-with-content": {
    title: "Getting started with content-first design",
    excerpt: "How to structure a blog for readability and engagement.",
    date: "2026-03-10",
    author: "Alex",
    category: "Design",
    body: "This is a placeholder for the full article body. Replace with real content. The scaffold provides a structure for metadata (date, author, category), a main heading, and a prose area for the article body.",
  },
  "typography-for-readers": {
    title: "Typography choices that make readers stay",
    excerpt: "Font sizes, line heights, and spacing for long-form content.",
    date: "2026-03-08",
    author: "Alex",
    category: "Design",
    body: "Placeholder content. Use this layout to structure your post: title, metadata, and a readable body. Add prose classes for typography.",
  },
  "building-a-blog": {
    title: "Building a blog from scratch",
    excerpt: "A step-by-step guide to setting up a modern blog.",
    date: "2026-03-05",
    author: "Alex",
    category: "Tutorial",
    body: "Placeholder. Replace with your article content. Keep the metadata structure and layout.",
  },
};

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts[slug];

  if (!post) {
    notFound();
  }

  return (
    <article className="px-6 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-4">
          <Link
            href="/blog"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to blog
          </Link>
          <Badge variant="secondary" className="rounded-full">{post.category}</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{post.title}</h1>
          <p className="text-muted-foreground">
            {post.date} · {post.author}
          </p>
        </div>

        <div className="space-y-4 rounded-3xl border bg-card/60 p-6">
          <p className="text-lg leading-8">{post.body}</p>
        </div>
      </div>
    </article>
  );
}
`,
    },
    {
      path: "components/blog-card.tsx",
      content: `import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

type BlogCardProps = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  featured?: boolean;
};

export function BlogCard({ slug, title, excerpt, date, author, category, featured }: BlogCardProps) {
  return (
    <Link href={\`/blog/\${slug}\`}>
      <Card
        className={\`overflow-hidden transition-all hover:border-primary/30 hover:shadow-md \${featured ? "rounded-2xl" : "rounded-xl"}\`}
      >
        <CardContent className={\`space-y-4 \${featured ? "p-6" : "p-5"}\`}>
          <div className="flex items-center justify-between gap-3">
            <Badge variant="secondary" className="rounded-full">{category}</Badge>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
          <div className="space-y-2">
            <h2 className={\`font-semibold tracking-tight \${featured ? "text-xl" : "text-lg"}\`}>
              {title}
            </h2>
            <p className="text-sm text-muted-foreground line-clamp-2">{excerpt}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{author}</span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
`,
    },
    {
      path: "components/site-header.tsx",
      content: `"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Blog", href: "/blog" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight">
          Blog
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          aria-label="Öppna meny"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="border-t bg-background px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
`,
    },
    {
      path: "components/site-footer.tsx",
      content: `import Link from "next/link";

const links = {
  Blog: ["All posts", "Categories"],
  Connect: ["Email", "LinkedIn", "Twitter"],
};

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-4xl border bg-card/80 p-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">Blog</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            A content-first blog starter. Adapt the categories, authors, and post structure to your topic.
          </p>
        </div>
        {Object.entries(links).map(([title, items]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {items.map((item) => (
                <Link key={item} href="#" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {item}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}
`,
    },
  ],
};
