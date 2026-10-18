import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AddToCart } from "../../../components/add-to-cart";
import { ProductCard } from "../../../components/product-card";
import { categories, findProduct, formatPrice, products } from "../../../lib/product-catalog";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = findProduct(id);
  if (!product) notFound();
  const category = categories.find((item) => item.slug === product.categorySlug);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <div className="bg-muted relative aspect-square">
            <Image src={product.image} alt={product.name} fill className="object-cover" />
          </div>
        </Card>
        <div className="space-y-6">
          <div className="space-y-3">
            <Badge variant="outline" className="rounded-full">
              {category?.name}
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
            <p className="text-2xl font-semibold">{formatPrice(product.priceMinor)} (demopris)</p>
            <p className="text-muted-foreground">{product.description}</p>
            <p className="text-muted-foreground text-sm">
              Exempelprodukt — produktdata, lager och leveransvillkor behöver verifieras.
            </p>
          </div>
          <AddToCart productId={id} />
          <Button type="button" size="lg" variant="outline" disabled>
            Köp nu (betalning inte ansluten)
          </Button>
          <Link
            href="/products"
            className="text-muted-foreground inline-flex text-sm hover:underline"
          >
            Tillbaka till produkter
          </Link>
        </div>
      </div>
      <section className="mt-16 space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Relaterade exempelprodukter</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products
            .filter((item) => item.id !== id)
            .slice(0, 3)
            .map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
        </div>
      </section>
    </div>
  );
}
