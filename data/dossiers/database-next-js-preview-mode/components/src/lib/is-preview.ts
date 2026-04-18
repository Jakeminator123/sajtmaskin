import type { GetServerSidePropsContext, GetStaticPropsContext } from 'next';

export function isPreviewContext(
  context: GetStaticPropsContext | GetServerSidePropsContext,
): boolean {
  return Boolean('draftMode' in context ? context.draftMode : context.preview);
}
