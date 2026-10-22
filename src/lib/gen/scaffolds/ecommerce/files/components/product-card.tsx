import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { AddToCart } from "./add-to-cart";
import { categories, formatPrice, type DemoProduct } from "../lib/product-catalog";

export function ProductCard({ product }: { product: DemoProduct }) {
  const category = categories.find((item) => item.slug === product.categorySlug);
  return (
    <Card className="overflow-hidden">
      <Link href={`/product/${product.id}`} className="group">
        <div className="bg-muted relative aspect-square overflow-hidden">
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
          />
        </div>
        <CardContent className="space-y-2 p-4">
          <p className="text-muted-foreground text-xs">{category?.name}</p>
          <p className="font-medium">{product.name}</p>
          <p className="text-muted-foreground text-sm">
            {formatPrice(product.priceMinor)} (demopris)
          </p>
        </CardContent>
      </Link>
      <div className="px-4 pb-4">
        <AddToCart productId={product.id} />
      </div>
    </Card>
  );
}
