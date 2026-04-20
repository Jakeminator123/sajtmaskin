import { wisp } from "@/lib/wisp";
import { siteConfig } from "@/lib/site-config";
import RSS from "rss";

export async function GET() {
  const posts = await wisp.getPosts({ limit: 100 });

  const feed = new RSS({
    title: siteConfig.title,
    description: siteConfig.description,
    site_url: siteConfig.baseUrl,
    feed_url: `${siteConfig.baseUrl}/rss.xml`,
    language: "en",
  });

  for (const post of posts.posts) {
    feed.item({
      title: post.title,
      description: post.description || "",
      url: `${siteConfig.baseUrl}/blog/${post.slug}`,
      guid: post.id,
      date: post.publishedAt || post.updatedAt || new Date().toISOString(),
    });
  }

  return new Response(feed.xml({ indent: true }), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
