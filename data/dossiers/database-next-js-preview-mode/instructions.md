# When to use

Use this dossier when the site fetches content from a CMS, database, or API and editors need to see unpublished changes before publishing.

This is most useful for:
- blogs and content sites with draft posts
- ecommerce product previews before launch
- marketing pages edited in a headless CMS
- admin/editorial flows where a preview link should open the real frontend

This dossier covers the Next.js preview handshake only. It does **not** define a CMS schema or draft persistence model.

# How to integrate

## 1) Add a secure preview entry route

Create an API route that validates a shared secret, enables preview mode, and redirects to the requested page.

```ts
// pages/api/preview.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = req.query.secret;
  const slug = typeof req.query.slug === 'string' ? req.query.slug : '/';

  if (!process.env.PREVIEW_SECRET) {
    return res.status(500).json({ message: 'PREVIEW_SECRET is not configured' });
  }

  if (secret !== process.env.PREVIEW_SECRET) {
    return res.status(401).json({ message: 'Invalid preview token' });
  }

  res.setPreviewData({});
  res.writeHead(307, { Location: slug });
  res.end();
}
```

Required env var:

```env
PREVIEW_SECRET=replace-with-a-long-random-string
```

A CMS preview URL usually looks like:

```txt
https://your-site.com/api/preview?secret=YOUR_SECRET&slug=/posts/hello-world
```

## 2) Keep an exit route

Use the existing exit route to clear preview cookies.

```ts
// pages/api/exit.tsx
import type { NextApiRequest, NextApiResponse } from 'next';

export default (req: NextApiRequest, res: NextApiResponse) => {
  res.clearPreviewData();
  res.writeHead(307, { Location: '/' });
  res.end();
};
```

If you want to return the user to the current page instead of `/`, accept a `slug` or `next` query param and validate it is an internal path before redirecting.

## 3) Fetch draft data when preview is enabled

In the Pages Router, Next.js passes preview state into data fetching methods.

```ts
// pages/posts/[slug].tsx
import type { GetStaticProps, GetStaticPaths } from 'next';

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const slug = context.params?.slug as string;
  const isPreview = Boolean(context.preview);

  const post = await fetchPostBySlug(slug, { draft: isPreview });

  if (!post) {
    return { notFound: true };
  }

  return {
    props: {
      post,
      preview: isPreview,
    },
    revalidate: 60,
  };
};
```

For newer codepaths that use `draftMode`, keep the fetch logic equivalent: when draft mode is enabled, query unpublished content from the CMS or database.

Compatibility helper:

```ts
// lib/is-preview.ts
import type { GetServerSidePropsContext, GetStaticPropsContext } from 'next';

export function isPreviewContext(
  context: GetStaticPropsContext | GetServerSidePropsContext,
): boolean {
  return Boolean('draftMode' in context ? context.draftMode : context.preview);
}
```

## 4) Show a visible preview banner

Editors should always know when they are viewing draft content.

```tsx
export function PreviewBanner() {
  return (
    <div style={{ padding: '8px 12px', background: '#111', color: '#fff' }}>
      Preview mode enabled. <a href="/api/exit">Exit preview</a>
    </div>
  );
}
```

Render it when preview is active.

```tsx
{preview ? <PreviewBanner /> : null}
```

## 5) Validate redirect targets

If your CMS sends arbitrary slugs, only redirect to internal paths.

```ts
function normalizeInternalSlug(input: string | undefined) {
  if (!input || !input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}
```

Use this before `Location: slug` to avoid open redirects.

# UX rules

- Always show a clear preview/draft indicator.
- Always provide a one-click way to exit preview mode.
- Preview pages should use the same layout and routing as published pages.
- Draft fetches should be server-side and authenticated through your backend or CMS token flow, not from browser-exposed secrets.
- If preview content is missing, show a clear not-found or unavailable state rather than silently falling back to published content.

# Avoid

- Do not keep the demo `save.tsx` S3 snapshot route unless the product explicitly needs snapshot persistence and shareable saved previews.
- Do not enable preview mode without validating a secret token.
- Do not redirect to arbitrary external URLs from preview or exit handlers.
- Do not expose CMS draft tokens to the client.
- Do not let preview mode alter normal published caching behavior for non-preview users.

# Verification

1. Set `PREVIEW_SECRET` locally.
2. Start the app and open:

```txt
/api/preview?secret=YOUR_SECRET&slug=/
```

3. Confirm the response redirects to the requested page.
4. Confirm preview cookies are set in the browser.
5. Confirm the page renders draft/unpublished data instead of published-only data.
6. Confirm a preview banner or equivalent UI is visible.
7. Open `/api/exit`.
8. Confirm preview cookies are cleared and the site returns to published data.
9. Confirm invalid secrets return `401`.
10. Confirm malformed redirect targets do not allow external redirects.
