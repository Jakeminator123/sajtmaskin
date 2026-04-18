# When to use

Use this dossier for a content-driven help center, docs site, or knowledge base whose pages and navigation are managed in Headlesshost.

Choose it when you need:
- Server-side fetching of documentation content from Headlesshost
- Support for published vs staging/head instances
- Structured navigation, guide, common site data, authors, and page content
- Search backed by the Headlesshost API

Do not use it for a marketing site with mostly hardcoded content, or if content is managed in another CMS.

# How to integrate

## 1) Set environment variables

Add the required site id:

```env
HEADLESSHOST_SITEID=your_site_id
```

The integration expects this variable on the server. If it is missing, API calls will fail.

## 2) Add the server-side API module

Keep the Headlesshost fetch helpers in a server-only module such as `app/lib/api.ts`:

```ts
"use server";
import { revalidateTag } from "next/cache";
import { Author, PagedResponse, ProductionSlug } from "./types";

export async function getClientConfig(): Promise<{ siteId: string }> {
  return {
    siteId: process.env.HEADLESSHOST_SITEID || "",
  };
}

async function getInstanceUrl(instanceId: string) {
  const res = await fetch(
    `https://api.headlesshost.com/sites/${process.env.HEADLESSHOST_SITEID}/list`,
    { next: { tags: [instanceId, "list"] } }
  );
  if (res.status !== 200) throw new Error("Failed to fetch site list");
  const siteList = await res.json();

  if (!siteList.publishedSites || !siteList.stagingSites) {
    throw new Error("Invalid site list response");
  }

  if (instanceId === ProductionSlug && siteList?.publishedSites?.length > 0) {
    return `https://api.headlesshost.com/sites/${process.env.HEADLESSHOST_SITEID}`;
  }

  const siteIds = [
    ...siteList.publishedSites.map((site: any) => site.id),
    ...siteList.stagingSites.map((site: any) => site.id),
  ];

  if (siteIds.includes(instanceId)) {
    return `https://api.headlesshost.com/sites/${process.env.HEADLESSHOST_SITEID}/instance/${instanceId}`;
  }

  const headStaging = siteList.stagingSites.find((site: any) => site.isHead);
  return `https://api.headlesshost.com/sites/${process.env.HEADLESSHOST_SITEID}/instance/${headStaging.id}`;
}

export async function getAuthors(instanceId: string): Promise<PagedResponse<Author>> {
  const res = await fetch(`${await getInstanceUrl(instanceId)}/catalogs/AUTHORS`, {
    next: { tags: [instanceId, "catalogs", "authors"] },
  });
  if (res.status !== 200) throw new Error("Failed to fetch authors");
  return res.json();
}

export async function getGuide(instanceId: string) {
  const res = await fetch(`${await getInstanceUrl(instanceId)}/guide`, {
    next: { tags: [instanceId, "guide"] },
  });
  if (res.status !== 200) throw new Error("Failed to fetch guide");
  return res.json();
}

export async function getMap(instanceId: string) {
  const res = await fetch(`${await getInstanceUrl(instanceId)}/map`, {
    next: { tags: [instanceId, "map"] },
  });
  if (res.status !== 200) throw new Error("Failed to fetch map");
  return res.json();
}

export async function getCommon(instanceId: string) {
  const res = await fetch(`${await getInstanceUrl(instanceId)}/common`, {
    next: { tags: [instanceId, "common"] },
  });
  if (res.status !== 200) throw new Error("Failed to fetch common");
  return res.json();
}

export async function getPage(page: string, instanceId: string) {
  const res = await fetch(`${await getInstanceUrl(instanceId)}/pages/${page}`, {
    next: { tags: [instanceId, "pages", page] },
  });
  if (res.status !== 200) throw new Error("Failed to fetch page");
  return res.json();
}

export async function getSearchResults(term: string, instanceId: string) {
  const res = await fetch(
    `${await getInstanceUrl(instanceId)}/search?text=${encodeURIComponent(term)}`,
    { cache: "no-store" }
  );
  if (res.status !== 200) throw new Error("Failed to execute search");
  return res.json();
}

