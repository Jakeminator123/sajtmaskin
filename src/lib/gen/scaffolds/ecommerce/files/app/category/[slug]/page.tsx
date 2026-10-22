import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductCard } from "../../../components/product-card";
import { categories, products } from "../../../lib/product-catalog";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
          <p className="text-muted-foreground">Exempelprodukter och demopriser i denna kategori.</p>
        </div>
        <Button type="button" variant="outline" className="gap-2" disabled>
          <SlidersHorizontal className="h-4 w-4" />
          Filter (inte anslutet)
        </Button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products
          .filter((product) => product.categorySlug === slug)
          .map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
      </div>
    </div>
  );
}
