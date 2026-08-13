import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen } from "lucide-react";
import { BlogCard } from "@/components/blog-card";
import Link from "next/link";

const featured = [
  {
    slug: "getting-started-with-content",
    title: "Kom igång med innehållsdriven design",
    excerpt: "Så strukturerar du en blogg för läsbarhet och engagemang.",
    date: "2026-03-10",
    author: "Alex",
    category: "Design",
  },
  {
    slug: "typography-for-readers",
    title: "Typografi som får läsare att stanna kvar",
    excerpt: "Teckenstorlekar, radavstånd och marginaler för längre texter.",
    date: "2026-03-08",
    author: "Alex",
    category: "Design",
  },
];

const recent = [
  {
    slug: "building-a-blog",
    title: "Bygg en blogg från grunden",
    excerpt: "En steg-för-steg-guide till en modern blogg.",
    date: "2026-03-05",
    author: "Alex",
    category: "Guide",
  },
];

export default function HomePage() {
  return (
    <div className="px-6 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl space-y-16">
        <section className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <Badge className="rounded-full px-3 py-1">Bloggstart</Badge>
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
                En blogg med tydlig struktur för artiklar och läsning
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                Den här scaffolden ger dig en startsida med utvalda inlägg, en artikellista och en layout för inlägg.
                Anpassa innehållet och kategorierna efter ditt ämne.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/blog">
                Visa alla inlägg <ArrowRight className="ml-2 h-4 w-4" />
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
            <h2 className="text-2xl font-semibold tracking-tight">Senaste inläggen</h2>
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