export async function clearCache(tag: string) {
  revalidateTag(tag);
}
```

## 3) Keep shared Headlesshost types

Use shared types for content contracts so your app code stays consistent:

```ts
export interface NavigationLink {
  title: string;
  slug: string;
  target: string;
}

export interface LinkGroup {
  group: string;
  links: NavigationLink[];
}

export interface Globals {
  content: {
    links?: LinkGroup[];
  };
}

export interface PagedResponse<T> {
  result: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Author {
  id: string;
  cid: string;
  content: {
    name: string;
    email: string;
    role: string;
    phone: string;
    image: ImageDetails;
  };
}

export interface ImageDetails {
  url: string;
  width: number;
  height: number;
  id: string;
}

export const ProductionSlug = "knowledgebase";
```

## 4) Fetch content in Server Components

Prefer fetching Headlesshost content in server components, pages, or route handlers.

Example page:

```tsx
import { getCommon, getGuide, getMap, getPage } from "@/app/lib/api";

export default async function DocsPage() {
  const instanceId = "knowledgebase";

  const [common, guide, map, page] = await Promise.all([
    getCommon(instanceId),
    getGuide(instanceId),
    getMap(instanceId),
    getPage("getting-started", instanceId),
  ]);

  return (
    <main>
      <h1>{page?.content?.title ?? "Documentation"}</h1>
      <pre>{JSON.stringify({ common, guide, map, page }, null, 2)}</pre>
    </main>
  );
}
```

## 5) Use tagged fetches for cache-aware content refresh

The API module already tags cached requests by instance and resource type. If you add on-demand refresh flows, revalidate the same tags.

Example server action:

```ts
"use server";
import { clearCache } from "@/app/lib/api";

export async function refreshKnowledgebase(instanceId: string) {
  await clearCache(instanceId);
  await clearCache("guide");
  await clearCache("map");
  await clearCache("common");
}
```

If you refine this pattern, make sure the invalidated tags exactly match the tags used in `fetch(..., { next: { tags } })`.

## 6) Add search as a dynamic request path

Search should remain uncached because it depends on live query input.

Example server action or route usage:

```ts
import { getSearchResults } from "@/app/lib/api";

export async function searchDocs(term: string) {
  const instanceId = "knowledgebase";
  if (!term.trim()) return [];
  return getSearchResults(term, instanceId);
}
```

# UX rules

- Render documentation navigation from `getMap()` or `getCommon()` instead of hardcoding sidebar links.
- Keep docs pages readable: constrained width, clear heading hierarchy, visible active navigation state.
- Search should debounce on the client, but data fetching should stay server-aware and no-store for results.
- If Headlesshost content is unavailable, show a graceful empty/error state rather than a broken page.
- Support published content by default with `ProductionSlug`, and only expose staging/head instances in admin or preview contexts.
- Preserve canonical page slugs from Headlesshost; avoid inventing a parallel routing taxonomy unless required.

# Avoid

- Do not keep template-specific root layout metadata, fonts, or branding as part of the integration contract.
- Do not move Headlesshost API calls into unrestricted client components; keep secrets and instance resolution on the server.
- Do not cache search responses with static tags.
- Do not assume every response includes every field; defensive rendering is required.
- Do not hardcode a fallback instance URL without first checking the site list and head staging instance.
- Do not treat this as a generic CMS abstraction; the fetch endpoints and instance resolution logic are Headlesshost-specific.

# Verification

- Confirm `HEADLESSHOST_SITEID` is set in the deployment environment.
- Load a docs route that calls `getGuide()` and `getPage()` successfully on the server.
- Verify navigation data from `getMap()` or `getCommon()` renders real Headlesshost links.
- Verify production instance resolution works with `instanceId = "knowledgebase"`.
- Verify search requests return live results and are not cached across queries.
- Verify the app handles missing or malformed API responses with a user-friendly fallback.
- If using revalidation, verify that invalidating a tag causes fresh content to appear on the next request.
