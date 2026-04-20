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

async function getHomePage() {
  return glideFetch<GlidePage | null>(`/pages?path=${encodeURIComponent("/")}`);
}

export async function generateMetadata() {
  const page = await getHomePage();
  if (!page) return {};

  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description,
  };
}

export default async function HomePage() {
  const page = await getHomePage();

  if (!page) notFound();

  return (
    <main>
      {page.title ? <h1>{page.title}</h1> : null}
      {page.html ? <article dangerouslySetInnerHTML={{ __html: page.html }} /> : null}
    </main>
  );
}
