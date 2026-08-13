import { Badge } from "@/components/ui/badge";
import { BlogCard } from "@/components/blog-card";
import Link from "next/link";

const posts = [
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
  {
    slug: "building-a-blog",
    title: "Bygg en blogg från grunden",
    excerpt: "En steg-för-steg-guide till en modern blogg.",
    date: "2026-03-05",
    author: "Alex",
    category: "Guide",
  },
];

export default function BlogPage() {
  return (
    <div className="px-6 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-4xl space-y-12">
        <div className="space-y-3">
          <Badge variant="secondary" className="rounded-full">Alla inlägg</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Blogg</h1>
          <p className="text-muted-foreground">
            Artiklar, uppdateringar och tankar. Byt ut platshållarinnehållet mot dina egna inlägg.
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
            Tillbaka till startsidan
          </Link>
        </div>
      </div>
    </div>
  );
}
