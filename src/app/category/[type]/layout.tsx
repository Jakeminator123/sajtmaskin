import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicPageAlternates } from "@/lib/public-canonical-url";
import { V0_CATEGORIES } from "@/lib/templates/template-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const category = V0_CATEGORIES[type];
  return {
    title: category?.title ?? "Templates",
    description: category?.description,
    alternates: publicPageAlternates(`/category/${type}`),
  };
}

export default function CategoryLayout({ children }: { children: ReactNode }) {
  return children;
}
