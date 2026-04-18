export const config = {
  blogId: process.env.NEXT_PUBLIC_BLOG_ID ?? "",
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  blogOrganization: process.env.NEXT_PUBLIC_BLOG_ORGANIZATION ?? "",
  blogTitle: process.env.NEXT_PUBLIC_BLOG_TITLE ?? "",
  blogDescription: process.env.NEXT_PUBLIC_BLOG_DESCRIPTION ?? "",
};

if (!config.blogId) {
  throw new Error("Missing NEXT_PUBLIC_BLOG_ID");
}
