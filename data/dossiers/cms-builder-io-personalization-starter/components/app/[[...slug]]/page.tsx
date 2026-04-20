import { notFound } from 'next/navigation';
import { RenderBuilderContent } from './render-builder-content';
import { builder } from '../../lib/builder';

type PageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toPath(slug?: string[]) {
  if (!slug || slug.length === 0) return '/';
  return `/${slug.join('/')}`;
}

function getTargeting(searchParams: Record<string, string | string[] | undefined>) {
  return {
    urlPath: searchParams.urlPath,
    userAttributes: {
      urlPath: typeof searchParams.urlPath === 'string' ? searchParams.urlPath : undefined,
      device: typeof searchParams.device === 'string' ? searchParams.device : undefined,
      segment: typeof searchParams.segment === 'string' ? searchParams.segment : undefined,
    },
  };
}

export default async function BuilderPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const urlPath = toPath(slug);

  const content = await builder
    .get('page', {
      userAttributes: {
        urlPath,
        device:
          typeof resolvedSearchParams.device === 'string'
            ? resolvedSearchParams.device
            : undefined,
        segment:
          typeof resolvedSearchParams.segment === 'string'
            ? resolvedSearchParams.segment
            : undefined,
      },
      prerender: false,
    })
    .toPromise();

  if (!content) {
    notFound();
  }

  return <RenderBuilderContent model="page" content={content} />;
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const urlPath = toPath(slug);

  const content = await builder
    .get('page', {
      userAttributes: { urlPath },
      fields: 'data.title,data.description',
      prerender: false,
    })
    .toPromise();

  return {
    title: content?.data?.title,
    description: content?.data?.description,
  };
}
