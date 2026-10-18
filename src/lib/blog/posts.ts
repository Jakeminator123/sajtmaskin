/**
 * Published blog posts. Empty until editorial content exists.
 *
 * Sitemap and `/blogg` robots follow this list: noindex + omit from sitemap
 * while empty; indexable again as soon as a post is added here.
 */
export type PublishedBlogPost = {
  slug: string;
  title: string;
};

export const PUBLISHED_BLOG_POSTS: readonly PublishedBlogPost[] = [];

export function hasPublishedBlogPosts(
  posts: readonly PublishedBlogPost[] = PUBLISHED_BLOG_POSTS,
): boolean {
  return posts.length > 0;
}
