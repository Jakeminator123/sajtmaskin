import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { SHOPIFY_GRAPHQL_API_ENDPOINT, TAGS } from "./constants";
import { ensureStartsWith, validateEnvironmentVariables } from "./utils";

validateEnvironmentVariables();

const storeDomain = ensureStartsWith(
  process.env.SHOPIFY_STORE_DOMAIN!,
  "https://",
);

const endpoint = `${storeDomain}${SHOPIFY_GRAPHQL_API_ENDPOINT}`;

export async function shopifyFetch<T>({
  query,
  variables,
  cache = "force-cache",
  tags,
}: {
  query: string;
  variables?: Record<string, unknown>;
  cache?: RequestCache;
  tags?: string[];
}): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token":
        process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
    cache,
    next: tags?.length ? { tags } : undefined,
  });

  if (!res.ok) {
    throw new Error(`Shopify request failed with status ${res.status}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error("Shopify GraphQL returned errors");
  }

  return json.data;
}

export async function revalidate(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get("secret");

  if (!process.env.SHOPIFY_REVALIDATION_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Missing SHOPIFY_REVALIDATION_SECRET" },
      { status: 500 },
    );
  }

  if (secret !== process.env.SHOPIFY_REVALIDATION_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Invalid secret" },
      { status: 401 },
    );
  }

  let body: unknown = null;

  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const candidateTags = new Set<string>([TAGS.collections, TAGS.products]);

  const topic =
    typeof req.headers.get("x-shopify-topic") === "string"
      ? req.headers.get("x-shopify-topic")
      : null;

  if (topic?.includes("carts")) {
    candidateTags.add(TAGS.cart);
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const tag = record.tag;
    const tags = record.tags;

    if (typeof tag === "string") candidateTags.add(tag);
    if (Array.isArray(tags)) {
      for (const value of tags) {
        if (typeof value === "string") candidateTags.add(value);
      }
    }
  }

  for (const tag of candidateTags) {
    revalidateTag(tag);
  }

  return NextResponse.json({ ok: true, revalidated: Array.from(candidateTags) });
}
