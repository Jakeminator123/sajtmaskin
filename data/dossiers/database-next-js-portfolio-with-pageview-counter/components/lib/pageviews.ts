import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function getPageViews(slug: string) {
  const key = ["pageviews", slug].join(":");
  return (await redis.get<number>(key)) ?? 0;
}

export async function getPageViewsBatch(slugs: string[]) {
  if (slugs.length === 0) return {} as Record<string, number>;

  const keys = slugs.map((slug) => ["pageviews", slug].join(":"));
  const values = await redis.mget<number[]>(...keys);

  return slugs.reduce<Record<string, number>>((acc, slug, index) => {
    acc[slug] = values[index] ?? 0;
    return acc;
  }, {});
}
