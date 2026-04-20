import { notFound } from "next/navigation";
import { glideFetch } from "@/components/lib/glide";

type GlidePage = {
  title?: string;
  html?: string;
  seo?: {
    title?: string;
    description?: string;
  };
};

async function getPage(slug: string[]) {
  const path = `/${slug.join("/")}`;
  return glideFetch<GlidePage | null>(`/pages?path=${encodeURIComponent(path)}`);
}

export async function generateMetadata({ params }: { params: { slug: string[] } }) {
  const page = await getPage(params.slug);
  if (!page) return {};

  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description,
  };
}

export default async function CatchAllPage({ params }: { params: { slug: string[] } }) {
  const page = await getPage(params.slug);

  if (!page) notFound();

  return (
    <main>
      {page.title ? <h1>{page.title}</h1> : null}
      {page.html ? (
        <article dangerouslySetInnerHTML={{ __html: page.html }} />
      ) : null}
    </main>
  );
}
