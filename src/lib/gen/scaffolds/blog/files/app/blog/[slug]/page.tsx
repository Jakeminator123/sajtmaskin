import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";

const posts: Record<string, { title: string; excerpt: string; date: string; author: string; category: string; body: string }> = {
  "getting-started-with-content": {
    title: "Kom igång med innehållsdriven design",
    excerpt: "Så strukturerar du en blogg för läsbarhet och engagemang.",
    date: "2026-03-10",
    author: "Alex",
    category: "Design",
    body: "Det här är en platshållare för hela artikeltexten. Byt ut mot riktigt innehåll. Scaffolden ger dig struktur för metadata (datum, författare, kategori), en huvudrubrik och ett prose-område för brödtexten.",
  },
  "typography-for-readers": {
    title: "Typografi som får läsare att stanna kvar",
    excerpt: "Teckenstorlekar, radavstånd och marginaler för längre texter.",
    date: "2026-03-08",
    author: "Alex",
    category: "Design",
    body: "Platshållarinnehåll. Använd den här layouten för att strukturera ditt inlägg: titel, metadata och en läsbar brödtext. Lägg till prose-klasser för typografi.",
  },
  "building-a-blog": {
    title: "Bygg en blogg från grunden",
    excerpt: "En steg-för-steg-guide till en modern blogg.",
    date: "2026-03-05",
    author: "Alex",
    category: "Guide",
    body: "Platshållare. Byt ut mot ditt artikelinnehåll. Behåll metadatastrukturen och layouten.",
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
            Tillbaka till bloggen
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
