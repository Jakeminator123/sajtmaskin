export const siteConfig = {
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
  blogId: process.env.NEXT_PUBLIC_BLOG_ID || "",
  organization: process.env.NEXT_PUBLIC_BLOG_ORGANIZATION || "",
  title: process.env.NEXT_PUBLIC_BLOG_TITLE || "",
  description: process.env.NEXT_PUBLIC_BLOG_DESCRIPTION || "",
};

export function assertSiteConfig() {
  const required = [
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_BLOG_ID",
    "NEXT_PUBLIC_BLOG_ORGANIZATION",
    "NEXT_PUBLIC_BLOG_TITLE",
    "NEXT_PUBLIC_BLOG_DESCRIPTION",
  ] as const;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
