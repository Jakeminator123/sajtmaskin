import { glideConfig, glideFetch } from "@/components/lib/glide";

export async function generateStaticParams() {
  if (!glideConfig.pregeneratePaths) return [];

  const paths = await glideFetch<string[]>("/paths");

  return paths
    .filter((path) => path && path !== "/")
    .map((path) => ({ slug: path.replace(/^\//, "").split("/") }));
}
